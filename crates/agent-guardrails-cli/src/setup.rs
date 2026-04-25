use crate::init::{
    InitOptions, SUPPORTED_ADAPTERS, execute_init, find_template_root, load_template,
    relative_display, resolve_target_dir, write_text,
};
use crate::repo::read_config;
use serde::Serialize;
use serde_json::{Value, json};
use std::fs;
use std::path::Path;

const CANONICAL_FLOW: &[&str] = &[
    "read_repo_guardrails",
    "start_agent_native_loop",
    "implement inside the declared scope",
    "finish_agent_native_loop",
];

const FIRST_CHAT_PROMPT: &str = "Please use agent-guardrails for this repo. Read the repo guardrails, turn my rough idea into the smallest safe task, keep the change inside the declared scope, and finish with a reviewer summary.";

pub fn run_setup_cli(args: &[String]) -> i32 {
    match run_setup(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails setup: {error}");
            1
        }
    }
}

#[derive(Default)]
struct SetupArgs {
    target_dir: Option<String>,
    agent: String,
    preset: Option<String>,
    locale: String,
    json: bool,
}

#[derive(Clone)]
struct AgentDefinition {
    id: &'static str,
    display_name: &'static str,
    adapter_id: &'static str,
    target_kind: &'static str,
    target_location: &'static str,
    target_location_description: &'static str,
    safe_repo_config_path: Option<&'static str>,
    snippet: String,
    repo_local_helper_files: Vec<&'static str>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupResult {
    ok: bool,
    repo_root: String,
    agent: AgentResult,
    initialization: InitializationResult,
    mcp: McpResult,
    completed_steps: Vec<String>,
    first_chat_prompt: String,
    canonical_flow: Vec<String>,
    you_will_get: Vec<String>,
    checks: SetupChecks,
    remaining_manual_step: String,
    next_step: String,
}

#[derive(Serialize)]
struct AgentResult {
    id: String,
    #[serde(rename = "displayName")]
    display_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InitializationResult {
    already_initialized: bool,
    auto_initialized: bool,
    preset: String,
    repo_local_files_written: Vec<String>,
    repo_local_files_ready: bool,
    adapter_helper_files: Vec<String>,
    plugin_files_installed: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct McpResult {
    snippet: String,
    target_kind: String,
    target_location: String,
    target_location_description: String,
    repo_config_write: RepoConfigWrite,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoConfigWrite {
    attempted: bool,
    supported: bool,
    wrote: bool,
    config_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupChecks {
    supported_agent: bool,
    package_binary_available: bool,
    mcp_command_available: bool,
    repo_initialized: bool,
    snippet_generated: bool,
    target_location_available: bool,
    repo_local_files_ready: bool,
}

fn run_setup(args: &[String]) -> Result<(), String> {
    let args = parse_setup_args(args)?;
    if args.agent.is_empty() {
        return Err("missing --agent <name>".to_string());
    }
    let agent = agent_definition(&args.agent).ok_or_else(|| {
        format!(
            "unknown adapter: {}. Supported adapters: {}",
            args.agent,
            SUPPORTED_ADAPTERS.join(", ")
        )
    })?;
    let repo_root = resolve_target_dir(args.target_dir.as_deref())?;
    let existing_config =
        read_config(&repo_root).map_err(|error| strip_agent_prefix(&error.to_string()))?;
    let preset = args
        .preset
        .clone()
        .or_else(|| {
            existing_config
                .as_ref()
                .and_then(|config| config.get("preset"))
                .and_then(Value::as_str)
                .map(ToString::to_string)
        })
        .unwrap_or_else(|| "generic".to_string());
    let repo_config_existed = existing_config.is_some();
    let repo_config_write = maybe_write_repo_config(&repo_root, &agent)?;
    let init_result = execute_init(InitOptions {
        target_dir: repo_root.clone(),
        preset: preset.clone(),
        adapters: vec![agent.adapter_id.to_string()],
        locale: args.locale.clone(),
        force: false,
        silent: true,
    })?;
    let plugin_files_installed = install_agent_runtime_files(&repo_root, &agent)?;
    let result = build_setup_result(
        &repo_root,
        &preset,
        &agent,
        repo_config_existed,
        &repo_config_write,
        &init_result,
        plugin_files_installed,
    )?;

    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&result)
                .map_err(|error| format!("failed to serialize setup result: {error}"))?
        );
    } else {
        print_text_summary(&result);
    }

    Ok(())
}

fn parse_setup_args(args: &[String]) -> Result<SetupArgs, String> {
    let mut parsed = SetupArgs {
        locale: "en".to_string(),
        ..SetupArgs::default()
    };
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--agent" => {
                parsed.agent = read_flag_value(args, index, "--agent")?.to_ascii_lowercase();
                index += 2;
            }
            "--preset" => {
                parsed.preset = Some(read_flag_value(args, index, "--preset")?);
                index += 2;
            }
            "--lang" => {
                parsed.locale = read_flag_value(args, index, "--lang")?;
                index += 2;
            }
            "--json" => {
                parsed.json = true;
                index += 1;
            }
            "--write-repo-config" => {
                index += 1;
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}"));
            }
            value => {
                if parsed.target_dir.is_some() {
                    return Err(format!("unexpected argument: {value}"));
                }
                parsed.target_dir = Some(value.to_string());
                index += 1;
            }
        }
    }
    Ok(parsed)
}

