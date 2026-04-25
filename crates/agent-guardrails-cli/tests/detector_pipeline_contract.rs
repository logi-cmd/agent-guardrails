use agent_guardrails_cli::check::{
    CheckContextOptions, build_check_context, build_check_result_from_context, run_oss_detectors,
};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

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
            "agent-guardrails-rs-detectors-{name}-{}-{unique}",
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
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn oss_pipeline_buckets_scope_contract_and_validation_findings() {
    let repo = TempRepo::new("scope-validation");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "allowedPaths": ["src/"],
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "testRoots": ["tests"],
                "testExtensions": [".js"],
                "correctness": {
                    "requireTestsWithSourceChanges": true,
                    "requireCommandsReported": true,
                    "requireEvidenceFiles": true
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service",
            "allowedPaths": ["src/"],
            "intendedFiles": ["src/service.js"],
            "requiredCommands": ["npm test"],
            "evidencePaths": ["docs/evidence.md"]
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write("src/service.js", "export const value = 2;\n");
    repo.write("docs/notes.md", "scope drift\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &[
            "repo-allowed-path-violation",
            "task-path-violation",
            "intended-file-violation",
            "missing-required-commands",
            "missing-evidence-files",
            "source-without-tests",
        ],
    );
    assert!(
        store
            .failures
            .iter()
            .any(|message| message.contains("npm test"))
    );
    assert!(
        store
            .warnings
            .iter()
            .any(|message| message.contains("outside the configured scope"))
    );
}

#[test]
fn oss_pipeline_builds_top_level_check_result_from_context() {
    let repo = TempRepo::new("check-result");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "preset": "generic",
            "checks": {
                "allowedPaths": ["src/"],
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
    repo.write("docs/notes.md", "scope drift\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let result = build_check_result_from_context(&context, store);

    assert!(!result.ok);
    assert_eq!(result.preset, "generic");
    assert_eq!(result.diff_source, "working tree");
    assert_eq!(result.counts.changed_files, 2);
    assert_eq!(result.counts.source_files, 1);
    assert_eq!(result.counts.out_of_scope_files, 1);
    assert_eq!(result.counts.findings, result.findings.len());
    assert_eq!(result.counts.failures, result.failures.len());
    assert_eq!(result.score_verdict, "blocked");
    assert!(
        result
            .findings
            .iter()
            .any(|finding| finding.code == "source-without-tests")
    );
}

#[test]
fn oss_pipeline_flags_change_type_and_risk_surface_findings() {
    let repo = TempRepo::new("risk-surface");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"],
                "risk": {
                    "warnOnConfigOrMigrationChanges": true
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Implementation-only change",
            "allowedChangeTypes": ["implementation-only"]
        })
        .to_string(),
    );
    repo.write("src/service.ts", "export const value = 1;\n");
    repo.write("src/api/users.ts", "export type User = { id: string };\n");
    repo.write("package.json", "{\"name\":\"demo\"}\n");
    repo.commit_all("initial");

    repo.write(
        "src/api/users.ts",
        "export type User = { id: string; name: string };\n",
    );
    repo.write("package.json", "{\"name\":\"demo\",\"private\":true}\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &["change-type-violation", "config-or-migration-change"],
    );
}

#[test]
fn oss_pipeline_flags_state_management_complexity() {
    let repo = TempRepo::new("state-complexity");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"]
            }
        })
        .to_string(),
    );
    repo.write("src/state/a.ts", "export const a = 1;\n");
    repo.write("src/state/b.ts", "export const b = 1;\n");
    repo.write("src/state/c.ts", "export const c = 1;\n");
    repo.commit_all("initial");

    repo.write("src/state/a.ts", "export const a = 2;\n");
    repo.write("src/state/b.ts", "export const b = 2;\n");
    repo.write("src/state/c.ts", "export const c = 2;\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &[
            "state-mgmt-complexity-multi-file",
            "state-mgmt-complexity-state-file",
        ],
    );
    assert!(
        store
            .findings
            .iter()
            .any(|finding| finding.code == "state-mgmt-complexity-multi-file"
                && finding.files.len() == 3)
    );
}

