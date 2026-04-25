use crate::check::{
    CheckContextOptions, build_check_context, build_check_result_from_context, run_oss_detectors,
    run_semantic_plugins, try_enrich_check_result_with_pro,
};
use crate::diff::list_changed_files;
use crate::diff::resolve_git_root;
use serde::Serialize;
use serde_json::{Value, json};
use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DAEMON_PID_FILE: &str = ".agent-guardrails/daemon.pid";
const DAEMON_INFO_FILE: &str = ".agent-guardrails/daemon-info.json";
const DAEMON_RESULT_FILE: &str = ".agent-guardrails/daemon-result.json";
const DAEMON_LOG_FILE: &str = ".agent-guardrails/daemon.log";
const DAEMON_CONFIG_FILE: &str = ".agent-guardrails/daemon.json";
const DEFAULT_CHECK_INTERVAL_MS: u64 = 5_000;
const DAEMON_AGENTS_MARKER_START: &str = "<!-- agent-guardrails:daemon:start -->";
const DAEMON_AGENTS_MARKER_END: &str = "<!-- agent-guardrails:daemon:end -->";

#[derive(Clone, Debug)]
struct DaemonArgs {
    foreground: bool,
    json: bool,
    locale: String,
    repo_root: Option<String>,
}

impl Default for DaemonArgs {
    fn default() -> Self {
        Self {
            foreground: false,
            json: false,
            locale: "en".to_string(),
            repo_root: None,
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DaemonStatus {
    running: bool,
    pid: Option<u32>,
    start_time: Option<String>,
    checks_run: u64,
    last_check: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DaemonStatusResult {
    ok: bool,
    repo_root: String,
    status: DaemonStatus,
    config: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DaemonActionResult {
    ok: bool,
    repo_root: String,
    action: String,
    status: DaemonStatus,
    config: Value,
    message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    injected: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    removed: Vec<String>,
}

pub fn run_start_cli(args: &[String]) -> i32 {
    match run_start(args) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("agent-guardrails start: {error}");
            1
        }
    }
}

pub fn run_stop_cli(args: &[String]) -> i32 {
    match run_stop(args) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("agent-guardrails stop: {error}");
            1
        }
    }
}

pub fn run_status_cli(args: &[String]) -> i32 {
    match run_status(args) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("agent-guardrails status: {error}");
            1
        }
    }
}

pub fn run_daemon_worker_cli(args: &[String]) -> i32 {
    match run_worker(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails daemon-worker: {error}");
            1
        }
    }
}

fn run_start(args: &[String]) -> Result<i32, String> {
    let args = parse_daemon_args(args)?;
    let repo_root = resolve_repo_root(args.repo_root.as_deref())?;
    let config = read_daemon_config(&repo_root);
    let status = read_daemon_status(&repo_root);

    if status.running && !args.foreground {
        let message = daemon_message(&args.locale, "already_running").to_string();
        let result = DaemonActionResult {
            ok: false,
            repo_root: repo_root.to_string_lossy().to_string(),
            action: "start".to_string(),
            status,
            config,
            message,
            injected: Vec::new(),
            removed: Vec::new(),
        };
        print_daemon_action(&result, &args.locale, args.json)?;
        return Ok(0);
    }

    if args.foreground {
        write_stdout_line(daemon_message(&args.locale, "foreground"))?;
        return run_worker_loop(repo_root, config, true).map(|()| 0);
    }

    ensure_guardrails_dir(&repo_root)?;
    let current_exe =
        env::current_exe().map_err(|error| format!("failed to resolve current exe: {error}"))?;
    let mut command = Command::new(current_exe);
    command
        .arg("daemon-worker")
        .arg("--repo-root")
        .arg(repo_root.to_string_lossy().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .current_dir(&repo_root);
    detach_daemon_command(&mut command);
    command
        .spawn()
        .map_err(|error| format!("failed to spawn daemon worker: {error}"))?;

    let status = wait_for_running_status(&repo_root, Duration::from_secs(5));
    let ok = status.running;
    let injected = if ok {
        install_daemon_integrations(&repo_root)
    } else {
        Vec::new()
    };
    let message = if ok {
        daemon_message(&args.locale, "started").to_string()
    } else {
        daemon_message(&args.locale, "start_timeout").to_string()
    };
    let result = DaemonActionResult {
        ok,
        repo_root: repo_root.to_string_lossy().to_string(),
        action: "start".to_string(),
        status,
        config,
        message,
        injected,
        removed: Vec::new(),
    };
    print_daemon_action(&result, &args.locale, args.json)?;
    Ok(if ok { 0 } else { 1 })
}

fn run_stop(args: &[String]) -> Result<i32, String> {
    let args = parse_daemon_args(args)?;
    let repo_root = resolve_repo_root(args.repo_root.as_deref())?;
    let config = read_daemon_config(&repo_root);
    let status = read_daemon_status(&repo_root);
    let mut ok = true;
    let message;
    let removed = uninstall_daemon_integrations(&repo_root);

    if let Some(pid) = status.pid.filter(|_| status.running) {
        ok = stop_process(pid) || !process_is_running(pid);
        cleanup_daemon_files(&repo_root);
        message = if ok {
            daemon_message(&args.locale, "stopped").to_string()
        } else {
            daemon_message(&args.locale, "stop_failed").to_string()
        };
    } else {
        cleanup_daemon_files(&repo_root);
        message = daemon_message(&args.locale, "already_stopped").to_string();
    }

    let result = DaemonActionResult {
        ok,
        repo_root: repo_root.to_string_lossy().to_string(),
        action: "stop".to_string(),
        status: read_daemon_status(&repo_root),
        config,
        message,
        injected: Vec::new(),
        removed,
    };
    print_daemon_action(&result, &args.locale, args.json)?;
    Ok(if ok { 0 } else { 1 })
}

fn run_status(args: &[String]) -> Result<i32, String> {
    let args = parse_daemon_args(args)?;
    let repo_root = resolve_repo_root(args.repo_root.as_deref())?;
    let result = DaemonStatusResult {
        ok: true,
        repo_root: repo_root.to_string_lossy().to_string(),
        status: read_daemon_status(&repo_root),
        config: read_daemon_config(&repo_root),
    };
    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&result)
                .map_err(|error| format!("failed to serialize daemon status: {error}"))?
        );
    } else {
        print_daemon_status(&result, &args.locale)?;
    }
    Ok(0)
}