fn build_setup_result(
    repo_root: &Path,
    preset: &str,
    agent: &AgentDefinition,
    repo_config_existed: bool,
    repo_config_write: &RepoConfigWrite,
    init_result: &crate::init::InitResult,
    plugin_files_installed: Vec<String>,
) -> Result<SetupResult, String> {
    let helper_files = agent
        .repo_local_helper_files
        .iter()
        .filter(|relative_path| repo_root.join(relative_path).exists())
        .map(|relative_path| (*relative_path).to_string())
        .collect::<Vec<_>>();
    let repo_local_files_ready = agent
        .repo_local_helper_files
        .iter()
        .all(|relative_path| repo_root.join(relative_path).exists());
    let repo_local_files_written = init_result
        .created
        .iter()
        .map(|path| relative_display(repo_root, path))
        .collect::<Vec<_>>();
    let project_root = find_template_root()?
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| repo_root.to_path_buf());
    let checks = SetupChecks {
        supported_agent: true,
        package_binary_available: project_root
            .join("bin")
            .join("agent-guardrails.js")
            .exists(),
        mcp_command_available: project_root
            .join("lib")
            .join("commands")
            .join("mcp.js")
            .exists(),
        repo_initialized: read_config(repo_root)
            .map_err(|error| strip_agent_prefix(&error.to_string()))?
            .is_some(),
        snippet_generated: !agent.snippet.is_empty(),
        target_location_available: !agent.target_location_description.is_empty(),
        repo_local_files_ready,
    };
    let ok = checks.supported_agent
        && checks.package_binary_available
        && checks.mcp_command_available
        && checks.repo_initialized
        && checks.snippet_generated
        && checks.target_location_available
        && checks.repo_local_files_ready;
    let manual_step = if repo_config_write.wrote {
        if let Some(path) = agent.safe_repo_config_path {
            format!(
                "Open {}, point it at {}, and send the first chat message.",
                agent.display_name, path
            )
        } else {
            format!(
                "Open {} and send the first chat message.",
                agent.display_name
            )
        }
    } else {
        format!(
            "Open {}, paste the MCP snippet into {}, and send the first chat message.",
            agent.display_name, agent.target_location
        )
    };

    Ok(SetupResult {
        ok,
        repo_root: repo_root.to_string_lossy().to_string(),
        agent: AgentResult {
            id: agent.id.to_string(),
            display_name: agent.display_name.to_string(),
        },
        initialization: InitializationResult {
            already_initialized: repo_config_existed,
            auto_initialized: !repo_config_existed,
            preset: preset.to_string(),
            repo_local_files_written,
            repo_local_files_ready,
            adapter_helper_files: helper_files,
            plugin_files_installed,
        },
        mcp: McpResult {
            snippet: agent.snippet.clone(),
            target_kind: agent.target_kind.to_string(),
            target_location: agent.target_location.to_string(),
            target_location_description: agent.target_location_description.to_string(),
            repo_config_write: RepoConfigWrite {
                attempted: repo_config_write.attempted,
                supported: repo_config_write.supported,
                wrote: repo_config_write.wrote,
                config_path: repo_config_write.config_path.clone(),
            },
        },
        completed_steps: vec![
            if repo_config_existed {
                format!("Confirmed existing repo guardrails for preset \"{preset}\".")
            } else {
                format!("Initialized repo guardrails with preset \"{preset}\".")
            },
            if agent.repo_local_helper_files.is_empty() {
                "No agent-specific repo-local helper file was needed.".to_string()
            } else {
                format!(
                    "Prepared repo-local helper files: {}.",
                    agent.repo_local_helper_files.join(", ")
                )
            },
            if repo_config_write.wrote {
                format!(
                    "Wrote repo-local agent config: {}.",
                    repo_config_write
                        .config_path
                        .as_deref()
                        .unwrap_or("repo config")
                )
            } else {
                "Prepared the agent config snippet and the first chat message.".to_string()
            },
        ],
        first_chat_prompt: FIRST_CHAT_PROMPT.to_string(),
        canonical_flow: CANONICAL_FLOW
            .iter()
            .map(|item| (*item).to_string())
            .collect(),
        you_will_get: vec![
            "A repo-aware task contract shaped from your request.".to_string(),
            "A bounded implementation loop that stays inside the declared scope.".to_string(),
            "A reviewer summary with changed files, validation status, and remaining risk."
                .to_string(),
        ],
        checks,
        remaining_manual_step: manual_step.clone(),
        next_step: manual_step,
    })
}