#[test]
fn oss_pipeline_flags_sensitive_file_changes() {
    let repo = TempRepo::new("sensitive-file");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "security": {
                    "enabled": true,
                    "sensitiveFiles": true
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write(".env.production", "TOKEN=placeholder\n");
    repo.write("certs/prod.pem", "placeholder\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(&codes, &["sensitive-file-change"]);
    assert!(
        store
            .findings
            .iter()
            .any(|finding| finding.code == "sensitive-file-change"
                && finding.files == vec![".env.production", "certs/prod.pem"])
    );
}

#[test]
fn oss_pipeline_flags_unsafe_added_code_patterns() {
    let repo = TempRepo::new("unsafe-patterns");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "security": {
                    "enabled": true,
                    "unsafePatterns": true
                }
            }
        })
        .to_string(),
    );
    repo.write(
        "src/service.js",
        "export function render(value) { return value; }\n",
    );
    repo.commit_all("initial");

    repo.write(
        "src/service.js",
        "export function render(value) {\n  document.body.innerHTML = value;\n  return eval(value);\n}\n",
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let unsafe_finding = store
        .findings
        .iter()
        .find(|finding| finding.code == "unsafe-patterns")
        .expect("unsafe-patterns finding");

    assert_eq!(unsafe_finding.files, vec!["src/service.js"]);
    assert!(unsafe_finding.message.contains("eval()"));
    assert!(unsafe_finding.message.contains("innerHTML"));
}

#[test]
fn oss_pipeline_flags_hardcoded_secret_patterns() {
    let repo = TempRepo::new("hardcoded-secrets");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "security": {
                    "enabled": true,
                    "hardcodedSecrets": true
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write(
        "src/service.js",
        "export const apiKey = \"abcdefghijklmnop\";\nexport const value = 2;\n",
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let secret_finding = store
        .findings
        .iter()
        .find(|finding| finding.code == "hardcoded-secrets")
        .expect("hardcoded-secrets finding");

    assert_eq!(secret_finding.files, vec!["src/service.js"]);
    assert!(secret_finding.message.contains("Generic API Key"));
}

#[test]
fn oss_pipeline_flags_async_logic_risk_patterns() {
    let repo = TempRepo::new("async-risk");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"]
            }
        })
        .to_string(),
    );
    repo.write(
        "src/async.js",
        "export function load(value) { return value; }\n",
    );
    repo.commit_all("initial");

    repo.write(
        "src/async.js",
        "export async function load(items) {\n  for (const item of items) {\n    await fetch(item);\n  }\n  return fetch('/a').then(a => a.json()).then(b => b.value).then(c => c);\n}\n",
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &["async-risk-nested-then", "async-risk-await-in-loop"],
    );
}

#[test]
fn oss_pipeline_flags_protected_area_without_review_notes() {
    let repo = TempRepo::new("protected-area");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "protectedAreas": [
                {
                    "path": "src/billing/",
                    "label": "Billing flow",
                    "minimumRiskLevel": "high",
                    "requiresReviewNotes": true,
                    "action": "Review billing impact before release."
                }
            ],
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"],
                "risk": {
                    "requireReviewNotesForProtectedAreas": true
                }
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update billing flow",
            "riskLevel": "medium",
            "evidencePaths": ["docs/evidence.md"]
        })
        .to_string(),
    );
    repo.write("docs/evidence.md", "Tests: cargo test\n");
    repo.write("src/billing/checkout.ts", "export const checkout = 1;\n");
    repo.commit_all("initial");

    repo.write("src/billing/checkout.ts", "export const checkout = 2;\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &[
            "protected-area-risk-level-too-low",
            "protected-area-missing-review-notes",
        ],
    );
    assert_eq!(context.config_protected_area_matches.len(), 1);
    assert_eq!(context.evidence_summary.has_review_notes, false);
}

#[test]
fn oss_pipeline_accepts_review_notes_for_task_review_requirement() {
    let repo = TempRepo::new("task-review-notes");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"]
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update service",
            "requiresReviewNotes": true,
            "evidencePaths": ["docs/evidence.md"]
        })
        .to_string(),
    );
    repo.write(
        "docs/evidence.md",
        "Review note: residual risk is limited to local formatting.\n",
    );
    repo.write("src/service.ts", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write("src/service.ts", "export const value = 2;\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert!(context.evidence_summary.has_review_notes);
    assert!(!codes.iter().any(|code| code == "task-missing-review-notes"));
}

#[test]
fn oss_pipeline_flags_production_profile_and_nfr_gaps() {
    let repo = TempRepo::new("production-risk");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "criticalPaths": ["src/payments/"],
            "performanceSensitiveAreas": ["src/payments/"],
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".ts"]
            }
        })
        .to_string(),
    );
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "task": "Update payment path",
            "productionProfile": "checkout",
            "nfrRequirements": ["performance"],
            "observabilityRequirements": ["metrics"],
            "evidencePaths": ["docs/evidence.md"]
        })
        .to_string(),
    );
    repo.write("docs/evidence.md", "Tests: cargo test\n");
    repo.write("src/payments/checkout.ts", "export const checkout = 1;\n");
    repo.commit_all("initial");

    repo.write("src/payments/checkout.ts", "export const checkout = 2;\n");

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &[
            "critical-path-without-rollback",
            "performance-sensitive-area-touched",
            "observability-requirements-unaddressed",
            "concurrency-requirements-unaddressed",
        ],
    );
    assert_eq!(
        context.critical_path_files,
        vec!["src/payments/checkout.ts"]
    );
    assert_eq!(
        context.performance_sensitive_files,
        vec!["src/payments/checkout.ts"]
    );
}

