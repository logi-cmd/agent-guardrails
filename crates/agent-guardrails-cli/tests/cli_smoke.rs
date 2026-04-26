use std::process::Command;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_agent-guardrails-rs"))
}

#[test]
fn version_output_matches_npm_cli_contract() {
    let output = cli().arg("--version").output().expect("run cli");

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8_lossy(&output.stdout).trim(),
        format!("agent-guardrails v{}", env!("CARGO_PKG_VERSION"))
    );
    assert!(output.stderr.is_empty());
}

#[test]
fn help_includes_current_public_command_surface() {
    let output = cli().arg("help").output().expect("run cli");

    assert!(output.status.success());
    let stdout = String::from_utf8_lossy(&output.stdout);
    for command in [
        "init",
        "setup",
        "plan",
        "check",
        "doctor",
        "enforce",
        "unenforce",
        "pro status",
        "pro activate",
        "pro report",
        "pro workbench",
        "pro cleanup",
        "workbench-panel",
        "generate-agents",
        "serve",
        "mcp",
    ] {
        assert!(
            stdout.contains(command),
            "help output should contain {command}"
        );
    }
    assert!(output.stderr.is_empty());
}

#[test]
fn unknown_command_returns_localized_style_error() {
    let output = cli().arg("not-a-command").output().expect("run cli");

    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert_eq!(
        String::from_utf8_lossy(&output.stderr).trim(),
        "agent-guardrails: Unknown command: not-a-command"
    );
}
