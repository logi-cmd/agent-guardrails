use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_agent-guardrails-rs"))
}

struct TempRepo {
    path: PathBuf,
}

impl TempRepo {
    fn new(name: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "agent-guardrails-rs-cli-check-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp repo");
        Self { path }
    }

    fn init_git(&self) {
        git(&self.path, ["init"]);
        git(&self.path, ["config", "user.email", "test@example.com"]);
        git(&self.path, ["config", "user.name", "Agent Guardrails Test"]);
        git(&self.path, ["config", "core.autocrlf", "false"]);
    }

    fn write(&self, relative: &str, content: &str) {
        let path = self.path.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, content).expect("write file");
    }

    fn commit_all(&self, message: &str) {
        git(&self.path, ["add", "."]);
        git(&self.path, ["commit", "-m", message]);
    }

    fn write_required_project_files(&self) {
        self.write("AGENTS.md", "# Agent instructions\n");
        self.write("docs/PROJECT_STATE.md", "# Project state\n");
        self.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    }

    fn write_plugin_fixture(&self) {
        self.write(
            "node_modules/@agent-guardrails/plugin-fixture/package.json",
            &json!({
                "name": "@agent-guardrails/plugin-fixture",
                "version": "1.0.0",
                "type": "module",
                "main": "index.js"
            })
            .to_string(),
        );
        self.write(
            "node_modules/@agent-guardrails/plugin-fixture/index.js",
            r#"export async function getDetectors() {
  return [{
    name: "fixture-detector",
    async run({ context, addFinding }) {
      if (!context.changedFiles.includes("src/service.js")) {
        return;
      }
      addFinding({
        severity: "warning",
        category: "risk",
        code: "plugin-fixture-warning",
        message: "Plugin fixture saw the service change.",
        action: "Review the plugin-provided warning.",
        files: ["src/service.js"]
      });
    }
  }];
}
"#,
        );
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn check_json_runs_rust_pipeline_and_returns_top_level_result() {
    let repo = source_without_tests_repo("json");

    let output = cli()
        .arg("check")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(!output.status.success(), "source-without-tests should fail");
    assert!(output.stderr.is_empty());

    let value: Value = serde_json::from_slice(&output.stdout).expect("valid json");
    assert_eq!(value["ok"], false);
    assert_eq!(value["preset"], "generic");
    assert_eq!(value["diffSource"], "working tree");
    assert_eq!(value["counts"]["changedFiles"], 1);
    assert_eq!(value["counts"]["sourceFiles"], 1);
    assert_eq!(value["counts"]["testFiles"], 0);
    assert_eq!(value["findings"][0]["code"], "source-without-tests");
    assert_eq!(value["scoreVerdict"], "blocked");
}

#[test]
fn check_text_output_summarizes_actions_in_english() {
    let repo = source_without_tests_repo("text-en");

    let output = cli()
        .arg("check")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(!output.status.success(), "source-without-tests should fail");
    assert!(output.stderr.is_empty());

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Agent Guardrails check result"));
    assert!(stdout.contains("Score:"));
    assert!(stdout.contains("Next actions:"));
    assert!(stdout.contains("Findings:"));
    assert!(stdout.contains("source-without-tests"));
    assert!(
        !stdout.trim_start().starts_with('{'),
        "text mode should not print raw JSON"
    );
}

#[test]
fn check_text_output_supports_zh_cn() {
    let repo = source_without_tests_repo("text-zh-cn");

    let output = cli()
        .arg("check")
        .arg("--lang")
        .arg("zh-CN")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(!output.status.success(), "source-without-tests should fail");
    assert!(output.stderr.is_empty());

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Agent Guardrails 检查结果"));
    assert!(stdout.contains("评分:"));
    assert!(stdout.contains("下一步:"));
    assert!(stdout.contains("问题:"));
    assert!(stdout.contains("source-without-tests"));
    assert!(
        !stdout.trim_start().starts_with('{'),
        "text mode should not print raw JSON"
    );
}

#[test]
fn check_review_text_output_includes_review_summary() {
    let repo = source_without_tests_repo("review-text");

    let output = cli()
        .arg("check")
        .arg("--review")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(!output.status.success(), "source-without-tests should fail");
    assert!(output.stderr.is_empty());

    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Review summary:"));
    assert!(stdout.contains("Validation issues: 1"));
    assert!(stdout.contains("Scope issues: 0"));
    assert!(stdout.contains("source-without-tests"));
}

#[test]
fn check_json_accepts_commands_run_evidence_from_cli_args() {
    let repo = TempRepo::new("commands-run");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic"
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update operator note",
            "allowedPaths": ["docs/"],
            "requiredCommands": ["npm test"]
        })
        .to_string(),
    );
    repo.write("docs/note.md", "initial\n");
    repo.commit_all("initial");

    repo.write("docs/note.md", "updated\n");

    let output = cli()
        .arg("check")
        .arg("--json")
        .arg("--commands-run")
        .arg("npm test")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(
        output.status.success(),
        "required command evidence should be accepted: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let value: Value = serde_json::from_slice(&output.stdout).expect("valid json");
    assert_eq!(value["ok"], true);
    assert_eq!(value["counts"]["commandsRun"], 1);
    assert_eq!(value["counts"]["requiredCommands"], 1);
    assert_eq!(value["counts"]["missingRequiredCommands"], 0);
}

