use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

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
            "agent-guardrails-rs-setup-{name}-{}-{unique}",
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
fn rust_setup_json_auto_initializes_claude_code_repo() {
    let repo = TempDir::new("claude");
    let home = TempDir::new("home-claude");

    let output = cli()
        .arg("setup")
        .arg(&repo.path)
        .arg("--agent")
        .arg("claude-code")
        .arg("--preset")
        .arg("node-service")
        .arg("--json")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust setup");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: Value = serde_json::from_slice(&output.stdout).expect("setup json");
    assert_eq!(result["ok"], true);
    assert_eq!(result["agent"]["id"], "claude-code");
    assert_eq!(result["initialization"]["autoInitialized"], true);
    assert_eq!(result["mcp"]["repoConfigWrite"]["wrote"], true);
    assert_eq!(result["mcp"]["repoConfigWrite"]["configPath"], ".mcp.json");
    assert_eq!(result["checks"]["repoLocalFilesReady"], true);

    assert!(repo.path.join(".agent-guardrails/config.json").exists());
    assert!(repo.path.join("CLAUDE.md").exists());
    assert!(repo.path.join(".mcp.json").exists());
    assert!(repo.path.join(".claude/settings.json").exists());
    assert!(
        repo.path
            .join(".agent-guardrails/hooks/claude-code-pre-tool.cjs")
            .exists()
    );
    assert!(
        repo.path
            .join(".agent-guardrails/hooks/claude-code-post-tool.cjs")
            .exists()
    );
    assert!(home.path.join(".claude/commands/ag/check.md").exists());

    let settings = read_json(&repo.path.join(".claude/settings.json"));
    assert!(settings["hooks"]["PreToolUse"].is_array());
    assert!(settings["hooks"]["PostToolUse"].is_array());
}

#[test]
fn rust_setup_installs_opencode_plugin_and_repo_config() {
    let repo = TempDir::new("opencode");
    let home = TempDir::new("home-opencode");

    let output = cli()
        .arg("setup")
        .arg(&repo.path)
        .arg("--agent")
        .arg("opencode")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust setup");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Agent Guardrails Setup"));
    assert!(stdout.contains("Canonical MCP chat flow"));
    assert!(repo.path.join("opencode.json").exists());
    assert!(repo.path.join(".opencode/plugins/guardrails.js").exists());
}

#[test]
fn rust_setup_codex_keeps_repo_config_as_manual_step() {
    let repo = TempDir::new("codex");
    let home = TempDir::new("home-codex");

    let output = cli()
        .arg("setup")
        .arg(&repo.path)
        .arg("--agent")
        .arg("codex")
        .arg("--json")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust setup");

    assert!(output.status.success());
    let result: Value = serde_json::from_slice(&output.stdout).expect("setup json");
    assert_eq!(result["ok"], true);
    assert_eq!(result["mcp"]["repoConfigWrite"]["wrote"], false);
    assert!(
        result["remainingManualStep"]
            .as_str()
            .expect("manual step")
            .contains("paste the MCP snippet")
    );
    assert!(repo.path.join(".codex/instructions.md").exists());
}

#[test]
fn rust_setup_rejects_unknown_agent() {
    let repo = TempDir::new("unknown");
    let home = TempDir::new("home-unknown");

    let output = cli()
        .arg("setup")
        .arg(&repo.path)
        .arg("--agent")
        .arg("unknown-agent")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust setup");

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("unknown adapter"));
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).expect("read json")).expect("valid json")
}