#[test]
fn oss_pipeline_flags_large_added_assets() {
    let repo = TempRepo::new("large-asset");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "performance": {
                    "enabled": true,
                    "largeAssetBytes": 16
                }
            }
        })
        .to_string(),
    );
    repo.write("src/service.js", "export const value = 1;\n");
    repo.commit_all("initial");

    repo.write(
        "assets/banner.png",
        "this pretend asset is intentionally larger than 16 bytes\n",
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let finding = store
        .findings
        .iter()
        .find(|finding| finding.code == "perf-degradation-large-asset")
        .expect("large asset finding");

    assert_eq!(finding.files, vec!["assets/banner.png"]);
}

#[test]
fn oss_pipeline_flags_big_bang_and_large_line_changes() {
    let repo = TempRepo::new("big-bang");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "performance": {
                    "enabled": true
                }
            }
        })
        .to_string(),
    );

    for index in 0..18 {
        let dir = match index % 3 {
            0 => "src",
            1 => "tests",
            _ => "docs",
        };
        repo.write(
            &format!("{dir}/file-{index}.txt"),
            &format!("initial {index}\n"),
        );
    }
    repo.commit_all("initial");

    let added_lines = (0..35)
        .map(|line| format!("added line {line}"))
        .collect::<Vec<_>>()
        .join("\n");
    for index in 0..18 {
        let dir = match index % 3 {
            0 => "src",
            1 => "tests",
            _ => "docs",
        };
        repo.write(
            &format!("{dir}/file-{index}.txt"),
            &format!("initial {index}\n{added_lines}\n"),
        );
    }

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(
        &codes,
        &["big-bang-change", "perf-degradation-large-change"],
    );
    assert!(context.total_added_lines >= 630);
}

#[test]
fn oss_pipeline_flags_mutation_survivors_when_tests_do_not_catch_change() {
    let repo = TempRepo::new("mutation-survivor");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "mutation": {
                    "enabled": true,
                    "testCommand": "node test.js",
                    "maxMutations": 1,
                    "survivalThreshold": 100
                }
            }
        })
        .to_string(),
    );
    repo.write(
        "src/feature.js",
        "module.exports = function flag() { return true; }\n",
    );
    repo.write("test.js", "process.exit(0);\n");
    repo.commit_all("initial");

    repo.write(
        "src/feature.js",
        "module.exports = function flag() { return false; }\n",
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let finding = store
        .findings
        .iter()
        .find(|finding| finding.code == "mutation-survivors-detected")
        .expect("mutation survivor finding");

    assert_eq!(finding.files, vec!["src/feature.js"]);
}

#[test]
fn oss_pipeline_warns_when_mutation_baseline_fails() {
    let repo = TempRepo::new("mutation-baseline-fail");
    repo.init_git();
    repo.write_required_project_files();
    repo.write(
        ".agent-guardrails/config.json",
        &json!({
            "checks": {
                "sourceRoots": ["src"],
                "sourceExtensions": [".js"],
                "mutation": {
                    "enabled": true,
                    "testCommand": "node test.js",
                    "maxMutations": 1
                }
            }
        })
        .to_string(),
    );
    repo.write(
        "src/feature.js",
        "module.exports = function flag() { return true; }\n",
    );
    repo.write("test.js", "process.exit(1);\n");
    repo.commit_all("initial");

    repo.write(
        "src/feature.js",
        "module.exports = function flag() { return false; }\n",
    );

    let context = build_check_context(&repo.path, CheckContextOptions::default()).expect("context");
    let store = run_oss_detectors(&context);
    let codes = finding_codes(&store.findings);

    assert_contains_all(&codes, &["mutation-test-error"]);
    assert!(
        !codes
            .iter()
            .any(|code| code == "mutation-survivors-detected")
    );
}

fn finding_codes(findings: &[agent_guardrails_cli::check::Finding]) -> Vec<String> {
    findings
        .iter()
        .map(|finding| finding.code.clone())
        .collect()
}

fn assert_contains_all(actual: &[String], expected: &[&str]) {
    for code in expected {
        assert!(
            actual.iter().any(|actual_code| actual_code == code),
            "missing finding code {code}; actual codes: {actual:?}"
        );
    }
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