fn run_worker(args: &[String]) -> Result<(), String> {
    let args = parse_daemon_args(args)?;
    let repo_root = resolve_repo_root(args.repo_root.as_deref())?;
    let config = read_daemon_config(&repo_root);
    run_worker_loop(repo_root, config, args.foreground)
}

fn run_worker_loop(repo_root: PathBuf, config: Value, foreground: bool) -> Result<(), String> {
    ensure_guardrails_dir(&repo_root)?;
    write_pid_file(&repo_root)?;
    let mut checks_run = 0_u64;
    let start_time = timestamp();
    let mut last_check = None::<String>;
    let mut last_signature = None::<String>;
    let interval = check_interval(&config);

    write_info_file(&repo_root, &start_time, checks_run, last_check.as_deref())?;
    log_line(&repo_root, foreground, "Rust daemon worker started.")?;

    loop {
        let signature = changed_file_signature(&repo_root);
        let should_check = last_signature.as_ref() != Some(&signature);
        if should_check {
            last_signature = Some(signature);
            write_result_running(&repo_root)?;
            let result = run_check_once(&repo_root);
            checks_run += 1;
            last_check = Some(timestamp());
            write_info_file(&repo_root, &start_time, checks_run, last_check.as_deref())?;
            write_result_completed(&repo_root, result)?;
        }
        thread::sleep(Duration::from_millis(interval));
    }
}

fn run_check_once(repo_root: &Path) -> Value {
    let result = (|| -> Result<Value, String> {
        let context = build_check_context(repo_root, CheckContextOptions::default())
            .map_err(|error| error.to_string())?;
        let mut findings = run_oss_detectors(&context);
        let plugins = run_semantic_plugins(&context, &mut findings);
        let mut result = build_check_result_from_context(&context, findings);
        result.counts.loaded_plugins = plugins
            .iter()
            .filter(|plugin| plugin.get("status").and_then(Value::as_str) == Some("loaded"))
            .count();
        result.counts.missing_plugins = plugins
            .iter()
            .filter(|plugin| plugin.get("status").and_then(Value::as_str) == Some("missing"))
            .count();
        result.plugins = plugins;
        try_enrich_check_result_with_pro(repo_root, &mut result);
        serde_json::to_value(result).map_err(|error| error.to_string())
    })();

    match result {
        Ok(value) => value,
        Err(error) => json!({
            "ok": false,
            "verdict": "Daemon check failed",
            "error": error,
            "rustPreview": true
        }),
    }
}

fn write_result_running(repo_root: &Path) -> Result<(), String> {
    write_json_file(
        &repo_root.join(DAEMON_RESULT_FILE),
        &json!({
            "timestamp": timestamp(),
            "status": "running",
            "rustPreview": true
        }),
    )
}

fn write_result_completed(repo_root: &Path, result: Value) -> Result<(), String> {
    let ok = result.get("ok").and_then(Value::as_bool).unwrap_or(false);
    write_json_file(
        &repo_root.join(DAEMON_RESULT_FILE),
        &json!({
            "timestamp": timestamp(),
            "status": "completed",
            "ok": ok,
            "result": result,
            "rustPreview": true
        }),
    )
}