fn maybe_write_repo_config(
    repo_root: &Path,
    agent: &AgentDefinition,
) -> Result<RepoConfigWrite, String> {
    let Some(relative_path) = agent.safe_repo_config_path else {
        return Ok(RepoConfigWrite {
            attempted: false,
            supported: false,
            wrote: false,
            config_path: None,
        });
    };
    let absolute_path = repo_root.join(relative_path);
    let snippet: Value = serde_json::from_str(&agent.snippet)
        .map_err(|error| format!("failed to parse agent setup snippet: {error}"))?;
    merge_json_file(&absolute_path, snippet)?;
    Ok(RepoConfigWrite {
        attempted: true,
        supported: true,
        wrote: true,
        config_path: Some(relative_path.to_string()),
    })
}

fn merge_json_file(path: &Path, incoming: Value) -> Result<(), String> {
    let mut existing = if path.exists() {
        serde_json::from_str(&fs::read_to_string(path).unwrap_or_default())
            .unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    merge_json_values(&mut existing, incoming);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&existing)
                .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?
        ),
    )
    .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn merge_json_values(target: &mut Value, incoming: Value) {
    match (target, incoming) {
        (Value::Object(target), Value::Object(incoming)) => {
            for (key, value) in incoming {
                merge_json_values(target.entry(key).or_insert(Value::Null), value);
            }
        }
        (target, incoming) => {
            *target = incoming;
        }
    }
}

