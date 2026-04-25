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
            "agent-guardrails-rs-init-{name}-{}-{unique}",
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
fn rust_init_seeds_core_repo_files_and_agent_adapters() {
    let repo = TempDir::new("repo");
    let home = TempDir::new("home");

    let output = cli()
        .arg("init")
        .arg(&repo.path)
        .arg("--preset")
        .arg("nextjs")
        .arg("--adapter")
        .arg("codex,claude-code,cursor,gemini")
        .arg("--lang")
        .arg("en")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust init");

    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Initialized agent-guardrails"));
    assert!(stdout.contains("Next steps:"));

    assert!(repo.path.join("AGENTS.md").exists());
    assert!(repo.path.join("CLAUDE.md").exists());
    assert!(repo.path.join("GEMINI.md").exists());
    assert!(repo.path.join(".codex/instructions.md").exists());
    assert!(
        repo.path
            .join(".cursor/rules/agent-guardrails.mdc")
            .exists()
    );
    assert!(repo.path.join("docs/PROJECT_STATE.md").exists());
    assert!(repo.path.join("docs/PR_CHECKLIST.md").exists());
    assert!(
        repo.path
            .join(".agent-guardrails/tasks/TASK_TEMPLATE.md")
            .exists()
    );
    assert!(
        repo.path
            .join(".agent-guardrails/prompts/IMPLEMENT_PROMPT.md")
            .exists()
    );
    assert!(
        repo.path
            .join(".github/workflows/agent-guardrails.yml")
            .exists()
    );
    assert!(home.path.join(".claude/commands/ag/check.md").exists());

    let config = read_json(&repo.path.join(".agent-guardrails/config.json"));
    assert_eq!(config["preset"], "nextjs");

    let agents = fs::read_to_string(repo.path.join("AGENTS.md")).expect("read agents");
    assert!(agents.contains("agent-guardrails check"));
}

#[test]
fn rust_init_skips_default_ci_when_workflow_already_exists() {
    let repo = TempDir::new("existing-ci");
    let home = TempDir::new("home-existing-ci");
    fs::create_dir_all(repo.path.join(".github/workflows")).expect("create workflows");
    fs::write(
        repo.path.join(".github/workflows/existing.yml"),
        "name: existing\n",
    )
    .expect("write existing workflow");

    let output = cli()
        .arg("init")
        .arg(&repo.path)
        .arg("--preset")
        .arg("generic")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust init");

    assert!(output.status.success());
    assert!(repo.path.join(".github/workflows/existing.yml").exists());
    assert!(
        !repo
            .path
            .join(".github/workflows/agent-guardrails.yml")
            .exists()
    );
}

#[test]
fn rust_init_rejects_unknown_adapters() {
    let repo = TempDir::new("bad-adapter");
    let home = TempDir::new("home-bad-adapter");

    let output = cli()
        .arg("init")
        .arg(&repo.path)
        .arg("--adapter")
        .arg("nope")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run rust init");

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("unknown adapter"));
}

fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).expect("read json")).expect("valid json")
}