fn parse_daemon_args(args: &[String]) -> Result<DaemonArgs, String> {
    let mut parsed = DaemonArgs::default();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--foreground" => {
                parsed.foreground = true;
                index += 1;
            }
            "--json" => {
                parsed.json = true;
                index += 1;
            }
            "--lang" => {
                parsed.locale = read_flag_value(args, index, "--lang")?;
                index += 2;
            }
            "--repo-root" => {
                parsed.repo_root = Some(read_flag_value(args, index, "--repo-root")?);
                index += 2;
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}"));
            }
            value => {
                if parsed.repo_root.is_some() {
                    return Err(format!("unexpected argument: {value}"));
                }
                parsed.repo_root = Some(value.to_string());
                index += 1;
            }
        }
    }
    Ok(parsed)
}

fn resolve_repo_root(arg: Option<&str>) -> Result<PathBuf, String> {
    let base = match arg {
        Some(value) if !value.trim().is_empty() => PathBuf::from(value),
        _ => env::current_dir()
            .map_err(|error| format!("failed to read current directory: {error}"))?,
    };
    Ok(resolve_git_root(&base).unwrap_or(base))
}

fn read_daemon_config(repo_root: &Path) -> Value {
    let default = default_daemon_config();
    let config_path = repo_root.join(DAEMON_CONFIG_FILE);
    let Ok(content) = fs::read_to_string(config_path) else {
        return default;
    };
    let Ok(Value::Object(custom)) = serde_json::from_str::<Value>(&content) else {
        return default;
    };
    let mut merged = default.as_object().cloned().unwrap_or_default();
    for (key, value) in custom {
        merged.insert(key, value);
    }
    Value::Object(merged)
}

fn default_daemon_config() -> Value {
    json!({
        "enabled": true,
        "watchPaths": ["src/", "lib/", "tests/"],
        "ignorePatterns": ["node_modules", ".git", "dist", "coverage"],
        "checkInterval": DEFAULT_CHECK_INTERVAL_MS,
        "notifications": {
            "sound": false,
            "desktop": false
        },
        "autoFix": false,
        "blockOnHighRisk": true
    })
}

fn read_daemon_status(repo_root: &Path) -> DaemonStatus {
    let pid_path = repo_root.join(DAEMON_PID_FILE);
    let pid = fs::read_to_string(&pid_path)
        .ok()
        .and_then(|content| content.trim().parse::<u32>().ok());
    let Some(pid) = pid else {
        return DaemonStatus {
            running: false,
            pid: None,
            start_time: None,
            checks_run: 0,
            last_check: None,
        };
    };

    if !process_is_running(pid) {
        let _ = fs::remove_file(pid_path);
        return DaemonStatus {
            running: false,
            pid: None,
            start_time: None,
            checks_run: 0,
            last_check: None,
        };
    }

    let info = fs::read_to_string(repo_root.join(DAEMON_INFO_FILE))
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .unwrap_or_else(|| json!({}));

    DaemonStatus {
        running: true,
        pid: Some(pid),
        start_time: info
            .get("startTime")
            .and_then(Value::as_str)
            .map(ToString::to_string),
        checks_run: info.get("checksRun").and_then(Value::as_u64).unwrap_or(0),
        last_check: info
            .get("lastCheck")
            .and_then(Value::as_str)
            .map(ToString::to_string),
    }
}

fn process_is_running(pid: u32) -> bool {
    if cfg!(windows) {
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output();
        let Ok(output) = output else {
            return false;
        };
        if !output.status.success() {
            return false;
        }
        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.lines().any(|line| {
            line.split(',')
                .nth(1)
                .is_some_and(|value| value.trim_matches('"') == pid.to_string())
        })
    } else {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .is_ok_and(|status| status.success())
    }
}

fn stop_process(pid: u32) -> bool {
    if cfg!(windows) {
        Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    } else {
        Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .is_ok_and(|status| status.success())
    }
}

