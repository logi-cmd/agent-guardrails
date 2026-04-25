use serde_json::{Value, json};
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
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
            "agent-guardrails-rs-daemon-{name}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create temp dir");
        Self { path }
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = cli()
            .arg("stop")
            .arg("--json")
            .arg("--repo-root")
            .arg(&self.path)
            .output();
        let _ = fs::remove_dir_all(&self.path);
    }
}

#[test]
fn rust_daemon_status_reports_stopped_with_default_config() {
    let repo = TempDir::new("status-defaults");
    let output = cli()
        .arg("status")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("status");

    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    let value: Value = serde_json::from_slice(&output.stdout).expect("status json");
    assert_eq!(value["ok"], true);
    assert_eq!(value["status"]["running"], false);
    assert_eq!(
        value["config"]["watchPaths"],
        json!(["src/", "lib/", "tests/"])
    );
    assert_eq!(value["config"]["checkInterval"], 5000);
    assert_eq!(value["config"]["blockOnHighRisk"], true);
}

#[test]
fn rust_daemon_status_merges_custom_config_and_cleans_stale_pid() {
    let repo = TempDir::new("status-custom");
    fs::create_dir_all(repo.path.join(".agent-guardrails")).expect("guardrails dir");
    fs::write(
        repo.path.join(".agent-guardrails/daemon.json"),
        serde_json::to_string_pretty(&json!({
            "watchPaths": ["app/"],
            "checkInterval": 250,
        }))
        .expect("config"),
    )
    .expect("write config");
    fs::write(repo.path.join(".agent-guardrails/daemon.pid"), "999999999")
        .expect("write stale pid");

    let output = cli()
        .arg("status")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("status");

    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    let value: Value = serde_json::from_slice(&output.stdout).expect("status json");
    assert_eq!(value["status"]["running"], false);
    assert_eq!(value["config"]["watchPaths"], json!(["app/"]));
    assert_eq!(value["config"]["checkInterval"], 250);
    assert_eq!(value["config"]["blockOnHighRisk"], true);
    assert!(!repo.path.join(".agent-guardrails/daemon.pid").exists());
}

