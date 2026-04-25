use serde_json::{Value, json};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::time::{SystemTime, UNIX_EPOCH};

fn rust_cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_agent-guardrails-rs"))
}

fn node_cli(repo_root: &Path) -> Command {
    let mut command = Command::new("node");
    command.arg(repo_root.join("bin").join("agent-guardrails.js"));
    command.env("NODE_NO_WARNINGS", "1");
    command
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
            "agent-guardrails-rs-js-parity-{name}-{}-{unique}",
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

    fn write_mock_pro_package(&self) {
        self.write(
            "node_modules/@agent-guardrails/pro/package.json",
            &json!({
                "name": "@agent-guardrails/pro",
                "version": "0.1.0-parity",
                "type": "module",
                "exports": {
                    ".": "./index.js"
                }
            })
            .to_string(),
        );
        self.write(
            "node_modules/@agent-guardrails/pro/index.js",
            r#"
export async function enrichReview(review) {
  return {
    ...review,
    goLiveDecision: {
      verdict: 'hold',
      riskTier: 'medium',
      why: ['Validation proof is missing.'],
      evidenceGaps: ['npm test output'],
      nextBestActions: ['Run npm test and save the output.']
    },
    goLiveReport: {
      state: 'ready',
      nextAction: { command: 'agent-guardrails pro report' }
    },
    proofPlan: {
      cheapestNextProof: {
        title: 'Run the validation proof',
        command: 'npm test',
        learnedEvidence: {
          source: 'repo-memory',
          command: 'npm test',
          summary: 'npm test usually closes validation proof for this repo.',
          effectiveScore: 88,
          recommendationScore: 91,
          confidenceLevel: 'medium',
          applicabilityScore: 0.9,
          freshnessPenalty: 0.1,
          memoryHealthPenalty: 0,
          scoreReason: 'Matched validation proof surface.'
        }
      },
      proofWorkbench: {
        nextAction: 'Run npm test and save the output.',
        recommendationScore: 91,
        confidenceLevel: 'medium',
        memoryContext: {
          state: 'active',
          summary: 'Recent proof memory applies.',
          appliedAt: '2026-04-24T00:00:00.000Z',
          archivedCount: 1,
          archivedCommands: ['npm run old-test'],
          reasons: ['stale'],
          goLiveImpact: 'Raises the proof bar for this change.'
        }
      }
    }
  };
}
"#,
        );
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
fn rust_check_json_matches_node_for_core_source_without_tests_contract() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("source-without-tests");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
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

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["changedFiles"],
        node.value["counts"]["changedFiles"]
    );
    assert_eq!(
        rust.value["counts"]["sourceFiles"],
        node.value["counts"]["sourceFiles"]
    );
    assert_eq!(
        rust.value["counts"]["testFiles"],
        node.value["counts"]["testFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "stable finding codes should match"
    );
    assert_eq!(
        top_level_keys(&rust.value),
        top_level_keys(&node.value),
        "top-level JSON keys should match the Node contract"
    );
}

#[test]
fn rust_check_json_matches_node_for_loaded_plugin_bridge() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("loaded-plugin");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
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

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["loadedPlugins"],
        node.value["counts"]["loadedPlugins"]
    );
    assert_eq!(
        rust.value["counts"]["missingPlugins"],
        node.value["counts"]["missingPlugins"]
    );
    assert_eq!(rust.value["plugins"], node.value["plugins"]);
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "loaded plugin finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"plugin-fixture-warning".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_base_ref_fallback_warning() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("base-ref-fallback");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .arg("--base-ref")
            .arg("origin/main")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .arg("--base-ref")
            .arg("origin/main")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["changedFiles"],
        node.value["counts"]["changedFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "fallback warning code should match"
    );
    assert!(finding_codes(&rust.value).contains(&"base-ref-fallback".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_task_scope_violation() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("task-scope");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/", "docs/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"]
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service only",
            "allowedPaths": ["src/"]
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write("docs/note.md", "initial\n");
    repo.commit_all("initial");

    repo.write("docs/note.md", "changed outside task\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["outOfTaskScopeFiles"],
        node.value["counts"]["outOfTaskScopeFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "task scope finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"task-path-violation".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_required_command_and_evidence_gaps() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("required-gaps");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service with proof",
            "allowedPaths": ["src/"],
            "requiredCommands": ["npm test"],
            "evidencePaths": [".agent-guardrails/evidence/current-task.md"]
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["missingRequiredCommands"],
        node.value["counts"]["missingRequiredCommands"]
    );
    assert_eq!(
        rust.value["counts"]["missingEvidencePaths"],
        node.value["counts"]["missingEvidencePaths"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "required command/evidence finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"missing-required-commands".to_string()));
    assert!(finding_codes(&rust.value).contains(&"missing-evidence-files".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_protected_area_missing_review_notes() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("protected-area");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "protectedAreas": [
                {
                    "path": "src/payments/",
                    "label": "Payments",
                    "requiresReviewNotes": true,
                    "action": "Explain payment-flow risk before shipping."
                }
            ],
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write("src/payments/charge.js", "export const charge = () => 1;\n");
    repo.commit_all("initial");

    repo.write("src/payments/charge.js", "export const charge = () => 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["protectedAreaMatches"],
        node.value["counts"]["protectedAreaMatches"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "protected-area finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"protected-area-touched".to_string()));
    assert!(
        finding_codes(&rust.value).contains(&"protected-area-missing-review-notes".to_string())
    );
}

#[test]
fn rust_check_json_matches_node_for_repo_allowed_path_violation() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("repo-scope");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"]
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write("docs/note.md", "initial\n");
    repo.commit_all("initial");

    repo.write("docs/note.md", "changed outside repo scope\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["outOfScopeFiles"],
        node.value["counts"]["outOfScopeFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "repo allowed-path finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"repo-allowed-path-violation".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_intended_file_violation() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("intended-file");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service only",
            "allowedPaths": ["src/"],
            "intendedFiles": ["src/service.js"]
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write("src/other.js", "export const other = 1;\n");
    repo.commit_all("initial");

    repo.write("src/other.js", "export const other = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["outOfIntendedFiles"],
        node.value["counts"]["outOfIntendedFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "intended-file finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"intended-file-violation".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_mutation_survivor_warning() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("mutation-survivor");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                },
                "mutation": {
                    "enabled": true,
                    "testCommand": "node test-pass.js",
                    "maxMutations": 1,
                    "survivalThreshold": 100
                }
            }
        })
        .to_string(),
    );
    repo.write("test-pass.js", "process.exit(0);\n");
    repo.write("src/service.js", "export const featureFlag = false;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const featureFlag = true;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["sourceFiles"],
        node.value["counts"]["sourceFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "mutation-survivor finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"mutation-survivors-detected".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_change_type_violation() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("change-type");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Implementation-only service change",
            "allowedChangeTypes": ["implementation-only"]
        })
        .to_string(),
    );
    repo.write("src/api/users.ts", "export type User = { id: string };\n");
    repo.commit_all("initial");

    repo.write(
        "src/api/users.ts",
        "export type User = { id: string; name: string };\n",
    );

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["changedFileTypes"], node.value["changedFileTypes"],
        "classified change types should match"
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "change-type finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"change-type-violation".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_task_protected_path_warning() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("task-protected-path");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Adjust payment internals",
            "protectedPaths": ["src/payments/"]
        })
        .to_string(),
    );
    repo.write("src/payments/charge.ts", "export const charge = 1;\n");
    repo.commit_all("initial");

    repo.write("src/payments/charge.ts", "export const charge = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["protectedPathMatches"],
        node.value["counts"]["protectedPathMatches"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "task protected-path finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"task-protected-paths-touched".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_parallel_abstraction_warning() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("parallel-abstraction");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Extend refund service",
            "allowedPaths": ["src/"],
            "intendedFiles": ["src/orders/refund-service.ts"]
        })
        .to_string(),
    );
    repo.write("src/orders/refund-service.ts", "export const refund = 1;\n");
    repo.write("src/orders/refund-helper.ts", "export const helper = 1;\n");
    repo.commit_all("initial");

    repo.write("src/orders/refund-helper.ts", "export const helper = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["outOfIntendedFiles"],
        node.value["counts"]["outOfIntendedFiles"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "parallel-abstraction finding codes should match"
    );
    assert!(finding_codes(&rust.value).contains(&"continuity-breadth-warning".to_string()));
    assert!(finding_codes(&rust.value).contains(&"continuity-parallel-abstraction".to_string()));
    assert!(finding_codes(&rust.value).contains(&"intended-file-violation".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_continuity_sensitive_structure_warning() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("continuity-sensitive");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Adjust protected core flow",
            "protectedPaths": ["src/core/"],
            "continuityRequirements": ["Preserve the existing routing structure."]
        })
        .to_string(),
    );
    repo.write("src/core/router.ts", "export const route = 1;\n");
    repo.commit_all("initial");

    repo.write("src/core/router.ts", "export const route = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(
        rust.value["counts"]["protectedPathMatches"],
        node.value["counts"]["protectedPathMatches"]
    );
    assert_eq!(
        finding_codes(&rust.value),
        finding_codes(&node.value),
        "continuity-sensitive finding codes should match"
    );
    assert!(
        finding_codes(&rust.value).contains(&"continuity-sensitive-structure-change".to_string())
    );
    assert!(finding_codes(&rust.value).contains(&"task-protected-paths-touched".to_string()));
}

#[test]
fn rust_check_json_matches_node_for_pro_enriched_top_level_fields() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("pro-enriched");
    repo.init_git();
    repo.write(".gitignore", "node_modules/\n");
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": false
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");
    repo.write_mock_pro_package();

    repo.write("src/service.js", "export const value = 2;\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], node.value["ok"]);
    assert_eq!(rust.value["scoreVerdict"], node.value["scoreVerdict"]);
    assert_eq!(rust.value["goLiveDecision"], node.value["goLiveDecision"]);
    assert_eq!(rust.value["goLiveReport"], node.value["goLiveReport"]);
    assert_eq!(rust.value["proofPlan"], node.value["proofPlan"]);
    assert_eq!(rust.value["proofRecipe"], node.value["proofRecipe"]);
    assert_eq!(
        rust.value["proofMemoryContext"],
        node.value["proofMemoryContext"]
    );
}

#[test]
fn rust_check_json_matches_node_for_ignoring_daemon_runtime_files() {
    let project_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join("..");
    let repo = TempRepo::new("daemon-runtime-files");
    repo.init_git();
    repo.write("AGENTS.md", "# Agent instructions\n");
    repo.write("docs/PROJECT_STATE.md", "# Project state\n");
    repo.write("docs/PR_CHECKLIST.md", "# PR checklist\n");
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
                    "requireEvidenceFiles": false
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "schemaVersion": 3,
            "task": "Update service",
            "allowedPaths": ["src/", "tests/"],
            "intendedFiles": ["src/service.js", "tests/service.test.js"],
            "requiredCommands": [],
            "evidencePaths": []
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.write("tests/service.test.js", "export const covered = true;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");
    repo.write(
        "tests/service.test.js",
        "export const covered = 'updated';\n",
    );
    repo.write(
        ".agent-guardrails/daemon-result.json",
        "{\"status\":\"completed\"}\n",
    );
    repo.write(".agent-guardrails/daemon.log", "daemon checked\n");

    let rust = run_json(
        rust_cli()
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );
    let node = run_json(
        node_cli(&project_root)
            .arg("check")
            .arg("--json")
            .current_dir(&repo.path),
    );

    assert_eq!(rust.status_success, node.status_success);
    assert_eq!(rust.value["ok"], true);
    assert_eq!(rust.value["changedFiles"], node.value["changedFiles"]);
    assert_eq!(
        rust.value["changedFiles"],
        json!(["src/service.js", "tests/service.test.js"])
    );
    assert_eq!(rust.value["outOfTaskScopeFiles"], json!([]));
    assert_eq!(rust.value["outOfIntendedFiles"], json!([]));
}

struct JsonRun {
    status_success: bool,
    value: Value,
}

fn run_json(command: &mut Command) -> JsonRun {
    let output = command.output().expect("run CLI");
    assert!(
        output.stderr.is_empty(),
        "unexpected stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    JsonRun {
        status_success: output.status.success(),
        value: serde_json::from_slice(&output.stdout).expect("valid json"),
    }
}

fn finding_codes(value: &Value) -> Vec<String> {
    value["findings"]
        .as_array()
        .expect("findings array")
        .iter()
        .filter_map(|finding| finding["code"].as_str())
        .map(ToString::to_string)
        .collect()
}

fn top_level_keys(value: &Value) -> Vec<String> {
    let mut keys = value
        .as_object()
        .expect("top-level object")
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

fn git<I, S>(cwd: &Path, args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output: Output = Command::new("git")
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