#[cfg(windows)]
fn detach_daemon_command(command: &mut Command) {
    use std::os::windows::process::CommandExt;

    const DETACHED_PROCESS: u32 = 0x0000_0008;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    command.creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn detach_daemon_command(_command: &mut Command) {}

fn wait_for_running_status(repo_root: &Path, timeout: Duration) -> DaemonStatus {
    let deadline = SystemTime::now() + timeout;
    loop {
        let status = read_daemon_status(repo_root);
        if status.running || SystemTime::now() >= deadline {
            return status;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn write_pid_file(repo_root: &Path) -> Result<(), String> {
    fs::write(
        repo_root.join(DAEMON_PID_FILE),
        std::process::id().to_string(),
    )
    .map_err(|error| format!("failed to write daemon pid file: {error}"))
}

fn write_info_file(
    repo_root: &Path,
    start_time: &str,
    checks_run: u64,
    last_check: Option<&str>,
) -> Result<(), String> {
    write_json_file(
        &repo_root.join(DAEMON_INFO_FILE),
        &json!({
            "pid": std::process::id(),
            "startTime": start_time,
            "checksRun": checks_run,
            "lastCheck": last_check
        }),
    )
}

fn cleanup_daemon_files(repo_root: &Path) {
    let _ = fs::remove_file(repo_root.join(DAEMON_PID_FILE));
    let _ = fs::remove_file(repo_root.join(DAEMON_INFO_FILE));
}

fn install_daemon_integrations(repo_root: &Path) -> Vec<String> {
    let _ = inject_daemon_rule(repo_root);
    let mut injected = Vec::new();
    for integration in daemon_integrations() {
        if (integration.detect)(repo_root) && (integration.inject)(repo_root).is_ok() {
            injected.push(integration.name.to_string());
        }
    }
    injected
}

fn uninstall_daemon_integrations(repo_root: &Path) -> Vec<String> {
    let _ = remove_daemon_rule(repo_root);
    let mut removed = Vec::new();
    for integration in daemon_integrations() {
        if (integration.remove)(repo_root).is_ok() {
            removed.push(integration.name.to_string());
        }
    }
    removed
}

struct DaemonIntegration {
    name: &'static str,
    detect: fn(&Path) -> bool,
    inject: fn(&Path) -> Result<(), String>,
    remove: fn(&Path) -> Result<(), String>,
}

fn daemon_integrations() -> Vec<DaemonIntegration> {
    vec![
        DaemonIntegration {
            name: "Claude Code",
            detect: |root| root.join(".claude/settings.json").exists(),
            inject: inject_claude_hook,
            remove: remove_claude_hook,
        },
        DaemonIntegration {
            name: "Cursor",
            detect: |root| root.join(".cursor").exists(),
            inject: inject_cursor_hook,
            remove: remove_cursor_hook,
        },
        DaemonIntegration {
            name: "OpenCode",
            detect: |root| root.join(".opencode").exists(),
            inject: inject_opencode_hook,
            remove: remove_opencode_hook,
        },
        DaemonIntegration {
            name: "Codex CLI",
            detect: |root| root.join(".codex").exists(),
            inject: inject_codex_hook,
            remove: remove_codex_hook,
        },
        DaemonIntegration {
            name: "Gemini CLI",
            detect: |root| root.join(".gemini").exists(),
            inject: inject_gemini_hook,
            remove: remove_gemini_hook,
        },
        DaemonIntegration {
            name: "Git",
            detect: |root| root.join(".git").exists(),
            inject: inject_git_hook,
            remove: remove_git_hook,
        },
    ]
}

fn inject_daemon_rule(repo_root: &Path) -> Result<(), String> {
    let agents_path = repo_root.join("AGENTS.md");
    if !agents_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&agents_path)
        .map_err(|error| format!("failed to read AGENTS.md: {error}"))?;
    if content.contains(DAEMON_AGENTS_MARKER_START) {
        return Ok(());
    }
    let block = format!(
        "\n{DAEMON_AGENTS_MARKER_START}\n## Agent Guardrails daemon\n\nAgent Guardrails is watching this repo. After editing files, call `read_daemon_status` or run `agent-guardrails status` before continuing if the daemon reports an error-level finding.\n{DAEMON_AGENTS_MARKER_END}\n"
    );
    fs::write(&agents_path, format!("{}{}", content.trim_end(), block))
        .map_err(|error| format!("failed to update AGENTS.md: {error}"))
}

fn remove_daemon_rule(repo_root: &Path) -> Result<(), String> {
    let agents_path = repo_root.join("AGENTS.md");
    if !agents_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&agents_path)
        .map_err(|error| format!("failed to read AGENTS.md: {error}"))?;
    let Some(start) = content.find(DAEMON_AGENTS_MARKER_START) else {
        return Ok(());
    };
    let Some(end_start) = content.find(DAEMON_AGENTS_MARKER_END) else {
        return Ok(());
    };
    let end = end_start + DAEMON_AGENTS_MARKER_END.len();
    let cleaned = format!(
        "{}\n{}",
        content[..start].trim_end(),
        content[end..].trim_start()
    );
    fs::write(&agents_path, cleaned.trim_end().to_string() + "\n")
        .map_err(|error| format!("failed to update AGENTS.md: {error}"))
}

fn inject_claude_hook(repo_root: &Path) -> Result<(), String> {
    copy_hook_script(
        repo_root,
        "daemon-check.cjs",
        ".claude/hooks/daemon-check.cjs",
    )?;
    let settings_path = repo_root.join(".claude/settings.json");
    let mut settings = read_json_object(&settings_path);
    let hooks = json_object_entry(&mut settings, "hooks");
    let post_tool_use = json_array_entry(hooks, "PostToolUse");
    if !json_array_has_id(post_tool_use, "agent-guardrails:daemon-check") {
        post_tool_use.push(json!({
            "id": "agent-guardrails:daemon-check",
            "matcher": "Edit|Write|MultiEdit|Bash",
            "hooks": [{
                "type": "command",
                "command": format!("node \"{}\"", repo_root.join(".claude/hooks/daemon-check.cjs").display()),
                "timeout": 10
            }]
        }));
    }
    write_json_object(&settings_path, settings)
}

fn remove_claude_hook(repo_root: &Path) -> Result<(), String> {
    let _ = fs::remove_file(repo_root.join(".claude/hooks/daemon-check.cjs"));
    let settings_path = repo_root.join(".claude/settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let mut settings = read_json_object(&settings_path);
    if let Some(post_tool_use) = settings
        .get_mut("hooks")
        .and_then(Value::as_object_mut)
        .and_then(|hooks| hooks.get_mut("PostToolUse"))
        .and_then(Value::as_array_mut)
    {
        post_tool_use.retain(|item| {
            item.get("id").and_then(Value::as_str) != Some("agent-guardrails:daemon-check")
        });
    }
    write_json_object(&settings_path, settings)
}

fn inject_cursor_hook(repo_root: &Path) -> Result<(), String> {
    copy_hook_script(
        repo_root,
        "cursor-check.cjs",
        ".cursor/hooks/cursor-check.cjs",
    )?;
    let hooks_path = repo_root.join(".cursor/hooks.json");
    let mut config = read_json_object(&hooks_path);
    let hooks = json_array_entry(&mut config, "hooks");
    let exists = hooks.iter().any(|group| {
        group
            .pointer("/hooks/afterFileEdit")
            .and_then(Value::as_array)
            .is_some_and(|items| json_array_has_id_ref(items, "agent-guardrails:cursor-check"))
    });
    if !exists {
        hooks.push(json!({
            "version": 1,
            "hooks": {
                "afterFileEdit": [{
                    "id": "agent-guardrails:cursor-check",
                    "command": format!("node \"{}\"", repo_root.join(".cursor/hooks/cursor-check.cjs").display())
                }]
            }
        }));
    }
    write_json_object(&hooks_path, config)
}

fn remove_cursor_hook(repo_root: &Path) -> Result<(), String> {
    let _ = fs::remove_file(repo_root.join(".cursor/hooks/cursor-check.cjs"));
    let hooks_path = repo_root.join(".cursor/hooks.json");
    if !hooks_path.exists() {
        return Ok(());
    }
    let mut config = read_json_object(&hooks_path);
    if let Some(hooks) = config.get_mut("hooks").and_then(Value::as_array_mut) {
        hooks.retain_mut(|group| {
            if let Some(after_file_edit) = group
                .pointer_mut("/hooks/afterFileEdit")
                .and_then(Value::as_array_mut)
            {
                after_file_edit.retain(|item| {
                    item.get("id").and_then(Value::as_str) != Some("agent-guardrails:cursor-check")
                });
                return !after_file_edit.is_empty();
            }
            true
        });
    }
    write_json_object(&hooks_path, config)
}

fn inject_opencode_hook(repo_root: &Path) -> Result<(), String> {
    copy_hook_script(
        repo_root,
        "opencode-plugin.js",
        ".opencode/plugins/guardrails.js",
    )?;
    let config_path = repo_root.join(".opencode/config.json");
    let mut config = read_json_object(&config_path);
    let plugin_path = ".opencode/plugins/guardrails.js";
    let plugins = json_array_entry(&mut config, "plugin");
    if !plugins
        .iter()
        .any(|item| item.as_str() == Some(plugin_path))
    {
        plugins.push(json!(plugin_path));
    }
    write_json_object(&config_path, config)
}

fn remove_opencode_hook(repo_root: &Path) -> Result<(), String> {
    let _ = fs::remove_file(repo_root.join(".opencode/plugins/guardrails.js"));
    let config_path = repo_root.join(".opencode/config.json");
    if !config_path.exists() {
        return Ok(());
    }
    let mut config = read_json_object(&config_path);
    if let Some(plugins) = config.get_mut("plugin").and_then(Value::as_array_mut) {
        plugins.retain(|item| item.as_str() != Some(".opencode/plugins/guardrails.js"));
    }
    write_json_object(&config_path, config)
}

fn inject_codex_hook(repo_root: &Path) -> Result<(), String> {
    copy_hook_script(
        repo_root,
        "codex-check.cjs",
        ".codex/hooks/guardrails-check.js",
    )?;
    let hooks_path = repo_root.join(".codex/hooks.json");
    let mut config = read_json_object(&hooks_path);
    let hooks = json_object_entry(&mut config, "hooks");
    let stop_hooks = json_array_entry(hooks, "Stop");
    if !json_array_has_id(stop_hooks, "agent-guardrails:codex-check") {
        stop_hooks.push(json!({
            "id": "agent-guardrails:codex-check",
            "hooks": [{
                "type": "command",
                "command": "node \".codex/hooks/guardrails-check.js\"",
                "statusMessage": "Running guardrails check...",
                "timeout": 10
            }]
        }));
    }
    write_json_object(&hooks_path, config)
}

fn remove_codex_hook(repo_root: &Path) -> Result<(), String> {
    let _ = fs::remove_file(repo_root.join(".codex/hooks/guardrails-check.js"));
    let hooks_path = repo_root.join(".codex/hooks.json");
    if !hooks_path.exists() {
        return Ok(());
    }
    let mut config = read_json_object(&hooks_path);
    if let Some(stop_hooks) = config
        .get_mut("hooks")
        .and_then(Value::as_object_mut)
        .and_then(|hooks| hooks.get_mut("Stop"))
        .and_then(Value::as_array_mut)
    {
        stop_hooks.retain(|item| {
            item.get("id").and_then(Value::as_str) != Some("agent-guardrails:codex-check")
        });
    }
    write_json_object(&hooks_path, config)
}

fn inject_gemini_hook(repo_root: &Path) -> Result<(), String> {
    copy_hook_script(
        repo_root,
        "gemini-check.cjs",
        ".gemini/hooks/guardrails-check.js",
    )?;
    let settings_path = repo_root.join(".gemini/settings.json");
    let mut settings = read_json_object(&settings_path);
    let hooks = json_object_entry(&mut settings, "hooks");
    let after_tool = json_array_entry(hooks, "AfterTool");
    let exists = after_tool.iter().any(|entry| {
        entry
            .get("hooks")
            .and_then(Value::as_array)
            .is_some_and(|items| {
                items.iter().any(|item| {
                    item.get("name").and_then(Value::as_str) == Some("agent-guardrails-check")
                })
            })
    });
    if !exists {
        after_tool.push(json!({
            "matcher": "write_file|replace|edit",
            "hooks": [{
                "name": "agent-guardrails-check",
                "type": "command",
                "command": "node \"$GEMINI_PROJECT_DIR/.gemini/hooks/guardrails-check.js\"",
                "timeout": 10000,
                "description": "Run agent-guardrails check after file edits"
            }]
        }));
    }
    write_json_object(&settings_path, settings)
}

fn remove_gemini_hook(repo_root: &Path) -> Result<(), String> {
    let _ = fs::remove_file(repo_root.join(".gemini/hooks/guardrails-check.js"));
    let settings_path = repo_root.join(".gemini/settings.json");
    if !settings_path.exists() {
        return Ok(());
    }
    let mut settings = read_json_object(&settings_path);
    if let Some(after_tool) = settings
        .get_mut("hooks")
        .and_then(Value::as_object_mut)
        .and_then(|hooks| hooks.get_mut("AfterTool"))
        .and_then(Value::as_array_mut)
    {
        after_tool.retain_mut(|entry| {
            if let Some(items) = entry.get_mut("hooks").and_then(Value::as_array_mut) {
                items.retain(|item| {
                    item.get("name").and_then(Value::as_str) != Some("agent-guardrails-check")
                });
                return !items.is_empty();
            }
            true
        });
    }
    write_json_object(&settings_path, settings)
}

fn inject_git_hook(repo_root: &Path) -> Result<(), String> {
    let hook_path = repo_root.join(".git/hooks/pre-commit");
    let Some(hook_dir) = hook_path.parent() else {
        return Ok(());
    };
    fs::create_dir_all(hook_dir)
        .map_err(|error| format!("failed to create git hooks directory: {error}"))?;
    let existing = fs::read_to_string(&hook_path).unwrap_or_default();
    if existing.contains("agent-guardrails pre-commit hook:start") {
        return Ok(());
    }
    let source = hook_source_path("pre-commit-check.cjs")?;
    let block = format!(
        "\n# agent-guardrails pre-commit hook:start\nnode \"{}\"\n# agent-guardrails pre-commit hook:end\n",
        source.display()
    );
    fs::write(&hook_path, format!("{}{}", existing.trim_end(), block))
        .map_err(|error| format!("failed to write git pre-commit hook: {error}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&hook_path, fs::Permissions::from_mode(0o755));
    }
    Ok(())
}

fn remove_git_hook(repo_root: &Path) -> Result<(), String> {
    let hook_path = repo_root.join(".git/hooks/pre-commit");
    if !hook_path.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&hook_path)
        .map_err(|error| format!("failed to read git pre-commit hook: {error}"))?;
    let start_marker = "# agent-guardrails pre-commit hook:start";
    let end_marker = "# agent-guardrails pre-commit hook:end";
    let Some(start) = content.find(start_marker) else {
        return Ok(());
    };
    let Some(end_start) = content.find(end_marker) else {
        return Ok(());
    };
    let end = end_start + end_marker.len();
    let cleaned = format!(
        "{}\n{}",
        content[..start].trim_end(),
        content[end..].trim_start()
    );
    if cleaned.trim().is_empty() || cleaned.trim() == "#!/bin/sh" {
        let _ = fs::remove_file(&hook_path);
    } else {
        fs::write(&hook_path, cleaned.trim_end().to_string() + "\n")
            .map_err(|error| format!("failed to write git pre-commit hook: {error}"))?;
    }
    Ok(())
}

fn copy_hook_script(repo_root: &Path, source_name: &str, target: &str) -> Result<(), String> {
    let source = hook_source_path(source_name)?;
    let target_path = repo_root.join(target);
    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::copy(&source, &target_path).map_err(|error| {
        format!(
            "failed to copy {} to {}: {error}",
            source.display(),
            target_path.display()
        )
    })?;
    Ok(())
}

fn hook_source_path(source_name: &str) -> Result<PathBuf, String> {
    let package_root = resolve_package_root()?;
    let source = package_root.join("lib/daemon/hooks").join(source_name);
    if !source.exists() {
        return Err(format!("missing daemon hook script: {}", source.display()));
    }
    Ok(source)
}

fn resolve_package_root() -> Result<PathBuf, String> {
    if let Ok(root) = env::var("AGENT_GUARDRAILS_PACKAGE_ROOT") {
        let path = PathBuf::from(root);
        if path.join("lib/daemon/hooks").exists() {
            return Ok(path);
        }
    }

    let current_exe =
        env::current_exe().map_err(|error| format!("failed to resolve current exe: {error}"))?;
    for ancestor in current_exe.ancestors() {
        if ancestor.join("lib/daemon/hooks").exists() {
            return Ok(ancestor.to_path_buf());
        }
    }
    env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))
}

fn read_json_object(path: &Path) -> serde_json::Map<String, Value> {
    fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_default()
}

fn write_json_object(path: &Path, object: serde_json::Map<String, Value>) -> Result<(), String> {
    write_json_file(path, &Value::Object(object))
}

fn json_object_entry<'a>(
    object: &'a mut serde_json::Map<String, Value>,
    key: &str,
) -> &'a mut serde_json::Map<String, Value> {
    let needs_object = !matches!(object.get(key), Some(Value::Object(_)));
    if needs_object {
        object.insert(key.to_string(), json!({}));
    }
    object
        .get_mut(key)
        .and_then(Value::as_object_mut)
        .expect("object entry")
}

