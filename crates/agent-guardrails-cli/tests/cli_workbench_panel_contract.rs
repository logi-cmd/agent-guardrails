use serde_json::{Value, json};
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
            "agent-guardrails-rs-workbench-panel-{name}-{}-{unique}",
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

fn write_panel(repo: &TempDir) -> PathBuf {
    let panel_path = repo
        .path
        .join(".agent-guardrails/pro/operator-workbench-panel.json");
    fs::create_dir_all(panel_path.parent().expect("parent")).expect("create panel dir");
    fs::write(
        &panel_path,
        serde_json::to_string_pretty(&json!({
            "format": "agent-guardrails-workbench-panel.v1",
            "schemaVersion": 1,
            "sourceFormat": "agent-guardrails-workbench-view.v1",
            "renderer": "native-panel-model",
            "hero": {
                "question": "Can I ship this change?",
                "answer": "No",
                "state": "blocked",
                "riskLabel": "High risk",
                "trustScore": 62,
                "reason": "High-risk auth change is missing proof. The next step is bounded."
            },
            "statusStrip": [
                { "label": "Ship", "value": "No", "state": "blocked", "progress": 34 },
                { "label": "Evidence", "value": "1 open", "state": "needs_work", "progress": 84 }
            ],
            "nextStep": {
                "label": "Run next proof",
                "summary": "Run the auth test and refresh the release answer.",
                "command": "npm test -- auth",
                "rerunCommand": "agent-guardrails check --review",
                "evidenceTool": "pro_capture_evidence_note"
            },
            "handoff": {
                "label": "Copy agent handoff",
                "humanRole": "Read the refreshed answer after the rerun.",
                "humanChecks": ["Read the refreshed release answer."],
                "stopConditions": ["Stop if the answer stays blocked."]
            },
            "sections": [
                { "id": "ship-answer", "title": "Can I ship this change?", "status": "blocked", "summary": "Not yet." },
                { "id": "next-proof", "title": "Next proof", "status": "needs_work", "summary": "Run npm test -- auth." }
            ]
        }))
        .expect("panel json"),
    )
    .expect("write panel");
    panel_path
}

#[test]
fn renders_default_workbench_panel_path() {
    let repo = TempDir::new("default");
    write_panel(&repo);

    let output = cli()
        .arg("workbench-panel")
        .current_dir(&repo.path)
        .output()
        .expect("workbench panel");

    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    let stdout = String::from_utf8_lossy(&output.stdout);
    assert!(stdout.contains("Agent Guardrails Workbench | BLOCKED | High risk"));
    assert!(stdout.contains("Can I ship this change? -> No"));
    assert!(stdout.contains("$ npm test -- auth"));
    assert!(stdout.contains("Then rerun: agent-guardrails check --review"));
    assert!(stdout.contains("Evidence tool: pro_capture_evidence_note"));
    assert!(stdout.contains("- [needs_work] | Next proof | Run npm test -- auth."));
    assert!(output.stderr.is_empty());
}

#[test]
fn renders_explicit_workbench_panel_path_as_json() {
    let repo = TempDir::new("json");
    let panel_path = write_panel(&repo);

    let output = cli()
        .arg("workbench-panel")
        .arg("--file")
        .arg(&panel_path)
        .arg("--json")
        .current_dir(&repo.path)
        .output()
        .expect("workbench panel json");

    assert_eq!(output.status.code(), Some(0), "{}", stderr(&output));
    let value: Value = serde_json::from_slice(&output.stdout).expect("panel json");
    assert_eq!(value["format"], "agent-guardrails-workbench-panel.v1");
    assert_eq!(value["nextStep"]["command"], "npm test -- auth");
    assert!(output.stderr.is_empty());
}

#[test]
fn rejects_wrong_panel_format() {
    let repo = TempDir::new("wrong-format");
    let panel_path = repo.path.join("panel.json");
    fs::write(
        &panel_path,
        serde_json::to_string_pretty(&json!({ "format": "wrong" })).expect("json"),
    )
    .expect("write panel");

    let output = cli()
        .arg("workbench-panel")
        .arg("--file")
        .arg(&panel_path)
        .current_dir(&repo.path)
        .output()
        .expect("workbench panel");

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("unsupported panel format"));
}

fn stderr(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stderr).into_owned()
}
