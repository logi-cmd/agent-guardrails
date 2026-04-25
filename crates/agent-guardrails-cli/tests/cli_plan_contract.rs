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
            "agent-guardrails-rs-plan-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp repo");
        Self { path }
    }

    fn write(&self, relative: &str, content: &str) {
        let path = self.path.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        fs::write(path, content).expect("write file");
    }

    fn write_config(&self) {
        self.write(
            ".agent-guardrails/config.json",
            &json!({
                "preset": "node-service",
                "workflow": {
                    "planDefaults": {
                        "allowedPaths": ["src/", "tests/"],
                        "requiredCommands": ["npm test"],
                        "evidencePaths": [".agent-guardrails/evidence/current-task.md"]
                    },
                    "readBeforeWrite": ["AGENTS.md", "docs/PROJECT_STATE.md"],
                    "constraints": ["Keep the change small."],
                    "definitionOfDone": ["Tests pass."]
                },
                "checks": {
                    "sourceRoots": ["src"],
                    "testRoots": ["tests"]
                },
                "nfrPolicies": {
                    "security": {
                        "evidenceHint": "Mention auth, secrets, permissions, and sensitive-data handling explicitly."
                    },
                    "dependency": {
                        "evidenceHint": "Mention new or upgraded packages, lockfile changes, and dependency impact explicitly."
                    },
                    "performance": {
                        "evidenceHint": "Mention latency, throughput, or hotspot validation in evidence."
                    },
                    "understanding": {
                        "evidenceHint": "Explain the main tradeoffs so future maintainers can follow the change."
                    },
                    "continuity": {
                        "evidenceHint": "Mention reuse targets and any deliberate continuity break in evidence."
                    }
                }
            })
            .to_string(),
        );
    }
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn rust_plan_writes_schema_v3_contract_for_explicit_scope() {
    let repo = TempRepo::new("explicit");
    repo.write_config();

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("Add refund status transitions")
        .arg("--allow-paths")
        .arg("src/,tests/")
        .arg("--intended-files")
        .arg("src/orders/refund.js,tests/refund.test.js")
        .arg("--protected-paths")
        .arg("src/contracts/")
        .arg("--allowed-change-types")
        .arg("implementation-only")
        .arg("--risk-level")
        .arg("high")
        .arg("--requires-review-notes")
        .arg("true")
        .arg("--validation-profile")
        .arg("strict")
        .arg("--required-commands")
        .arg("npm test,npm run lint")
        .arg("--evidence")
        .arg("docs/checks.txt,.agent-guardrails/evidence/task.txt")
        .arg("--acceptance-criteria")
        .arg("Refund status is persisted,Refund transition emits an audit log")
        .arg("--rollback-notes")
        .arg("Revert refund transition patch only")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Agent Guardrails Task Brief"));
    assert!(stdout.contains("Risk level: high"));
    assert!(stdout.contains("Required command: npm test"));

    let contract = read_json(&repo.path.join(".agent-guardrails/task-contract.json"));
    assert_eq!(contract["schemaVersion"], 3);
    assert_eq!(contract["task"], "Add refund status transitions");
    assert_eq!(contract["preset"], "node-service");
    assert_eq!(contract["allowedPaths"], json!(["src/", "tests/"]));
    assert_eq!(
        contract["intendedFiles"],
        json!(["src/orders/refund.js", "tests/refund.test.js"])
    );
    assert_eq!(contract["protectedPaths"], json!(["src/contracts/"]));
    assert_eq!(
        contract["allowedChangeTypes"],
        json!(["implementation-only"])
    );
    assert_eq!(contract["riskLevel"], "high");
    assert_eq!(contract["requiresReviewNotes"], true);
    assert_eq!(contract["validationProfile"], "strict");
    assert_eq!(
        contract["requiredCommands"],
        json!(["npm test", "npm run lint"])
    );
    assert_eq!(
        contract["evidencePaths"],
        json!(["docs/checks.txt", ".agent-guardrails/evidence/task.txt"])
    );
    assert_eq!(
        contract["acceptanceCriteria"],
        json!([
            "Refund status is persisted",
            "Refund transition emits an audit log"
        ])
    );
    assert_eq!(
        contract["rollbackNotes"],
        "Revert refund transition patch only"
    );
    assert!(
        contract["session"]["sessionId"]
            .as_str()
            .expect("session id")
            .starts_with("rust-plan-")
    );
    assert_eq!(
        contract["session"]["requiredCommandsSuggested"],
        json!(["npm test", "npm run lint"])
    );
}