fn json_array_entry<'a>(
    object: &'a mut serde_json::Map<String, Value>,
    key: &str,
) -> &'a mut Vec<Value> {
    let needs_array = !matches!(object.get(key), Some(Value::Array(_)));
    if needs_array {
        object.insert(key.to_string(), json!([]));
    }
    object
        .get_mut(key)
        .and_then(Value::as_array_mut)
        .expect("array entry")
}

fn json_array_has_id(items: &[Value], id: &str) -> bool {
    json_array_has_id_ref(items, id)
}

fn json_array_has_id_ref(items: &[Value], id: &str) -> bool {
    items
        .iter()
        .any(|item| item.get("id").and_then(Value::as_str) == Some(id))
}

fn ensure_guardrails_dir(repo_root: &Path) -> Result<(), String> {
    fs::create_dir_all(repo_root.join(".agent-guardrails"))
        .map_err(|error| format!("failed to create .agent-guardrails directory: {error}"))
}

fn write_json_file(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("failed to serialize JSON: {error}"))?;
    fs::write(path, format!("{content}\n"))
        .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn changed_file_signature(repo_root: &Path) -> String {
    let mut files = list_changed_files(repo_root).files;
    files.sort();
    files.join("\n")
}

fn check_interval(config: &Value) -> u64 {
    config
        .get("checkInterval")
        .and_then(Value::as_u64)
        .filter(|value| *value >= 100)
        .unwrap_or(DEFAULT_CHECK_INTERVAL_MS)
}

