use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const MARKER_START: &str = "<!-- agent-guardrails-enforce:start -->";
const MARKER_END: &str = "<!-- agent-guardrails-enforce:end -->";

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_agent-guardrails-rs"))
}

struct TempDir {
    path: PathBuf,
}

impl TempDir {
    fn new(name: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "agent-guardrails-rs-enforce-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        Self { path }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn rust_enforce_all_writes_all_agent_instruction_files() {
    let repo = TempDir::new("all");

    let output = cli()
        .current_dir(&repo.path)
        .arg("enforce")
        .arg("--all")
        .arg("--json")
        .output()
        .expect("run enforce");

    assert!(output.status.success());
    let result: Value = serde_json::from_slice(&output.stdout).expect("enforce json");
    assert_eq!(result["ok"], true);
    assert_eq!(result["written"].as_array().expect("written").len(), 5);
    assert_eq!(
        result["agents"],
        serde_json::json!(["claude-code", "cursor", "opencode", "codex", "gemini"])
    );

    for relative_path in [
        "CLAUDE.md",
        ".cursor/rules/agent-guardrails-enforce.mdc",
        "AGENTS.md",
        ".codex/instructions.md",
        "GEMINI.md",
    ] {
        let content = fs::read_to_string(repo.path.join(relative_path)).expect(relative_path);
        assert!(
            content.contains(MARKER_START),
            "{relative_path} missing start marker"
        );
        assert!(
            content.contains(MARKER_END),
            "{relative_path} missing end marker"
        );
    }
}

#[test]
fn rust_enforce_is_idempotent_for_existing_marker() {
    let repo = TempDir::new("idempotent");

    let first = cli()
        .current_dir(&repo.path)
        .arg("enforce")
        .arg("--agent")
        .arg("claude-code")
        .arg("--json")
        .output()
        .expect("run first enforce");
    assert!(first.status.success());
    let first_json: Value = serde_json::from_slice(&first.stdout).expect("first json");
    assert_eq!(first_json["written"].as_array().expect("written").len(), 1);

    let claude_path = repo.path.join("CLAUDE.md");
    let first_content = fs::read_to_string(&claude_path).expect("read first");

    let second = cli()
        .current_dir(&repo.path)
        .arg("enforce")
        .arg("--agent")
        .arg("claude-code")
        .arg("--json")
        .output()
        .expect("run second enforce");
    assert!(second.status.success());
    let second_json: Value = serde_json::from_slice(&second.stdout).expect("second json");
    assert_eq!(second_json["written"].as_array().expect("written").len(), 0);
    assert_eq!(second_json["skipped"].as_array().expect("skipped").len(), 1);
    assert_eq!(
        fs::read_to_string(&claude_path).expect("read second"),
        first_content
    );
}

#[test]
fn rust_unenforce_strips_only_injected_block() {
    let repo = TempDir::new("strip");
    let claude_path = repo.path.join("CLAUDE.md");
    let user_content = "# My Project\n\nThis is my custom CLAUDE.md content.\nDo not delete this.";
    fs::write(&claude_path, user_content).expect("seed user file");

    let enforce = cli()
        .current_dir(&repo.path)
        .arg("enforce")
        .arg("--agent")
        .arg("claude-code")
        .output()
        .expect("run enforce");
    assert!(enforce.status.success());
    let with_enforced = fs::read_to_string(&claude_path).expect("read enforced");
    assert!(with_enforced.contains(MARKER_START));
    assert!(with_enforced.contains(user_content));

    let unenforce = cli()
        .current_dir(&repo.path)
        .arg("unenforce")
        .arg("--agent")
        .arg("claude-code")
        .arg("--json")
        .output()
        .expect("run unenforce");
    assert!(unenforce.status.success());
    let result: Value = serde_json::from_slice(&unenforce.stdout).expect("unenforce json");
    assert_eq!(result["removed"][0]["action"], "stripped");

    let restored = fs::read_to_string(&claude_path).expect("read restored");
    assert!(!restored.contains(MARKER_START));
    assert!(!restored.contains(MARKER_END));
    assert!(restored.contains("My Project"));
    assert!(restored.contains("custom CLAUDE.md content"));
    assert!(restored.contains("Do not delete this"));
}

#[test]
fn rust_unenforce_deletes_file_that_only_contains_injected_block() {
    let repo = TempDir::new("delete");

    let enforce = cli()
        .current_dir(&repo.path)
        .arg("enforce")
        .arg("--agent")
        .arg("gemini")
        .output()
        .expect("run enforce");
    assert!(enforce.status.success());
    assert!(repo.path.join("GEMINI.md").exists());

    let unenforce = cli()
        .current_dir(&repo.path)
        .arg("unenforce")
        .arg("--agent")
        .arg("gemini")
        .arg("--json")
        .output()
        .expect("run unenforce");
    assert!(unenforce.status.success());
    let result: Value = serde_json::from_slice(&unenforce.stdout).expect("unenforce json");
    assert_eq!(result["removed"][0]["path"], "GEMINI.md");
    assert_eq!(result["removed"][0]["action"], "deleted");
    assert!(!repo.path.join("GEMINI.md").exists());
}

#[test]
fn rust_enforce_and_unenforce_reject_unknown_agent() {
    let repo = TempDir::new("unknown");

    for command in ["enforce", "unenforce"] {
        let output = cli()
            .current_dir(&repo.path)
            .arg(command)
            .arg("--agent")
            .arg("unknown-agent")
            .output()
            .unwrap_or_else(|error| panic!("run {command}: {error}"));

        assert!(!output.status.success());
        assert!(String::from_utf8_lossy(&output.stderr).contains("unknown-agent"));
    }
}

#[test]
fn rust_unenforce_missing_file_is_safe() {
    let repo = TempDir::new("missing");

    let output = cli()
        .current_dir(&repo.path)
        .arg("unenforce")
        .arg("--agent")
        .arg("claude-code")
        .arg("--json")
        .output()
        .expect("run unenforce");

    assert!(output.status.success());
    let result: Value = serde_json::from_slice(&output.stdout).expect("unenforce json");
    assert_eq!(result["ok"], true);
    assert_eq!(result["removed"].as_array().expect("removed").len(), 0);
    assert_eq!(result["skipped"][0]["reason"], "not-found");
}