fn install_agent_runtime_files(
    repo_root: &Path,
    agent: &AgentDefinition,
) -> Result<Vec<String>, String> {
    let template_root = find_template_root()?;
    let project_root = template_root
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| repo_root.to_path_buf());
    let mut installed = Vec::new();

    match agent.id {
        "opencode" => {
            let target = repo_root
                .join(".opencode")
                .join("plugins")
                .join("guardrails.js");
            if !target.exists() {
                let source = project_root
                    .join("lib")
                    .join("daemon")
                    .join("hooks")
                    .join("opencode-plugin.js");
                if source.exists() {
                    if let Some(parent) = target.parent() {
                        fs::create_dir_all(parent).map_err(|error| {
                            format!("failed to create {}: {error}", parent.display())
                        })?;
                    }
                    fs::copy(&source, &target).map_err(|error| {
                        format!(
                            "failed to copy {} to {}: {error}",
                            source.display(),
                            target.display()
                        )
                    })?;
                    installed.push(".opencode/plugins/guardrails.js".to_string());
                }
            }
        }
        "claude-code" => {
            write_agent_hook(
                repo_root,
                &template_root,
                ".agent-guardrails/hooks/claude-code-pre-tool.cjs",
                "hooks/claude-code-pre-tool.cjs",
                &mut installed,
            )?;
            write_agent_hook(
                repo_root,
                &template_root,
                ".agent-guardrails/hooks/claude-code-post-tool.cjs",
                "hooks/claude-code-post-tool.cjs",
                &mut installed,
            )?;
            merge_hook_settings(
                &repo_root.join(".claude").join("settings.json"),
                "PreToolUse",
                "Write|Edit|MultiEdit|Bash",
                "node .agent-guardrails/hooks/claude-code-pre-tool.cjs",
            )?;
            merge_hook_settings(
                &repo_root.join(".claude").join("settings.json"),
                "PostToolUse",
                "Write|Edit|MultiEdit|Bash",
                "node .agent-guardrails/hooks/claude-code-post-tool.cjs",
            )?;
            installed.push(".claude/settings.json".to_string());
        }
        "gemini" => {
            write_agent_hook(
                repo_root,
                &template_root,
                ".agent-guardrails/hooks/gemini-pre-tool.cjs",
                "hooks/gemini-pre-tool.cjs",
                &mut installed,
            )?;
            write_agent_hook(
                repo_root,
                &template_root,
                ".agent-guardrails/hooks/gemini-post-tool.cjs",
                "hooks/gemini-post-tool.cjs",
                &mut installed,
            )?;
            merge_hook_settings(
                &repo_root.join(".gemini").join("settings.json"),
                "BeforeTool",
                "write_file|replace|edit|run_shell_command",
                "node .agent-guardrails/hooks/gemini-pre-tool.cjs",
            )?;
            merge_hook_settings(
                &repo_root.join(".gemini").join("settings.json"),
                "AfterTool",
                "write_file|replace|edit|run_shell_command",
                "node .agent-guardrails/hooks/gemini-post-tool.cjs",
            )?;
            installed.push(".gemini/settings.json".to_string());
        }
        _ => {}
    }

    Ok(installed)
}

fn write_agent_hook(
    repo_root: &Path,
    template_root: &Path,
    relative_target: &str,
    template: &str,
    installed: &mut Vec<String>,
) -> Result<(), String> {
    let content = load_template(template_root, template, None)?;
    let target = repo_root.join(relative_target);
    write_text(&target, &content, true)?;
    installed.push(relative_target.to_string());
    Ok(())
}