fn timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms-{millis}")
}

fn log_line(repo_root: &Path, foreground: bool, message: &str) -> Result<(), String> {
    let line = format!("[{}] {message}\n", timestamp());
    if foreground {
        print!("{line}");
        io::stdout()
            .flush()
            .map_err(|error| format!("failed to flush stdout: {error}"))?;
        return Ok(());
    }
    let path = repo_root.join(DAEMON_LOG_FILE);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .and_then(|mut file| file.write_all(line.as_bytes()))
        .map_err(|error| format!("failed to write daemon log: {error}"))
}

fn print_daemon_action(
    result: &DaemonActionResult,
    locale: &str,
    json_output: bool,
) -> Result<(), String> {
    if json_output {
        println!(
            "{}",
            serde_json::to_string_pretty(result)
                .map_err(|error| format!("failed to serialize daemon result: {error}"))?
        );
        return Ok(());
    }

    println!("{}", result.message);
    println!("{}: {}", daemon_message(locale, "repo"), result.repo_root);
    if let Some(pid) = result.status.pid {
        println!("PID: {pid}");
    }
    if !result.injected.is_empty() {
        println!("Hooks: {}", result.injected.join(", "));
    }
    if !result.removed.is_empty() && result.action == "stop" {
        println!("Cleaned: {}", result.removed.join(", "));
    }
    println!(
        "{}: {}",
        daemon_message(locale, "state"),
        if result.status.running {
            daemon_message(locale, "running")
        } else {
            daemon_message(locale, "stopped_state")
        }
    );
    Ok(())
}