#[test]
fn rust_plan_uses_preset_defaults_without_explicit_scope() {
    let repo = TempRepo::new("defaults");
    repo.write_config();

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("Tighten refund guardrails")
        .arg("--risk-level")
        .arg("standard")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(output.status.success());
    let contract = read_json(&repo.path.join(".agent-guardrails/task-contract.json"));
    assert_eq!(contract["allowedPaths"], json!(["src/", "tests/"]));
    assert_eq!(contract["requiredCommands"], json!(["npm test"]));
    assert_eq!(
        contract["evidencePaths"],
        json!([".agent-guardrails/evidence/current-task.md"])
    );
    assert_eq!(contract["autoFilledFields"][0], "allowed paths");
    assert_eq!(contract["session"]["contractSource"], "preset-defaults");
}

#[test]
fn rust_plan_task_only_returns_rough_suggestion_until_confirmed() {
    let repo = TempRepo::new("rough-suggestion");
    repo.write_config();

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("I only have a rough idea. Please find the smallest safe change.")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(output.status.success());
    assert!(String::from_utf8_lossy(&output.stdout).contains("Generated Task Contract"));
    assert!(
        !repo
            .path
            .join(".agent-guardrails/task-contract.json")
            .exists()
    );
}

#[test]
fn rust_plan_yes_writes_rough_intent_contract() {
    let repo = TempRepo::new("rough-yes");
    repo.write_config();

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("fix auth login edge cases")
        .arg("--yes")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(output.status.success());
    let contract = read_json(&repo.path.join(".agent-guardrails/task-contract.json"));
    assert_eq!(contract["roughIntent"]["detected"], true);
    assert_eq!(contract["roughIntent"]["taskType"], "auth");
    assert_eq!(contract["riskLevel"], "high");
    assert_eq!(contract["requiredCommands"], json!(["npm test"]));
}

#[test]
fn rust_plan_infers_docker_deploy_scope_from_rough_task() {
    let repo = TempRepo::new("rough-docker");
    repo.write_config();

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("add Docker compose deployment")
        .arg("--yes")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(output.status.success());
    let contract = read_json(&repo.path.join(".agent-guardrails/task-contract.json"));
    assert_eq!(contract["roughIntent"]["detected"], true);
    assert_eq!(contract["roughIntent"]["taskType"], "deploy");
    assert_eq!(contract["riskLevel"], "high");
    assert_eq!(
        contract["allowedPaths"],
        json!([
            "Dockerfile",
            "docker-compose.yml",
            "compose.yml",
            "compose.yaml",
            ".github/workflows/",
            "deploy/",
            "k8s/"
        ])
    );
}

#[test]
fn rust_plan_yes_uses_repo_local_pro_task_shape() {
    let repo = TempRepo::new("rough-pro");
    repo.write_config();
    repo.write(
        "node_modules/@agent-guardrails/pro/package.json",
        &json!({
            "name": "@agent-guardrails/pro",
            "version": "0.0.0-test",
            "type": "module",
            "exports": {
                ".": "./index.js"
            }
        })
        .to_string(),
    );
    repo.write(
        "node_modules/@agent-guardrails/pro/index.js",
        r#"
export function planTaskShapes() {
  return {
    recommendedOptionId: 'auth-service-1',
    options: [{
      id: 'auth-service-1',
      title: 'Auth service first',
      contractDraft: {
        allowedPaths: ['src/auth/', 'tests/auth/'],
        requiredCommands: ['npm test'],
        evidencePaths: ['.agent-guardrails/evidence/current-task.md'],
        riskLevel: 'high'
      }
    }]
  };
}
"#,
    );

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("fix auth login edge cases")
        .arg("--yes")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(output.status.success());
    let result: Value = serde_json::from_slice(&output.stdout).expect("json result");
    assert_eq!(result["status"], "created");
    let contract = read_json(&repo.path.join(".agent-guardrails/task-contract.json"));
    assert_eq!(
        contract["allowedPaths"],
        json!(["src/auth/", "tests/auth/"])
    );
    assert_eq!(contract["proPlan"]["selectedOptionId"], "auth-service-1");
    assert_eq!(contract["session"]["contractSource"], "pro-task-shape");
}

#[test]
fn rust_plan_print_only_does_not_write_contract() {
    let repo = TempRepo::new("print-only");
    repo.write_config();

    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("Preview only")
        .arg("--print-only")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(output.status.success());
    assert!(
        !repo
            .path
            .join(".agent-guardrails/task-contract.json")
            .exists()
    );
}

#[test]
fn rust_plan_requires_initialized_repo() {
    let repo = TempRepo::new("no-config");
    let output = cli()
        .arg("plan")
        .arg("--task")
        .arg("Should fail")
        .current_dir(&repo.path)
        .output()
        .expect("run rust plan");

    assert!(!output.status.success());
    assert!(
        String::from_utf8_lossy(&output.stderr).contains("Missing .agent-guardrails/config.json")
    );
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).expect("read json")).expect("valid json")
}
