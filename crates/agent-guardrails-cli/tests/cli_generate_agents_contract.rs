use std::fs;
use std::path::PathBuf;
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
            "agent-guardrails-rs-generate-agents-{name}-{}-{unique}",
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
fn rust_generate_agents_creates_agents_and_maintenance_docs() {
    let repo = TempDir::new("fresh");

    let output = cli()
        .arg("generate-agents")
        .arg(&repo.path)
        .arg("--preset")
        .arg("node-service")
        .output()
        .expect("run generate-agents");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("AGENTS.md generated"));
    assert!(stdout.contains("docs/ARCHITECTURE.md"));
    assert!(stdout.contains("docs/TESTING.md"));

    let agents = fs::read_to_string(repo.path.join("AGENTS.md")).expect("AGENTS.md");
    assert!(agents.contains("Agent Rules"));
    assert!(agents.contains("agent-guardrails check"));
    assert!(repo.path.join("docs/ARCHITECTURE.md").exists());
    assert!(repo.path.join("docs/TESTING.md").exists());
}

#[test]
fn rust_generate_agents_does_not_overwrite_existing_agents_md() {
    let repo = TempDir::new("existing-agents");
    fs::write(repo.path.join("AGENTS.md"), "# Existing instructions\n").expect("seed AGENTS");

    let output = cli()
        .current_dir(&repo.path)
        .arg("generate-agents")
        .output()
        .expect("run generate-agents");

    assert!(
        output.status.success(),
        "existing AGENTS is a reported no-op"
    );
    assert!(
        String::from_utf8_lossy(&output.stdout).contains("AGENTS.md generation failed"),
        "stdout: {}",
        String::from_utf8_lossy(&output.stdout)
    );
    assert_eq!(
        fs::read_to_string(repo.path.join("AGENTS.md")).expect("read AGENTS"),
        "# Existing instructions\n"
    );
    assert!(!repo.path.join("docs/ARCHITECTURE.md").exists());
}

#[test]
fn rust_generate_agents_preserves_existing_docs() {
    let repo = TempDir::new("existing-docs");
    fs::create_dir_all(repo.path.join("docs")).expect("docs dir");
    fs::write(
        repo.path.join("docs/ARCHITECTURE.md"),
        "# Existing architecture\n",
    )
    .expect("seed architecture");
    fs::write(repo.path.join("docs/TESTING.md"), "# Existing testing\n").expect("seed testing");

    let output = cli()
        .arg("gen-agents")
        .arg(&repo.path)
        .output()
        .expect("run gen-agents alias");

    assert!(output.status.success());
    assert!(repo.path.join("AGENTS.md").exists());
    assert_eq!(
        fs::read_to_string(repo.path.join("docs/ARCHITECTURE.md")).expect("read architecture"),
        "# Existing architecture\n"
    );
    assert_eq!(
        fs::read_to_string(repo.path.join("docs/TESTING.md")).expect("read testing"),
        "# Existing testing\n"
    );
}

#[test]
fn rust_generate_agents_supports_zh_cn_agents_template() {
    let repo = TempDir::new("zh");

    let output = cli()
        .arg("generate-agents")
        .arg(&repo.path)
        .arg("--lang")
        .arg("zh-CN")
        .output()
        .expect("run zh generate-agents");

    assert!(output.status.success());
    let agents = fs::read_to_string(repo.path.join("AGENTS.md")).expect("AGENTS.md");
    assert!(agents.contains("Agent 规则"));
}
