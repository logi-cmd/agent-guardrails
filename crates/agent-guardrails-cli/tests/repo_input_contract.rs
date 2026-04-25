use agent_guardrails_cli::repo::{
    DEFAULT_TASK_CONTRACT_PATH, read_config, read_json_object, read_task_contract,
    resolve_task_contract_path,
};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
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
            "agent-guardrails-rs-{name}-{}-{unique}",
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
}

impl Drop for TempRepo {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn read_json_object_strips_utf8_bom() {
    let repo = TempRepo::new("bom-json");
    repo.write(
        "data.json",
        "\u{feff}{\"checks\":{\"allowedPaths\":[\"src/\"]}}\n",
    );

    let value = read_json_object(&repo.path.join("data.json")).expect("read json");

    assert_eq!(value["checks"]["allowedPaths"][0], "src/");
}

#[test]
fn read_json_object_rejects_non_object_root() {
    let repo = TempRepo::new("json-array");
    repo.write("data.json", "[]");

    let error = read_json_object(&repo.path.join("data.json"))
        .expect_err("array root should fail")
        .to_string();

    assert!(error.contains("must be a JSON object"));
    assert!(error.contains("array"));
}

#[test]
fn read_config_returns_none_when_missing_and_object_when_present() {
    let repo = TempRepo::new("config");

    assert!(read_config(&repo.path).expect("missing config").is_none());

    repo.write(
        ".agent-guardrails/config.json",
        "{\"preset\":\"generic\",\"checks\":{\"allowedPaths\":[\"src/\"]}}",
    );

    let config = read_config(&repo.path)
        .expect("read config")
        .expect("config exists");

    assert_eq!(config["preset"], "generic");
    assert_eq!(config["checks"]["allowedPaths"][0], "src/");
}

#[test]
fn resolve_task_contract_path_uses_default_or_custom_relative_path() {
    assert_eq!(
        DEFAULT_TASK_CONTRACT_PATH,
        ".agent-guardrails/task-contract.json"
    );
    assert_eq!(
        normalize(resolve_task_contract_path(Path::new("repo"), None)),
        "repo/.agent-guardrails/task-contract.json"
    );
    assert_eq!(
        normalize(resolve_task_contract_path(
            Path::new("repo"),
            Some("tmp/contract.json")
        )),
        "repo/tmp/contract.json"
    );
}

#[test]
fn read_task_contract_returns_none_when_missing() {
    let repo = TempRepo::new("missing-contract");

    assert!(
        read_task_contract(&repo.path, None)
            .expect("missing contract")
            .is_none()
    );
}

#[test]
fn read_task_contract_fills_current_defaults() {
    let repo = TempRepo::new("contract-defaults");
    repo.write(".agent-guardrails/task-contract.json", "{}");

    let contract = read_task_contract(&repo.path, None)
        .expect("read contract")
        .expect("contract exists");

    assert_eq!(contract.schema_version, 1);
    assert_eq!(contract.task, "");
    assert_eq!(contract.preset, "");
    assert_eq!(contract.validation_profile, "standard");
    assert!(!contract.requires_review_notes);
    assert!(contract.allowed_paths.is_empty());
    assert!(contract.required_commands.is_empty());
    assert!(contract.evidence_paths.is_empty());
    assert!(contract.intended_files.is_empty());
    assert!(contract.protected_paths.is_empty());
    assert!(contract.allowed_change_types.is_empty());
    assert!(contract.acceptance_criteria.is_empty());
    assert_eq!(contract.extra.get("unknownField"), None);
}

#[test]
fn read_task_contract_preserves_extra_fields() {
    let repo = TempRepo::new("contract-extra");
    repo.write(
        ".agent-guardrails/task-contract.json",
        &json!({
            "schemaVersion": 3,
            "task": "Ship focused change",
            "allowedPaths": ["src/", "tests/"],
            "requiredCommands": ["npm test"],
            "requiresReviewNotes": true,
            "unknownField": { "kept": true }
        })
        .to_string(),
    );

    let contract = read_task_contract(&repo.path, None)
        .expect("read contract")
        .expect("contract exists");

    assert_eq!(contract.schema_version, 3);
    assert_eq!(contract.task, "Ship focused change");
    assert_eq!(contract.allowed_paths, vec![json!("src/"), json!("tests/")]);
    assert_eq!(contract.required_commands, vec![json!("npm test")]);
    assert!(contract.requires_review_notes);
    assert_eq!(contract.extra["unknownField"]["kept"], true);
}

#[test]
fn read_task_contract_validates_known_array_fields() {
    let repo = TempRepo::new("contract-bad-array");
    repo.write(
        ".agent-guardrails/task-contract.json",
        "{\"allowedPaths\":\"src/\"}",
    );

    let error = read_task_contract(&repo.path, None)
        .expect_err("invalid array field should fail")
        .to_string();

    assert!(error.contains("Task contract field \"allowedPaths\" must be an array"));
    assert!(error.contains("string"));
}

#[test]
fn read_task_contract_validates_known_string_fields() {
    let repo = TempRepo::new("contract-bad-string");
    repo.write(".agent-guardrails/task-contract.json", "{\"task\":123}");

    let error = read_task_contract(&repo.path, None)
        .expect_err("invalid string field should fail")
        .to_string();

    assert!(error.contains("Task contract field \"task\" must be a string"));
    assert!(error.contains("number"));
}

fn normalize(path: PathBuf) -> String {
    path.to_string_lossy().replace('\\', "/")
}
