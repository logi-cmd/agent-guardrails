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
            "agent-guardrails-rs-doctor-{name}-{}-{unique}",
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
fn rust_doctor_json_reports_fresh_repo_gaps() {
    let repo = TempDir::new("fresh");

    let output = cli()
        .arg("doctor")
        .arg(&repo.path)
        .arg("--json")
        .output()
        .expect("run rust doctor");

    assert!(!output.status.success(), "fresh repo should not pass");
    let result: Value = serde_json::from_slice(&output.stdout).expect("doctor json");
    assert_eq!(result["ok"], false);
    assert_eq!(result["checks"].as_array().expect("checks").len(), 6);
    assert_check(&result, "configExists", false);
    assert_check(&result, "gitHook", false);
    assert_check(&result, "agentSetupFiles", false);
    assert_check(&result, "enforced", false);
    assert_check(&result, "cliBinary", true);
    assert_check(&result, "checkRuntime", true);
}

#[test]
fn rust_doctor_sees_agent_files_after_setup() {
    let repo = TempDir::new("setup");
    let home = TempDir::new("home-setup");

    let setup = cli()
        .arg("setup")
        .arg(&repo.path)
        .arg("--agent")
        .arg("claude-code")
        .env("HOME", &home.path)
        .env("USERPROFILE", &home.path)
        .output()
        .expect("run setup");
    assert!(setup.status.success());

    let output = cli()
        .arg("doctor")
        .arg(&repo.path)
        .arg("--json")
        .output()
        .expect("run rust doctor");

    assert!(
        !output.status.success(),
        "setup repo still lacks enforcement/git hook"
    );
    let result: Value = serde_json::from_slice(&output.stdout).expect("doctor json");
    assert_check(&result, "configExists", true);
    assert_check(&result, "agentSetupFiles", true);
    assert_check(&result, "enforced", false);
}

#[test]
fn rust_doctor_text_supports_english_and_zh_cn() {
    let repo = TempDir::new("text");

    let en = cli()
        .arg("doctor")
        .arg(&repo.path)
        .output()
        .expect("run doctor en");
    assert!(!en.status.success());
    let en_stdout = String::from_utf8_lossy(&en.stdout);
    assert!(en_stdout.contains("Agent Guardrails Doctor"));
    assert!(en_stdout.contains("Check runtime"));

    let zh = cli()
        .arg("doctor")
        .arg(&repo.path)
        .arg("--lang")
        .arg("zh-CN")
        .output()
        .expect("run doctor zh");
    assert!(!zh.status.success());
    let zh_stdout = String::from_utf8_lossy(&zh.stdout);
    assert!(zh_stdout.contains("Agent Guardrails 安装诊断"));
    assert!(zh_stdout.contains("Check 运行时"));
}

fn assert_check(result: &Value, key: &str, passed: bool) {
    let found = result["checks"]
        .as_array()
        .expect("checks")
        .iter()
        .find(|check| check["key"] == key)
        .unwrap_or_else(|| panic!("missing check {key}"));
    assert_eq!(found["passed"], passed);
}

#[allow(dead_code)]
fn read_json(path: &Path) -> Value {
    serde_json::from_str(&fs::read_to_string(path).expect("read json")).expect("valid json")
}