fn print_daemon_status(result: &DaemonStatusResult, locale: &str) -> Result<(), String> {
    println!("{}", daemon_message(locale, "status_title"));
    println!("{}: {}", daemon_message(locale, "repo"), result.repo_root);
    println!(
        "{}: {}",
        daemon_message(locale, "state"),
        if result.status.running {
            daemon_message(locale, "running")
        } else {
            daemon_message(locale, "stopped_state")
        }
    );
    if let Some(pid) = result.status.pid {
        println!("PID: {pid}");
    }
    println!(
        "{}: {}",
        daemon_message(locale, "checks_run"),
        result.status.checks_run
    );
    println!(
        "{}: {}",
        daemon_message(locale, "watch_paths"),
        value_string_array(result.config.get("watchPaths")).join(", ")
    );
    println!(
        "{}: {}ms",
        daemon_message(locale, "check_interval"),
        check_interval(&result.config)
    );
    Ok(())
}

fn value_string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn daemon_message<'a>(locale: &str, key: &str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "already_running") => "Agent Guardrails 后台检查已经在运行。",
        (true, "already_stopped") => "Agent Guardrails 后台检查没有在运行；已清理本地状态文件。",
        (true, "started") => "Agent Guardrails 后台检查已启动。",
        (true, "start_timeout") => "后台检查启动超时，请查看 .agent-guardrails/daemon.log。",
        (true, "stopped") => "Agent Guardrails 后台检查已停止。",
        (true, "stop_failed") => "未能停止后台检查进程。",
        (true, "foreground") => "以前台模式启动 Agent Guardrails 后台检查。按 Ctrl+C 停止。",
        (true, "status_title") => "Agent Guardrails 后台检查状态",
        (true, "repo") => "仓库",
        (true, "state") => "状态",
        (true, "running") => "运行中",
        (true, "stopped_state") => "未运行",
        (true, "checks_run") => "已检查次数",
        (true, "watch_paths") => "检查路径",
        (true, "check_interval") => "检查间隔",
        (_, "already_running") => "Agent Guardrails daemon is already running.",
        (_, "already_stopped") => {
            "Agent Guardrails daemon was not running; local daemon state has been cleaned."
        }
        (_, "started") => "Agent Guardrails daemon started.",
        (_, "start_timeout") => "Daemon start timed out. Check .agent-guardrails/daemon.log.",
        (_, "stopped") => "Agent Guardrails daemon stopped.",
        (_, "stop_failed") => "Failed to stop the daemon process.",
        (_, "foreground") => {
            "Starting Agent Guardrails daemon in the foreground. Press Ctrl+C to stop."
        }
        (_, "status_title") => "Agent Guardrails daemon status",
        (_, "repo") => "Repo",
        (_, "state") => "State",
        (_, "running") => "running",
        (_, "stopped_state") => "stopped",
        (_, "checks_run") => "Checks run",
        (_, "watch_paths") => "Watch paths",
        (_, "check_interval") => "Check interval",
        _ => "",
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn write_stdout_line(message: &str) -> Result<(), String> {
    println!("{message}");
    Ok(())
}