fn merge_hook_settings(
    path: &Path,
    event_name: &str,
    matcher: &str,
    command: &str,
) -> Result<(), String> {
    let mut settings = if path.exists() {
        serde_json::from_str(&fs::read_to_string(path).unwrap_or_default())
            .unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    if !settings.get("hooks").is_some_and(Value::is_object) {
        settings["hooks"] = json!({});
    }
    if !settings["hooks"]
        .get(event_name)
        .is_some_and(Value::is_array)
    {
        settings["hooks"][event_name] = json!([]);
    }
    let hooks = settings["hooks"][event_name]
        .as_array_mut()
        .expect("event hooks array");
    if let Some(entry) = hooks
        .iter_mut()
        .find(|entry| entry.get("matcher").and_then(Value::as_str) == Some(matcher))
    {
        if !entry.get("hooks").is_some_and(Value::is_array) {
            entry["hooks"] = json!([]);
        }
        let command_exists = entry["hooks"].as_array().is_some_and(|items| {
            items.iter().any(|hook| {
                hook.get("type").and_then(Value::as_str) == Some("command")
                    && hook.get("command").and_then(Value::as_str) == Some(command)
            })
        });
        if !command_exists {
            entry["hooks"]
                .as_array_mut()
                .expect("hooks array")
                .push(json!({"type": "command", "command": command, "timeout": 30}));
        }
    } else {
        hooks.push(json!({
            "matcher": matcher,
            "hooks": [{"type": "command", "command": command, "timeout": 30}]
        }));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::write(
        path,
        format!(
            "{}\n",
            serde_json::to_string_pretty(&settings)
                .map_err(|error| format!("failed to serialize {}: {error}", path.display()))?
        ),
    )
    .map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn print_text_summary(result: &SetupResult) {
    println!("Agent Guardrails Setup\n");
    println!("Agent: {}", result.agent.display_name);
    println!("Repo root: {}", result.repo_root);
    if result.initialization.auto_initialized {
        println!(
            "Repo was not initialized. Setup auto-initialized it with preset \"{}\".",
            result.initialization.preset
        );
    } else {
        println!(
            "Repo already has guardrails config. Using preset \"{}\".",
            result.initialization.preset
        );
    }
    println!("\nAlready done:");
    print_list(&result.completed_steps);
    if !result.initialization.repo_local_files_written.is_empty() {
        println!("\nRepo-local files written:");
        print_list(&result.initialization.repo_local_files_written);
    }
    if !result.initialization.adapter_helper_files.is_empty() {
        println!("\nRepo-local helper files ready:");
        print_list(&result.initialization.adapter_helper_files);
    }
    if !result.initialization.plugin_files_installed.is_empty() {
        println!("\nRepo-local helper files ready:");
        print_list(&result.initialization.plugin_files_installed);
    }
    println!("\nDo this now:");
    println!("- {}", result.remaining_manual_step);
    println!(
        "- Agent config location: {}",
        result.mcp.target_location_description
    );
    if result.mcp.repo_config_write.wrote {
        if let Some(path) = &result.mcp.repo_config_write.config_path {
            println!("- Repo-local agent config written: {path}");
        }
    }
    println!("\nConnect your agent:");
    println!("Paste this agent config:");
    println!("```json");
    println!("{}", result.mcp.snippet);
    println!("```");
    println!("\nSay this:");
    println!("First chat message:");
    println!("```text");
    println!("{}", result.first_chat_prompt);
    println!("```");
    println!("\nYou will get:");
    print_list(&result.you_will_get);
    println!("\nCanonical MCP chat flow:");
    print_list(&result.canonical_flow);
    println!("\nSetup self-check:");
    println!(
        "- supported agent: {}",
        check_word(result.checks.supported_agent)
    );
    println!(
        "- CLI binary available: {}",
        check_word(result.checks.package_binary_available)
    );
    println!(
        "- MCP command available: {}",
        check_word(result.checks.mcp_command_available)
    );
    println!(
        "- repo initialized: {}",
        check_word(result.checks.repo_initialized)
    );
    println!(
        "- snippet generated: {}",
        check_word(result.checks.snippet_generated)
    );
    println!(
        "- target location guidance: {}",
        check_word(result.checks.target_location_available)
    );
    println!(
        "- repo-local helper files: {}",
        check_word(result.checks.repo_local_files_ready)
    );
    println!("\nNext step:");
    println!("- {}", result.next_step);
}

fn print_list(items: &[String]) {
    for item in items {
        println!("- {item}");
    }
}

fn check_word(value: bool) -> &'static str {
    if value { "ready" } else { "missing" }
}

fn agent_definition(agent_id: &str) -> Option<AgentDefinition> {
    let json_snippet = json!({
        "mcpServers": {
            "agent-guardrails": {
                "command": "npx",
                "args": ["agent-guardrails", "mcp"]
            }
        }
    });
    let opencode_snippet = json!({
        "$schema": "https://opencode.ai/config.json",
        "mcp": {
            "agent-guardrails": {
                "type": "local",
                "command": ["npx", "agent-guardrails", "mcp"],
                "enabled": true
            }
        }
    });
    match agent_id {
        "codex" => Some(AgentDefinition {
            id: "codex",
            display_name: "Codex",
            adapter_id: "codex",
            target_kind: "user-global-config",
            target_location: "~/.codex/config.toml",
            target_location_description: "Your Codex user config file, commonly `~/.codex/config.toml`.",
            safe_repo_config_path: None,
            snippet: [
                "[mcp_servers.agent-guardrails]",
                "command = \"npx\"",
                "args = [\"agent-guardrails\", \"mcp\"]",
            ]
            .join("\n"),
            repo_local_helper_files: vec![".codex/instructions.md"],
        }),
        "claude-code" => Some(AgentDefinition {
            id: "claude-code",
            display_name: "Claude Code",
            adapter_id: "claude-code",
            target_kind: "repo-local-config",
            target_location: ".mcp.json",
            target_location_description: "Your Claude Code repo config file, commonly `.mcp.json` in the repo root.",
            safe_repo_config_path: Some(".mcp.json"),
            snippet: serde_json::to_string_pretty(&json_snippet).expect("snippet"),
            repo_local_helper_files: vec![
                "CLAUDE.md",
                ".claude/settings.json",
                ".agent-guardrails/hooks/claude-code-pre-tool.cjs",
                ".agent-guardrails/hooks/claude-code-post-tool.cjs",
            ],
        }),
        "cursor" => Some(AgentDefinition {
            id: "cursor",
            display_name: "Cursor",
            adapter_id: "cursor",
            target_kind: "workspace-config",
            target_location: ".cursor/mcp.json",
            target_location_description: "Your Cursor workspace config file, commonly `.cursor/mcp.json`.",
            safe_repo_config_path: Some(".cursor/mcp.json"),
            snippet: serde_json::to_string_pretty(&json_snippet).expect("snippet"),
            repo_local_helper_files: vec![".cursor/rules/agent-guardrails.mdc"],
        }),
        "opencode" => Some(AgentDefinition {
            id: "opencode",
            display_name: "OpenCode",
            adapter_id: "opencode",
            target_kind: "repo-local-config",
            target_location: "opencode.json",
            target_location_description: "Your OpenCode workspace config file, commonly `opencode.json`.",
            safe_repo_config_path: Some("opencode.json"),
            snippet: serde_json::to_string_pretty(&opencode_snippet).expect("snippet"),
            repo_local_helper_files: vec!["AGENTS.md", ".opencode/plugins/guardrails.js"],
        }),
        "gemini" => Some(AgentDefinition {
            id: "gemini",
            display_name: "Gemini CLI",
            adapter_id: "gemini",
            target_kind: "repo-local-config",
            target_location: ".gemini/settings.json",
            target_location_description: "Your Gemini CLI repo settings file, commonly `.gemini/settings.json` in the repo root.",
            safe_repo_config_path: Some(".gemini/settings.json"),
            snippet: serde_json::to_string_pretty(&json_snippet).expect("snippet"),
            repo_local_helper_files: vec![
                "GEMINI.md",
                ".agent-guardrails/hooks/gemini-pre-tool.cjs",
                ".agent-guardrails/hooks/gemini-post-tool.cjs",
            ],
        }),
        _ => None,
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn strip_agent_prefix(value: &str) -> String {
    value
        .strip_prefix("agent-guardrails: ")
        .unwrap_or(value)
        .to_string()
}