#[test]
fn rust_daemon_start_status_stop_round_trip() {
    let repo = TempDir::new("round-trip");
    fs::create_dir_all(repo.path.join(".agent-guardrails")).expect("guardrails dir");
    fs::write(
        repo.path.join(".agent-guardrails/daemon.json"),
        serde_json::to_string_pretty(&json!({
            "watchPaths": ["src/"],
            "checkInterval": 200,
        }))
        .expect("config"),
    )
    .expect("write config");
    fs::create_dir_all(repo.path.join("src")).expect("src dir");

    let start = cli()
        .arg("start")
        .arg("--json")
        .current_dir(&repo.path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("start");
    assert_eq!(start.code(), Some(0));
    assert!(repo.path.join(".agent-guardrails/daemon.pid").exists());

    let status = cli()
        .arg("status")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("status");
    assert_eq!(status.status.code(), Some(0), "{}", stderr(&status));
    let status_value: Value = serde_json::from_slice(&status.stdout).expect("status json");
    assert_eq!(status_value["status"]["running"], true);
    assert_eq!(status_value["config"]["watchPaths"], json!(["src/"]));

    let stop = cli()
        .arg("stop")
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("stop");
    assert_eq!(stop.status.code(), Some(0), "{}", stderr(&stop));
    let stop_value: Value = serde_json::from_slice(&stop.stdout).expect("stop json");
    assert_eq!(stop_value["ok"], true);
    assert_eq!(stop_value["status"]["running"], false);
    assert!(!repo.path.join(".agent-guardrails/daemon.pid").exists());
}

#[test]
fn rust_daemon_start_stop_installs_and_cleans_agent_hooks() {
    let repo = TempDir::new("hooks");
    fs::create_dir_all(repo.path.join(".agent-guardrails")).expect("guardrails dir");
    fs::write(
        repo.path.join(".agent-guardrails/daemon.json"),
        serde_json::to_string_pretty(&json!({
            "watchPaths": ["src/"],
            "checkInterval": 200,
        }))
        .expect("config"),
    )
    .expect("write config");
    fs::write(repo.path.join("AGENTS.md"), "# Agent instructions\n").expect("agents");
    fs::create_dir_all(repo.path.join(".claude")).expect("claude dir");
    fs::write(repo.path.join(".claude/settings.json"), "{}").expect("claude settings");
    fs::create_dir_all(repo.path.join(".cursor")).expect("cursor dir");
    fs::create_dir_all(repo.path.join(".opencode")).expect("opencode dir");
    fs::create_dir_all(repo.path.join(".codex")).expect("codex dir");
    fs::create_dir_all(repo.path.join(".gemini")).expect("gemini dir");
    fs::create_dir_all(repo.path.join(".git/hooks")).expect("git hooks");

    let package_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("package root");
    let start = cli()
        .arg("start")
        .arg("--json")
        .arg("--repo-root")
        .arg(&repo.path)
        .env("AGENT_GUARDRAILS_PACKAGE_ROOT", &package_root)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .expect("start");
    assert_eq!(start.code(), Some(0));

    let agents = fs::read_to_string(repo.path.join("AGENTS.md")).expect("agents");
    assert!(agents.contains("agent-guardrails:daemon:start"));
    assert!(repo.path.join(".claude/hooks/daemon-check.cjs").exists());
    assert!(repo.path.join(".cursor/hooks/cursor-check.cjs").exists());
    assert!(repo.path.join(".opencode/plugins/guardrails.js").exists());
    assert!(repo.path.join(".codex/hooks/guardrails-check.js").exists());
    assert!(repo.path.join(".gemini/hooks/guardrails-check.js").exists());
    assert!(repo.path.join(".git/hooks/pre-commit").exists());
    assert!(file_contains(
        repo.path.join(".claude/settings.json"),
        "agent-guardrails:daemon-check"
    ));
    assert!(file_contains(
        repo.path.join(".cursor/hooks.json"),
        "agent-guardrails:cursor-check"
    ));
    assert!(file_contains(
        repo.path.join(".opencode/config.json"),
        ".opencode/plugins/guardrails.js"
    ));
    assert!(file_contains(
        repo.path.join(".codex/hooks.json"),
        "agent-guardrails:codex-check"
    ));
    assert!(file_contains(
        repo.path.join(".gemini/settings.json"),
        "agent-guardrails-check"
    ));
    assert!(file_contains(
        repo.path.join(".git/hooks/pre-commit"),
        "pre-commit-check.cjs"
    ));

    let stop = cli()
        .arg("stop")
        .arg("--json")
        .arg("--repo-root")
        .arg(&repo.path)
        .env("AGENT_GUARDRAILS_PACKAGE_ROOT", &package_root)
        .output()
        .expect("stop");
    assert_eq!(stop.status.code(), Some(0), "{}", stderr(&stop));
    let stop_value: Value = serde_json::from_slice(&stop.stdout).expect("stop json");
    assert_eq!(stop_value["ok"], true);

    let agents = fs::read_to_string(repo.path.join("AGENTS.md")).expect("agents");
    assert!(!agents.contains("agent-guardrails:daemon:start"));
    assert!(!repo.path.join(".claude/hooks/daemon-check.cjs").exists());
    assert!(!repo.path.join(".cursor/hooks/cursor-check.cjs").exists());
    assert!(!repo.path.join(".opencode/plugins/guardrails.js").exists());
    assert!(!repo.path.join(".codex/hooks/guardrails-check.js").exists());
    assert!(!repo.path.join(".gemini/hooks/guardrails-check.js").exists());
    assert!(!file_contains(
        repo.path.join(".claude/settings.json"),
        "agent-guardrails:daemon-check"
    ));
    assert!(!file_contains(
        repo.path.join(".cursor/hooks.json"),
        "agent-guardrails:cursor-check"
    ));
    assert!(!file_contains(
        repo.path.join(".opencode/config.json"),
        ".opencode/plugins/guardrails.js"
    ));
    assert!(!file_contains(
        repo.path.join(".codex/hooks.json"),
        "agent-guardrails:codex-check"
    ));
    assert!(!file_contains(
        repo.path.join(".gemini/settings.json"),
        "agent-guardrails-check"
    ));
}

fn file_contains(path: PathBuf, needle: &str) -> bool {
    fs::read_to_string(path)
        .map(|content| content.contains(needle))
        .unwrap_or(false)
}

fn stderr(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stderr).to_string()
}