#[test]
fn check_json_does_not_treat_declared_evidence_as_scope_drift() {
    let repo = TempRepo::new("declared-evidence-scope");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "testRoots": ["tests"],
                "testExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": true,
                    "requireCommandsReported": false,
                    "requireEvidenceFiles": true
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service value",
            "allowedPaths": ["src/", "tests/"],
            "intendedFiles": ["src/service.js", "tests/service.test.js"],
            "requiredCommands": ["npm test"],
            "evidencePaths": [".agent-guardrails/evidence/current-task.md"]
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write("tests/service.test.js", "export const covered = true;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");
    repo.write(
        "tests/service.test.js",
        "export const covered = \"updated\";\n",
    );
    repo.write(
        ".agent-guardrails/evidence/current-task.md",
        "# Task Evidence\n\n- Commands run: npm test\n- Result: service test passed.\n- Residual risk: low.\n",
    );

    let output = cli()
        .arg("check")
        .arg("--json")
        .arg("--commands-run")
        .arg("npm test")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(
        output.status.success(),
        "declared evidence should not fail scope checks.\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let value: Value = serde_json::from_slice(&output.stdout).expect("valid json");
    assert_eq!(value["counts"]["changedFiles"], 3);
    assert_eq!(value["counts"]["outOfTaskScopeFiles"], 0);
    assert_eq!(value["counts"]["outOfIntendedFiles"], 0);
    assert_eq!(value["counts"]["missingEvidencePaths"], 0);
    assert_eq!(
        value["changedFiles"]
            .as_array()
            .expect("changed files")
            .iter()
            .any(|file| file == ".agent-guardrails/evidence/current-task.md"),
        true
    );
}

#[test]
fn check_json_runs_loaded_javascript_plugins_through_bridge() {
    let repo = TempRepo::new("loaded-plugin");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "languagePlugins": {
                "javascript": ["@agent-guardrails/plugin-fixture"]
            },
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "testRoots": ["tests"],
                "testExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": true
                }
            }
        })
        .to_string(),
    );
    repo.write_plugin_fixture();
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write("tests/service.test.js", "export const covered = true;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");
    repo.write(
        "tests/service.test.js",
        "export const covered = \"updated\";\n",
    );

    let output = cli()
        .arg("check")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(
        output.status.success(),
        "plugin warning should not fail the check.\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let value: Value = serde_json::from_slice(&output.stdout).expect("valid json");
    assert_eq!(value["counts"]["loadedPlugins"], 1);
    assert_eq!(value["counts"]["missingPlugins"], 0);
    assert_eq!(value["plugins"][0]["status"], "loaded");
    assert_eq!(value["plugins"][0]["source"], "package");
    assert_eq!(
        value["findings"]
            .as_array()
            .expect("findings")
            .iter()
            .any(|finding| finding["code"] == "plugin-fixture-warning"),
        true
    );
}

#[test]
fn check_json_preserves_missing_plugin_metadata() {
    let repo = TempRepo::new("missing-plugin");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "languagePlugins": {
                "javascript": ["@agent-guardrails/plugin-missing"]
            },
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "testRoots": ["tests"],
                "testExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": true
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write(
        "tests/service.test.js",
        "export const covered = \"updated\";\n",
    );
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");
    repo.write("tests/service.test.js", "export const covered = true;\n");

    let output = cli()
        .arg("check")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(
        output.status.success(),
        "missing plugin metadata should not fail the OSS baseline.\nstdout:\n{}\nstderr:\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );

    let value: Value = serde_json::from_slice(&output.stdout).expect("valid json");
    assert_eq!(value["counts"]["loadedPlugins"], 0);
    assert_eq!(value["counts"]["missingPlugins"], 1);
    assert_eq!(value["plugins"][0]["status"], "missing");
    assert_eq!(
        value["plugins"][0]["name"],
        "@agent-guardrails/plugin-missing"
    );
}

#[test]
fn check_fails_fast_when_repo_config_is_missing() {
    let repo = TempRepo::new("missing-config");
    repo.init_git();
    repo.write("README.md", "# Example\n");
    repo.commit_all("initial");
    repo.write("README.md", "# Updated\n");

    let output = cli()
        .arg("check")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("run check");

    assert!(!output.status.success(), "missing config should fail");
    assert!(output.stdout.is_empty());
    let stderr = String::from_utf8_lossy(&output.stderr);
    assert!(
        stderr.contains("Missing .agent-guardrails/config.json"),
        "unexpected stderr: {stderr}"
    );
}

fn source_without_tests_repo(name: &str) -> TempRepo {
    let repo = TempRepo::new(name);
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": true
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");
    repo.write("src/service.js", "export const value = 2;\n");
    repo
}

fn git<I, S>(cwd: &Path, args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = Command::new("git")
        .args(args.into_iter().map(|arg| arg.as_ref().to_string()))
        .current_dir(cwd)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git command failed in {}: {}",
        cwd.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}
