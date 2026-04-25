use crate::check::{
    CheckContextOptions, CheckResult, build_check_context, build_check_result_from_context,
    run_oss_detectors, run_semantic_plugins, try_enrich_check_result_with_pro,
};
use crate::diff::list_changed_files;
use crate::policy::build_policy;
use crate::repo::{DEFAULT_TASK_CONTRACT_PATH, TaskContract, read_config, read_task_contract};
use serde_json::{Value, json};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::{self, BufRead, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const PROTOCOL_VERSION: &str = "2024-11-05";
const SERVER_NAME: &str = "agent-guardrails-mcp";
const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_SESSION_CALL_LIMIT: usize = 50;
const PRO_MCP_SCRIPT: &str = r#"
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const chunks = [];
for await (const chunk of process.stdin) {
  chunks.push(chunk);
}
const input = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');

async function loadPro(repoRoot) {
  if (!repoRoot) return null;
  try {
    const require = createRequire(path.join(repoRoot, 'package.json'));
    const resolved = require.resolve('@agent-guardrails/pro');
    return await import(pathToFileURL(resolved).href);
  } catch {
    return null;
  }
}

function normalizeToolDefinition(tool) {
  if (!tool || typeof tool !== 'object') return null;
  const name = String(tool.name || '').trim();
  if (!name) return null;
  return {
    name,
    description: String(tool.description || 'Agent Guardrails Pro tool.'),
    inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object'
      ? tool.inputSchema
      : { type: 'object', additionalProperties: true }
  };
}

function normalizeResult(data) {
  if (data && typeof data === 'object' && Array.isArray(data.content) && data.structuredContent) {
    return data;
  }
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data ?? {}, null, 2)
      }
    ],
    structuredContent: data ?? {}
  };
}

const pro = await loadPro(input.repoRoot);
if (!pro?.getProMcpToolDefinitions) {
  process.stdout.write(JSON.stringify({ available: false, tools: [] }));
  process.exit(0);
}

const definitions = await pro.getProMcpToolDefinitions({ repoRoot: input.repoRoot });
const tools = (Array.isArray(definitions) ? definitions : [])
  .map(normalizeToolDefinition)
  .filter(Boolean);

if (input.action === 'definitions') {
  process.stdout.write(JSON.stringify({ available: true, tools }));
  process.exit(0);
}

if (input.action === 'call') {
  const name = String(input.name || '').trim();
  if (!tools.some((tool) => tool.name === name)) {
    process.stdout.write(JSON.stringify({ available: false, tools }));
    process.exit(0);
  }
  if (!pro?.callProMcpTool) {
    throw new Error(`Pro MCP tool "${name}" is listed but the installed Pro package cannot run it.`);
  }
  const result = await pro.callProMcpTool(name, {
    ...(input.args && typeof input.args === 'object' ? input.args : {}),
    repoRoot: input.repoRoot
  });
  process.stdout.write(JSON.stringify({ available: true, result: normalizeResult(result) }));
  process.exit(0);
}

process.stdout.write(JSON.stringify({ available: false, tools }));
"#;

pub fn run_mcp_cli(args: &[String]) -> i32 {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!("agent-guardrails mcp");
        println!();
        println!("Start the MCP server over stdio.");
        return 0;
    }

    if let Some(unexpected) = args.iter().find(|arg| arg.starts_with('-')) {
        eprintln!("agent-guardrails mcp: unknown option: {unexpected}");
        return 1;
    }

    let repo_root = match env::current_dir() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("agent-guardrails mcp: failed to read current directory: {error}");
            return 1;
        }
    };

    let stdin = io::stdin();
    let stdout = io::stdout();
    match run_mcp_server(stdin.lock(), stdout.lock(), repo_root) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails mcp: {error}");
            1
        }
    }
}

pub fn run_mcp_server<R: BufRead, W: Write>(
    mut input: R,
    mut output: W,
    repo_root: PathBuf,
) -> Result<(), String> {
    let mut context = McpContext {
        repo_root,
        loop_call_limit: DEFAULT_SESSION_CALL_LIMIT,
        loop_call_count: 0,
    };
    loop {
        let payload = match read_frame(&mut input).map_err(|error| error.to_string())? {
            Some(payload) => payload,
            None => return Ok(()),
        };

        let message = match serde_json::from_slice::<Value>(&payload) {
            Ok(message) => message,
            Err(_) => {
                write_response(
                    &mut output,
                    json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": mcp_error_json(-32700, "Parse error", None)
                    }),
                )?;
                continue;
            }
        };

        match handle_message(&message, &mut context) {
            Ok(Some(response)) => write_response(&mut output, response)?,
            Ok(None) => {}
            Err(error) => {
                if message.get("id").is_some() {
                    write_response(
                        &mut output,
                        json!({
                            "jsonrpc": "2.0",
                            "id": message.get("id").cloned().unwrap_or(Value::Null),
                            "error": error.to_json()
                        }),
                    )?;
                }
            }
        }
    }
}

struct McpContext {
    repo_root: PathBuf,
    loop_call_limit: usize,
    loop_call_count: usize,
}

#[derive(Debug)]
struct McpError {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl McpError {
    fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    fn with_data(code: i64, message: impl Into<String>, data: Value) -> Self {
        Self {
            code,
            message: message.into(),
            data: Some(data),
        }
    }

    fn to_json(&self) -> Value {
        mcp_error_json(self.code, &self.message, self.data.clone())
    }
}

fn handle_message(message: &Value, context: &mut McpContext) -> Result<Option<Value>, McpError> {
    let method = message
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let id = message.get("id").cloned().unwrap_or(Value::Null);

    match method {
        "initialize" => Ok(Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": SERVER_NAME,
                    "version": VERSION
                }
            }
        }))),
        "ping" => Ok(Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {}
        }))),
        "tools/list" => Ok(Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "tools": available_tool_definitions(&context.repo_root)
            }
        }))),
        "tools/call" => {
            let params = message.get("params").unwrap_or(&Value::Null);
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .trim();
            let args = params.get("arguments").unwrap_or(&Value::Null);
            if is_loop_oriented_tool(name) {
                context.loop_call_count += 1;
                if context.loop_call_count > context.loop_call_limit {
                    return Err(McpError::with_data(
                        -32020,
                        format!(
                            "Session call limit exceeded: {} calls to loop-oriented tools (limit: {}). Restart the MCP server to reset.",
                            context.loop_call_count, context.loop_call_limit
                        ),
                        json!({
                            "limit": context.loop_call_limit,
                            "current": context.loop_call_count,
                            "tool": name
                        }),
                    ));
                }
            }
            let result = call_tool(name, args, context)?;
            Ok(Some(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": result
            })))
        }
        "notifications/initialized" => Ok(None),
        _ if message.get("id").is_some() => Ok(Some(json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": mcp_error_json(-32601, &format!("Method \"{method}\" not found."), None)
        }))),
        _ => Ok(None),
    }
}

fn call_tool(name: &str, args: &Value, context: &McpContext) -> Result<Value, McpError> {
    match name {
        "read_repo_guardrails" => read_repo_guardrails(args, context),
        "suggest_task_contract" => suggest_task_contract(args, context),
        "start_agent_native_loop" => start_agent_native_loop(args, context),
        "check_after_edit" => check_after_edit(args, context),
        "finish_agent_native_loop" => finish_agent_native_loop(args, context),
        "run_guardrail_check" => run_guardrail_check(args, context),
        "summarize_review_risks" => summarize_review_risks(args),
        "plan_rough_intent" => plan_rough_intent(args, context),
        "read_daemon_status" => Ok(create_json_result(read_daemon_status(args, context))),
        "explain_change" => explain_change(args, context),
        "query_archaeology" => query_archaeology(args, context),
        _ => match call_pro_mcp_tool_if_available(name, args, &context.repo_root)? {
            Some(result) => Ok(result),
            None => Err(McpError::new(-32601, format!("Unknown tool \"{name}\"."))),
        },
    }
}

pub fn call_tool_for_repo(name: &str, args: Value, repo_root: &Path) -> Result<Value, String> {
    let context = McpContext {
        repo_root: repo_root.to_path_buf(),
        loop_call_limit: DEFAULT_SESSION_CALL_LIMIT,
        loop_call_count: 0,
    };
    call_tool(name, &args, &context).map_err(|error| error.message)
}

pub fn list_tools_for_repo(repo_root: &Path) -> Vec<Value> {
    available_tool_definitions(repo_root)
}

fn is_loop_oriented_tool(name: &str) -> bool {
    matches!(
        name,
        "start_agent_native_loop"
            | "check_after_edit"
            | "finish_agent_native_loop"
            | "run_guardrail_check"
            | "summarize_review_risks"
            | "explain_change"
            | "query_archaeology"
    )
}

fn read_repo_guardrails(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let config = read_config(&repo_root)
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .ok_or_else(|| {
            McpError::new(
                -32010,
                "Missing .agent-guardrails/config.json in the requested repo.",
            )
        })?;
    let policy = build_policy(&config);
    let preset = config
        .get("preset")
        .and_then(Value::as_str)
        .unwrap_or("generic");
    let defaults = plan_defaults(&config);

    let data = json!({
        "repoRoot": repo_root.to_string_lossy(),
        "preset": preset,
        "defaults": defaults,
        "policy": {
            "allowedPaths": policy.allowed_paths,
            "maxChangedFilesPerTask": policy.consistency.max_changed_files_per_task,
            "maxTopLevelEntries": policy.consistency.max_top_level_entries,
            "requireTestsWithSourceChanges": policy.correctness.require_tests_with_source_changes
        },
        "protectedAreas": clone_or_default(&config, "protectedAreas", json!([])),
        "productionProfiles": clone_or_default(&config, "productionProfiles", json!({})),
        "languagePlugins": clone_or_default(&config, "languagePlugins", json!({})),
        "rustPreview": true
    });

    Ok(create_json_result(data))
}

fn suggest_task_contract(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    Ok(create_json_result(build_task_contract_suggestion(
        args, context,
    )?))
}

fn build_task_contract_suggestion(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let task = args
        .get("taskRequest")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if task.is_empty() {
        return Err(McpError::new(-32602, "taskRequest is required."));
    }

    let config = read_config(&repo_root)
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .ok_or_else(|| {
            McpError::new(
                -32010,
                "Missing .agent-guardrails/config.json in the requested repo.",
            )
        })?;
    let overrides = args.get("overrides").unwrap_or(&Value::Null);
    let defaults = plan_defaults(&config);
    let selected_files = unique_strings(
        value_string_array(args.get("selectedFiles"))
            .into_iter()
            .chain(env_runtime_files("AGENT_GUARDRAILS_SELECTED_FILES"))
            .map(|item| normalize_repo_path(&item))
            .filter(|item| !item.is_empty())
            .collect(),
    );
    let changed_files = unique_strings(
        value_string_array(args.get("changedFiles"))
            .into_iter()
            .chain(env_runtime_files("AGENT_GUARDRAILS_CHANGED_FILES"))
            .map(|item| normalize_repo_path(&item))
            .filter(|item| !item.is_empty())
            .collect(),
    );
    let explicit_intended_files = value_string_list(overrides.get("intended-files"))
        .into_iter()
        .map(|item| normalize_repo_path(&item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    let intended_files = if explicit_intended_files.is_empty() {
        unique_strings(
            selected_files
                .iter()
                .chain(changed_files.iter())
                .cloned()
                .collect(),
        )
    } else {
        unique_strings(explicit_intended_files)
    };
    let explicit_allowed_paths = value_string_list(
        overrides
            .get("allow-paths")
            .or_else(|| overrides.get("allow")),
    )
    .into_iter()
    .map(|item| normalize_repo_path(&item))
    .filter(|item| !item.is_empty())
    .collect::<Vec<_>>();
    let allowed_paths = if !explicit_allowed_paths.is_empty() {
        unique_strings(explicit_allowed_paths)
    } else if !intended_files.is_empty() {
        unique_strings(
            intended_files
                .iter()
                .filter_map(|file| parent_scope(file))
                .collect(),
        )
    } else {
        unique_strings(value_string_array(defaults.get("allowedPaths")))
    };
    let explicit_required_commands = value_string_list(
        overrides
            .get("required-commands")
            .or_else(|| overrides.get("commands")),
    );
    let required_commands_were_explicit = !explicit_required_commands.is_empty();
    let required_commands = if explicit_required_commands.is_empty() {
        unique_strings(value_string_array(defaults.get("requiredCommands")))
    } else {
        unique_strings(explicit_required_commands)
    };
    let explicit_evidence_paths = value_string_list(
        overrides
            .get("evidence-paths")
            .or_else(|| overrides.get("evidence")),
    )
    .into_iter()
    .map(|item| normalize_repo_path(&item))
    .filter(|item| !item.is_empty())
    .collect::<Vec<_>>();
    let evidence_paths_were_explicit = !explicit_evidence_paths.is_empty();
    let evidence_paths = if explicit_evidence_paths.is_empty() {
        unique_strings(value_string_array(defaults.get("evidencePaths")))
    } else {
        unique_strings(explicit_evidence_paths)
    };
    let protected_paths = value_string_list(overrides.get("protected-paths"))
        .into_iter()
        .map(|item| normalize_repo_path(&item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    let allowed_change_types = value_string_list(overrides.get("allowed-change-types"))
        .into_iter()
        .map(|item| item.trim().to_ascii_lowercase())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>();
    let validation_profile = overrides
        .get("validation-profile")
        .and_then(Value::as_str)
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "standard".to_string());
    let configured_risk = overrides
        .get("risk-level")
        .and_then(Value::as_str)
        .map(|value| value.trim().to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "standard".to_string());
    let risk_dimensions = risk_dimensions(overrides, &defaults);
    let selected_repo_files = unique_strings(
        selected_files
            .iter()
            .chain(changed_files.iter())
            .cloned()
            .collect(),
    );
    let protected_matches = protected_matches(
        &config,
        if selected_repo_files.is_empty() {
            &intended_files
        } else {
            &selected_repo_files
        },
    );
    let protected_risk = max_risk(
        &protected_matches
            .iter()
            .filter_map(|match_value| {
                match_value
                    .get("minimumRiskLevel")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })
            .collect::<Vec<_>>(),
    );
    let risk_level = max_risk(&[configured_risk, protected_risk]);
    let requires_review_notes = parse_bool_value(overrides.get("requires-review-notes"))
        || protected_matches.iter().any(|match_value| {
            match_value
                .get("requiresReviewNotes")
                .and_then(Value::as_bool)
                == Some(true)
        });
    let mut auto_filled = Vec::new();
    if value_string_list(
        overrides
            .get("allow-paths")
            .or_else(|| overrides.get("allow")),
    )
    .is_empty()
        && !allowed_paths.is_empty()
    {
        auto_filled.push("allowed paths".to_string());
    }
    if !required_commands_were_explicit && !required_commands.is_empty() {
        auto_filled.push("required commands".to_string());
    }
    if !evidence_paths_were_explicit && !evidence_paths.is_empty() {
        auto_filled.push("evidence paths".to_string());
    }
    if value_string_list(overrides.get("intended-files")).is_empty() && !intended_files.is_empty() {
        auto_filled.push("intended files".to_string());
    }
    for (key, label) in [
        ("securityRequirements", "security requirements"),
        ("dependencyRequirements", "dependency requirements"),
        ("performanceRequirements", "performance requirements"),
        ("understandingRequirements", "understanding requirements"),
        ("continuityRequirements", "continuity requirements"),
    ] {
        if risk_dimensions
            .get(key)
            .and_then(Value::as_array)
            .is_some_and(|items| !items.is_empty())
        {
            auto_filled.push(label.to_string());
        }
    }

    let contract_source = if !selected_repo_files.is_empty() {
        "runtime-suggested"
    } else if auto_filled.is_empty() {
        "manual"
    } else {
        "preset-defaults"
    };
    let created_at = current_timestamp();
    let next_actions = build_task_next_actions(
        &required_commands,
        &evidence_paths,
        &risk_level,
        requires_review_notes,
    );
    let finish_check_hints = finish_check_hints(&required_commands, &evidence_paths);
    let rough_intent = rough_intent_suggestion(
        &task,
        &intended_files,
        &allowed_paths,
        &required_commands,
        &evidence_paths,
    );
    let mut session_next_actions = next_actions.clone();
    if let Some(first_next_action) = rough_intent
        .as_ref()
        .and_then(|value| value.get("firstNextAction"))
        .and_then(Value::as_str)
    {
        session_next_actions.insert(0, first_next_action.to_string());
    }
    session_next_actions = unique_strings(session_next_actions);

    let session = json!({
        "version": 1,
        "sessionId": format!("rust-mcp-{}-{}", std::process::id(), created_at),
        "createdAt": created_at,
        "repoRoot": repo_root.to_string_lossy(),
        "taskRequest": task,
        "contractSource": contract_source,
        "selectedFiles": selected_repo_files,
        "changedFiles": changed_files,
        "autoFilledFields": auto_filled,
        "requiredCommandsSuggested": required_commands,
        "evidencePathSuggested": evidence_paths.first().cloned().unwrap_or_default(),
        "riskDimensions": risk_dimensions,
        "finishCheckHints": finish_check_hints,
        "riskSignals": protected_matches,
        "archaeologyNotes": [],
        "nextActions": session_next_actions,
        "roughIntent": rough_intent
    });
    let contract = json!({
        "task": task,
        "preset": config.get("preset").and_then(Value::as_str).unwrap_or("generic"),
        "allowedPaths": allowed_paths,
        "intendedFiles": intended_files,
        "requiredCommands": required_commands,
        "evidencePaths": evidence_paths,
        "protectedPaths": protected_paths,
        "allowedChangeTypes": allowed_change_types,
        "riskLevel": risk_level,
        "requiresReviewNotes": requires_review_notes,
        "validationProfile": validation_profile,
        "securityRequirements": session["riskDimensions"]["securityRequirements"],
        "dependencyRequirements": session["riskDimensions"]["dependencyRequirements"],
        "performanceRequirements": session["riskDimensions"]["performanceRequirements"],
        "understandingRequirements": session["riskDimensions"]["understandingRequirements"],
        "continuityRequirements": session["riskDimensions"]["continuityRequirements"],
        "session": session.clone(),
        "roughIntent": rough_intent
    });
    let suggestions = json!({
        "allowedPaths": contract["allowedPaths"],
        "intendedFiles": contract["intendedFiles"],
        "requiredCommands": contract["requiredCommands"],
        "evidencePaths": contract["evidencePaths"],
        "riskLevel": contract["riskLevel"],
        "requiresReviewNotes": contract["requiresReviewNotes"],
        "validationProfile": contract["validationProfile"],
        "riskDimensions": contract["session"]["riskDimensions"],
        "roughIntent": contract["roughIntent"]
    });

    Ok(json!({
        "contract": contract,
        "session": session,
        "suggestions": suggestions,
        "rustPreview": true
    }))
}

fn start_agent_native_loop(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let contract_path = args
        .get("contractPath")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_TASK_CONTRACT_PATH)
        .trim()
        .to_string();
    let write_files = args
        .get("writeFiles")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let bootstrap = build_task_contract_suggestion(args, context)?;
    let mut contract = bootstrap
        .get("contract")
        .cloned()
        .unwrap_or_else(|| json!({}));
    if let Some(object) = contract.as_object_mut() {
        object.insert("schemaVersion".to_string(), json!(3));
        object.insert("createdAt".to_string(), json!(current_timestamp()));
    }

    let evidence_files = ensure_evidence_files(&repo_root, &contract, write_files)?;
    if write_files {
        write_task_contract_file(&repo_root, &contract_path, &contract)?;
    }

    let session = contract
        .get("session")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let guardrails = read_repo_guardrails(args, context)?
        .get("structuredContent")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let finish_check = build_finish_check_value(&repo_root, &session, &[], "");
    let continuity = build_start_continuity(&contract);
    let loop_next_actions = unique_strings(
        value_string_array(session.get("nextActions"))
            .into_iter()
            .chain(value_string_array(finish_check.get("nextActions")))
            .chain(value_string_array(continuity.get("nextActions")))
            .collect(),
    );
    let data = json!({
        "guardrails": guardrails,
        "contractPath": normalize_repo_path(&contract_path),
        "contract": contract,
        "session": session,
        "evidenceFiles": evidence_files,
        "finishCheck": finish_check,
        "continuity": continuity,
        "loop": {
            "status": "bootstrapped",
            "reuseTargets": continuity.get("reuseTargets").cloned().unwrap_or_else(|| json!([])),
            "nextActions": loop_next_actions
        },
        "rustPreview": true
    });
    let summary = start_agent_native_loop_summary(&data);

    Ok(create_human_readable_json_result(data, summary))
}

fn run_guardrail_check(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    read_config(&repo_root)
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .ok_or_else(|| {
            McpError::new(
                -32010,
                "Missing .agent-guardrails/config.json in the requested repo.",
            )
        })?;

    let options = CheckContextOptions {
        base_ref: args
            .get("baseRef")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| value.trim().to_string()),
        contract_path: args
            .get("contractPath")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(|value| normalize_repo_path(value)),
        commands_run: value_string_list(args.get("commandsRun")),
    };
    let data = run_rust_check_data(&repo_root, options)?;

    Ok(create_json_result(data))
}

fn run_rust_check_data(repo_root: &Path, options: CheckContextOptions) -> Result<Value, McpError> {
    let context_snapshot =
        build_check_context(repo_root, options).map_err(|error| McpError::new(-32603, error))?;
    let mut findings = run_oss_detectors(&context_snapshot);
    let plugins = run_semantic_plugins(&context_snapshot, &mut findings);
    let mut result = build_check_result_from_context(&context_snapshot, findings);
    apply_plugin_metadata(&mut result, plugins);
    try_enrich_check_result_with_pro(&repo_root, &mut result);
    let mut data = serde_json::to_value(result).map_err(|error| {
        McpError::new(-32603, format!("failed to serialize check result: {error}"))
    })?;
    if let Some(object) = data.as_object_mut() {
        object.insert("rustPreview".to_string(), json!(true));
    }

    Ok(data)
}

fn check_after_edit(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let cache_path = repo_root
        .join(".agent-guardrails")
        .join("daemon-result.json");
    let cache_data = read_json_file(&cache_path);
    let cache_age_ms = cache_data
        .as_ref()
        .and_then(|data| data.get("timestamp"))
        .and_then(Value::as_i64)
        .map(|timestamp| current_millis().saturating_sub(timestamp));
    let fresh_cache = cache_age_ms.is_some_and(|age| (0..30_000).contains(&age));

    if fresh_cache {
        if let Some(cache) = cache_data.as_ref() {
            let findings = check_findings(cache);
            let data = check_after_edit_data_from_findings(
                "cache",
                findings,
                cache_age_ms.map(|age| (age / 1000) as usize),
                cache.get("score").cloned(),
                cache.get("scoreVerdict").cloned(),
            );
            let summary = check_after_edit_summary(&data, true);
            return Ok(create_human_readable_json_result(data, summary));
        }
    }

    if read_config(&repo_root)
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .is_none()
    {
        let data = json!({
            "status": if cache_data.is_some() { "stale" } else { "no_config" },
            "newFindings": [],
            "cacheAge": Value::Null,
            "rustPreview": true
        });
        let summary =
            "No fresh daemon cache is available. Set up agent-guardrails before relying on post-edit checks.".to_string();
        return Ok(create_human_readable_json_result(data, summary));
    }

    let result = run_rust_check_data(
        &repo_root,
        CheckContextOptions {
            base_ref: None,
            contract_path: None,
            commands_run: Vec::new(),
        },
    )?;
    let findings = check_findings(&result);
    let data = check_after_edit_data_from_findings(
        if cache_data.is_some() {
            "stale"
        } else {
            "no_config"
        },
        findings,
        None,
        result.get("score").cloned(),
        result.get("scoreVerdict").cloned(),
    );
    let summary = check_after_edit_summary(&data, false);
    Ok(create_human_readable_json_result(data, summary))
}

fn finish_agent_native_loop(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let contract_path = args
        .get("contractPath")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_TASK_CONTRACT_PATH)
        .trim()
        .to_string();
    let contract = read_task_contract(&repo_root, Some(&contract_path))
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .ok_or_else(|| {
            McpError::new(
                -32010,
                "Could not finish agent loop. Ensure a task contract exists.",
            )
        })?;
    let normalized_commands = unique_strings(value_string_list(args.get("commandsRun")));
    let evidence_files = args
        .get("evidence")
        .filter(|value| value.is_object())
        .map(|evidence| {
            write_evidence_update(&repo_root, &contract, evidence, &normalized_commands)
        })
        .transpose()?
        .unwrap_or_default();
    let base_ref = args
        .get("baseRef")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_string());
    let check_result = run_rust_check_data(
        &repo_root,
        CheckContextOptions {
            base_ref,
            contract_path: Some(normalize_repo_path(&contract_path)),
            commands_run: normalized_commands,
        },
    )?;
    let reviewer_summary = summarize_review_risks_from_check_result(&check_result)?;
    let contract_value = serde_json::to_value(&contract).unwrap_or_else(|_| json!({}));
    let precision_prompts =
        generate_precision_prompts(&value_array(check_result.get("findings")), &contract_value);
    let data = json!({
        "contractPath": normalize_repo_path(&contract_path),
        "evidenceFiles": evidence_files,
        "checkResult": check_result,
        "reviewerSummary": reviewer_summary,
        "precisionPrompts": precision_prompts,
        "rustPreview": true
    });
    let summary = finish_agent_native_loop_summary(&data);

    Ok(create_human_readable_json_result(data, summary))
}

fn summarize_review_risks(args: &Value) -> Result<Value, McpError> {
    let check_result = args
        .get("checkResult")
        .filter(|value| value.is_object())
        .ok_or_else(|| McpError::new(-32602, "checkResult is required."))?;

    Ok(create_json_result(
        summarize_review_risks_from_check_result(check_result)?,
    ))
}

fn plan_rough_intent(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let task = args
        .get("task")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if task.is_empty() {
        return Err(McpError::new(-32602, "task is required."));
    }

    let mode = args
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("suggest")
        .trim()
        .to_ascii_lowercase();
    let locale = args
        .get("locale")
        .and_then(Value::as_str)
        .unwrap_or("en")
        .trim()
        .to_string();
    let config = read_config(&repo_root)
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .unwrap_or_else(default_mcp_config);
    let defaults = plan_defaults(&config);
    let changed_files = list_changed_files(&repo_root).files;
    let analysis = rough_intent_analysis(&task, &repo_root, &defaults, &changed_files);
    let auto_accepted = mode == "auto"
        && analysis
            .get("confidence")
            .and_then(Value::as_f64)
            .unwrap_or_default()
            >= 0.6;
    let data = if auto_accepted {
        json!({
            "status": "auto_accepted",
            "confidence": analysis["confidence"],
            "contract": {
                "task": task,
                "taskType": analysis["taskType"],
                "allowedPaths": analysis["inferred"]["allowedPaths"],
                "requiredCommands": analysis["inferred"]["requiredCommands"],
                "riskLevel": analysis["inferred"]["riskLevel"],
                "guardRules": analysis["inferred"]["guardRules"],
                "evidencePath": analysis["inferred"]["evidencePath"]
            },
            "message": localized_rough_message(&locale, "auto_accepted", &analysis),
            "rustPreview": true
        })
    } else {
        json!({
            "status": "suggestion",
            "task": task,
            "taskType": analysis["taskType"],
            "confidence": analysis["confidence"],
            "inferred": analysis["inferred"],
            "sources": analysis["sources"],
            "display": localized_rough_display(&locale, &analysis),
            "actions": [
                { "type": "accept", "label": localized_action(&locale, "accept") },
                { "type": "modify", "label": localized_action(&locale, "modify") },
                { "type": "reject", "label": localized_action(&locale, "reject") }
            ],
            "message": localized_rough_message(&locale, "suggestion", &analysis),
            "rustPreview": true
        })
    };

    Ok(create_json_result(data))
}

fn explain_change(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let locale = args
        .get("locale")
        .and_then(Value::as_str)
        .unwrap_or("en")
        .to_string();
    let config = read_config(&repo_root)
        .map_err(|error| McpError::new(-32603, error.to_string()))?
        .unwrap_or_else(default_mcp_config);
    let contract = read_task_contract(&repo_root, None)
        .map_err(|error| McpError::new(-32603, error.to_string()))?;
    let task = contract
        .as_ref()
        .map(|contract| contract.task.clone())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_default();
    let changed = list_changed_files(&repo_root);
    let stats = git_numstat(&repo_root);
    let mut categories: BTreeMap<String, Vec<String>> = BTreeMap::new();
    let mut files = Vec::new();
    let mut total_additions = 0_i64;
    let mut total_deletions = 0_i64;

    for file_path in changed.files.iter().take(10) {
        let normalized = normalize_repo_path(file_path);
        let category = classify_explain_change_category(&normalized, &config);
        let (additions, deletions, binary) =
            stats.get(&normalized).cloned().unwrap_or((0, 0, false));
        total_additions += additions;
        total_deletions += deletions;
        categories
            .entry(category.clone())
            .or_default()
            .push(normalized.clone());
        files.push(json!({
            "path": normalized,
            "changeType": category_change_type(&category),
            "nature": category,
            "summary": file_change_summary(&locale, file_path, &category),
            "additions": additions,
            "deletions": deletions,
            "binary": binary
        }));
    }

    let risk_indicators = change_risk_indicators(&files, total_additions);
    let category_value = categories
        .into_iter()
        .map(|(category, paths)| (category, json!(paths)))
        .collect::<serde_json::Map<_, _>>();
    let summary = change_summary_text(
        &locale,
        changed.files.len(),
        &category_value,
        &task,
        &risk_indicators,
    );
    let archaeology = json!({
        "timestamp": current_timestamp(),
        "sessionId": contract
            .as_ref()
            .and_then(|contract| contract.extra.get("session"))
            .and_then(|session| session.get("sessionId"))
            .cloned()
            .unwrap_or(Value::Null),
        "task": task,
        "files": files,
        "totalAdditions": total_additions,
        "totalDeletions": total_deletions,
        "riskIndicators": risk_indicators,
        "summary": summary
    });

    Ok(create_json_result(json!({
        "summary": summary,
        "files": archaeology["files"],
        "categories": Value::Object(category_value),
        "riskIndicators": archaeology["riskIndicators"],
        "fileCount": changed.files.len(),
        "task": task,
        "archaeology": archaeology,
        "rustPreview": true
    })))
}

fn query_archaeology(args: &Value, context: &McpContext) -> Result<Value, McpError> {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let session_id = args.get("sessionId").and_then(Value::as_str);
    let store_path = repo_root.join(".agent-guardrails").join("archaeology.json");
    let store = read_json_file(&store_path).unwrap_or_else(|| {
        json!({
            "version": 1,
            "notes": [],
            "lastUpdated": Value::Null
        })
    });
    let mut notes = value_array(store.get("notes"));
    if let Some(session_id) = session_id {
        notes.retain(|note| note.get("sessionId").and_then(Value::as_str) == Some(session_id));
    }
    let note_count = notes.len();

    Ok(create_json_result(json!({
        "sessionId": session_id,
        "notes": notes,
        "noteCount": note_count,
        "lastUpdated": store.get("lastUpdated").cloned().unwrap_or(Value::Null),
        "rustPreview": true
    })))
}

fn summarize_review_risks_from_check_result(check_result: &Value) -> Result<Value, McpError> {
    let review_summary = check_result
        .pointer("/review/summary")
        .unwrap_or(&Value::Null);
    let findings = value_array(check_result.get("findings"));
    let risk_concerns = value_array(check_result.pointer("/review/riskConcerns"));
    let blocking_risk_concerns = risk_concerns
        .iter()
        .filter(|finding| is_blocking_risk_concern(finding))
        .count();
    let has_scope_issues = number_field(review_summary, "scopeIssues") > 0;
    let has_validation_issues = number_field(review_summary, "validationIssues") > 0;
    let has_blocking_risk_concerns = blocking_risk_concerns > 0;
    let missing_required_commands = value_string_array(check_result.get("missingRequiredCommands"));
    let missing_evidence_paths = value_string_array(check_result.get("missingEvidencePaths"));
    let mut next_actions = Vec::<String>::new();

    next_actions.extend(recovery_guidance(&findings, "error"));
    next_actions.extend(recovery_guidance(&findings, "warning"));

    if !missing_required_commands.is_empty() {
        next_actions.push(format!(
            "Run the missing required commands: {}",
            missing_required_commands.join(", ")
        ));
    }
    if !missing_evidence_paths.is_empty() {
        next_actions.push(format!(
            "Create or update evidence: {}",
            missing_evidence_paths.join(", ")
        ));
    }
    if has_scope_issues {
        next_actions
            .push("Narrow the change or update the task contract before review.".to_string());
        next_actions.push(
            "If the wider scope is intentional, make that scope explicit in the contract."
                .to_string(),
        );
    }
    if number_field(review_summary, "consistencyConcerns") > 0 {
        next_actions.push("Resolve consistency concerns before review.".to_string());
    }
    if has_blocking_risk_concerns {
        next_actions
            .push("Reduce or explain the remaining high-risk change before review.".to_string());
    }
    if let Some(reminder) = risk_dimension_reminder(check_result) {
        next_actions.push(reminder);
    }

    let continuity = check_result.get("continuity").unwrap_or(&Value::Null);
    let continuity_hints = value_string_array(continuity.get("hints"));
    let continuity_next_actions = value_string_array(continuity.get("nextActions"));
    let future_maintenance_risks = continuity
        .get("futureMaintenanceRisks")
        .cloned()
        .filter(Value::is_array)
        .unwrap_or_else(|| json!([]));

    if next_actions.is_empty() && !bool_field(check_result, "ok") {
        next_actions.push("Fix blocking guardrail issues before review.".to_string());
    }
    if next_actions.is_empty() {
        next_actions.push("Checks passed. Use the summary as reviewer context.".to_string());
    }

    let deploy_readiness = build_deploy_readiness(
        check_result,
        has_scope_issues,
        has_validation_issues,
        has_blocking_risk_concerns,
    );
    let deploy_ready = deploy_readiness.get("status").and_then(Value::as_str) == Some("ready");
    let verdict = if has_validation_issues {
        "Validation incomplete"
    } else if has_scope_issues {
        "Needs contract update"
    } else if has_blocking_risk_concerns {
        "High-risk change"
    } else if deploy_ready {
        "Safe to deploy"
    } else {
        "Safe to review"
    };

    let mut combined_next_actions = next_actions;
    combined_next_actions.extend(continuity_hints);
    combined_next_actions.extend(continuity_next_actions);

    Ok(json!({
        "status": if bool_field(check_result, "ok") { "pass" } else { "fail" },
        "verdict": verdict,
        "scoreVerdict": check_result
            .get("scoreVerdict")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "deployReadiness": deploy_readiness,
        "postDeployMaintenance": build_post_deploy_maintenance(check_result),
        "costHints": build_cost_hints(check_result, &findings),
        "topRisks": top_risks(check_result),
        "futureMaintenanceRisks": future_maintenance_risks,
        "nextActions": unique_strings(combined_next_actions),
        "rustPreview": true
    }))
}

fn read_daemon_status(args: &Value, context: &McpContext) -> Value {
    let repo_root = resolve_repo_root(args, &context.repo_root);
    let guardrails_dir = repo_root.join(".agent-guardrails");
    let pid_path = guardrails_dir.join("daemon.pid");
    let info_path = guardrails_dir.join("daemon-info.json");
    let config_path = guardrails_dir.join("daemon.json");
    let result_path = guardrails_dir.join("daemon-result.json");

    let pid = fs::read_to_string(pid_path)
        .ok()
        .and_then(|raw| raw.trim().parse::<u32>().ok());
    let running = pid.map(is_process_running).unwrap_or(false);
    let info = read_json_file(&info_path).unwrap_or_else(|| json!({}));
    let config = merge_daemon_config(read_json_file(&config_path));
    let last_result = read_json_file(&result_path).unwrap_or(Value::Null);

    json!({
        "running": running,
        "pid": if running { pid.map(Value::from).unwrap_or(Value::Null) } else { Value::Null },
        "startTime": info.get("startTime").cloned().unwrap_or(Value::Null),
        "checksRun": info.get("checksRun").cloned().unwrap_or_else(|| json!(0)),
        "lastCheck": info.get("lastCheck").cloned().unwrap_or(Value::Null),
        "config": {
            "watchPaths": config.get("watchPaths").cloned().unwrap_or_else(|| json!(["src/", "lib/", "tests/"])),
            "checkInterval": config.get("checkInterval").cloned().unwrap_or_else(|| json!(5000)),
            "blockOnHighRisk": config.get("blockOnHighRisk").cloned().unwrap_or_else(|| json!(true))
        },
        "lastResult": last_result,
        "rustPreview": true
    })
}

fn available_tool_definitions(repo_root: &Path) -> Vec<Value> {
    let mut tools = tool_definitions();
    let oss_names = tools
        .iter()
        .filter_map(|tool| tool.get("name").and_then(Value::as_str))
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    for tool in pro_mcp_tool_definitions(repo_root) {
        let Some(name) = tool.get("name").and_then(Value::as_str) else {
            continue;
        };
        if !oss_names.iter().any(|existing| existing == name) {
            tools.push(tool);
        }
    }
    tools
}

fn pro_mcp_tool_definitions(repo_root: &Path) -> Vec<Value> {
    let payload = json!({
        "action": "definitions",
        "repoRoot": repo_root.to_string_lossy()
    });
    let Ok(output) = run_pro_mcp_bridge(repo_root, payload) else {
        return Vec::new();
    };
    if output.get("available").and_then(Value::as_bool) != Some(true) {
        return Vec::new();
    }
    value_array(output.get("tools"))
}

fn call_pro_mcp_tool_if_available(
    name: &str,
    args: &Value,
    repo_root: &Path,
) -> Result<Option<Value>, McpError> {
    let payload = json!({
        "action": "call",
        "repoRoot": resolve_repo_root(args, repo_root).to_string_lossy(),
        "name": name,
        "args": args
    });
    let output = run_pro_mcp_bridge(repo_root, payload)
        .map_err(|error| McpError::new(-32603, format!("Pro MCP bridge failed: {error}")))?;
    if output.get("available").and_then(Value::as_bool) != Some(true) {
        return Ok(None);
    }
    Ok(output.get("result").cloned())
}

fn run_pro_mcp_bridge(repo_root: &Path, payload: Value) -> Result<Value, String> {
    let mut child = Command::new("node")
        .args(["--input-type=module", "-e", PRO_MCP_SCRIPT])
        .current_dir(repo_root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.to_string().as_bytes())
            .map_err(|error| error.to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("node bridge exited with status {}", output.status)
        } else {
            stderr
        });
    }
    if output.stdout.is_empty() {
        return Ok(json!({ "available": false }));
    }
    serde_json::from_slice::<Value>(&output.stdout).map_err(|error| error.to_string())
}

fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "read_repo_guardrails",
            "description": "Call this FIRST when starting work in a repo. Reads repo guardrail config, allowed paths, protected paths, and policy summary. Use before planning any changes.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "suggest_task_contract",
            "description": "Bootstrap a task contract and runtime session from a natural-language task request.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "taskRequest": {
                        "type": "string",
                        "description": "Natural-language task description."
                    },
                    "selectedFiles": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional selected files relevant to the task."
                    },
                    "changedFiles": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional already-known changed files for the task."
                    },
                    "overrides": {
                        "type": "object",
                        "description": "Optional contract overrides using the same keys as CLI flags.",
                        "additionalProperties": true
                    }
                },
                "required": ["taskRequest"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "start_agent_native_loop",
            "description": "Call when beginning a task. Writes a bounded task contract and starter evidence files, then returns loop guidance.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "taskRequest": {
                        "type": "string",
                        "description": "Natural-language task description."
                    },
                    "selectedFiles": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional selected files relevant to the task."
                    },
                    "changedFiles": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Optional already-known changed files for the task."
                    },
                    "overrides": {
                        "type": "object",
                        "description": "Optional contract overrides using the same keys as CLI flags.",
                        "additionalProperties": true
                    },
                    "contractPath": {
                        "type": "string",
                        "description": "Optional custom task contract path to write."
                    },
                    "writeFiles": {
                        "type": "boolean",
                        "description": "Whether to write the task contract and starter evidence files."
                    }
                },
                "required": ["taskRequest"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "check_after_edit",
            "description": "Call after an edit to get lightweight guardrail feedback from the daemon cache or a fallback check.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "finish_agent_native_loop",
            "description": "Call when the task is complete. Writes optional evidence, runs the final guardrail check, and returns a reviewer-friendly summary.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "contractPath": {
                        "type": "string",
                        "description": "Optional custom task contract path."
                    },
                    "baseRef": {
                        "type": "string",
                        "description": "Optional git base ref for diff-based checks."
                    },
                    "commandsRun": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Commands that actually ran for the task."
                    },
                    "evidence": {
                        "type": "object",
                        "description": "Optional evidence payload to write before finishing.",
                        "properties": {
                            "task": { "type": "string" },
                            "commandsRun": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "notableResults": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "reviewNotes": {
                                "type": "array",
                                "items": { "type": "string" }
                            },
                            "residualRisk": { "type": "string" }
                        },
                        "additionalProperties": false
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "run_guardrail_check",
            "description": "Run a full guardrail check. Use when you need detailed check results before commit or after edits.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "baseRef": {
                        "type": "string",
                        "description": "Optional git base ref for diff-based check."
                    },
                    "commandsRun": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Commands that actually ran for the task."
                    },
                    "contractPath": {
                        "type": "string",
                        "description": "Optional custom task contract path."
                    },
                    "review": {
                        "type": "boolean",
                        "description": "Set true for reviewer-oriented summary."
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "summarize_review_risks",
            "description": "Summarize a guardrail check result into status, top risks, and next actions. Call after run_guardrail_check when you need a concise risk summary.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "checkResult": {
                        "type": "object",
                        "description": "Structured result from run_guardrail_check or check --json.",
                        "additionalProperties": true
                    }
                },
                "required": ["checkResult"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "plan_rough_intent",
            "description": "Call when the user gives a vague task. Infers the likely task type, safe scope, validation command, evidence path, and risk level before editing.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "task": {
                        "type": "string",
                        "description": "The rough task description in natural language."
                    },
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "mode": {
                        "type": "string",
                        "enum": ["suggest", "auto", "strict"],
                        "description": "suggest returns a recommendation, auto accepts high-confidence shapes, strict always requires confirmation."
                    },
                    "locale": {
                        "type": "string",
                        "enum": ["en", "zh-CN"],
                        "description": "Language for the response text."
                    }
                },
                "required": ["task"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "read_daemon_status",
            "description": "Check if the guardrails daemon is running and get its latest check result. Use when you want to know background check status without triggering a new check.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    }
                },
                "additionalProperties": false
            }
        }),
        json!({
            "name": "explain_change",
            "description": "Generate a human-readable explanation of what changed and why. Call after edits when the user needs a concise change summary.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "locale": {
                        "type": "string",
                        "enum": ["en", "zh-CN"],
                        "description": "Language for the explanation text."
                    }
                },
                "required": ["repoRoot"],
                "additionalProperties": false
            }
        }),
        json!({
            "name": "query_archaeology",
            "description": "Query local code archaeology notes to understand why previous changes exist.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "repoRoot": {
                        "type": "string",
                        "description": "Absolute path to the repository root."
                    },
                    "sessionId": {
                        "type": "string",
                        "description": "Optional session ID to filter notes."
                    }
                },
                "required": ["repoRoot"],
                "additionalProperties": false
            }
        }),
    ]
}

fn create_json_result(data: Value) -> Value {
    let text = serde_json::to_string_pretty(&data).unwrap_or_else(|_| "{}".to_string());
    json!({
        "content": [
            {
                "type": "text",
                "text": text
            }
        ],
        "structuredContent": data
    })
}

fn create_human_readable_json_result(data: Value, text: String) -> Value {
    json!({
        "content": [
            {
                "type": "text",
                "text": text
            }
        ],
        "structuredContent": data
    })
}

fn apply_plugin_metadata(result: &mut CheckResult, plugins: Vec<Value>) {
    result.counts.loaded_plugins = plugins
        .iter()
        .filter(|plugin| plugin.get("status").and_then(Value::as_str) == Some("loaded"))
        .count();
    result.counts.missing_plugins = plugins
        .iter()
        .filter(|plugin| plugin.get("status").and_then(Value::as_str) == Some("missing"))
        .count();
    result.plugins = plugins;
}

fn value_array(value: Option<&Value>) -> Vec<Value> {
    value.and_then(Value::as_array).cloned().unwrap_or_default()
}

fn bool_field(value: &Value, key: &str) -> bool {
    value.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn number_field(value: &Value, key: &str) -> usize {
    value
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or_default()
}

fn string_field(value: &Value, key: &str) -> String {
    value
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn recovery_guidance(findings: &[Value], severity: &str) -> Vec<String> {
    let mut guidance = Vec::new();
    for finding in findings {
        if finding.get("severity").and_then(Value::as_str) != Some(severity) {
            continue;
        }
        let Some(code) = finding.get("code").and_then(Value::as_str) else {
            continue;
        };
        let Some(message) = recovery_message(code, severity) else {
            continue;
        };
        guidance.push(message.to_string());
    }
    unique_strings(guidance)
}

fn recovery_message(code: &str, severity: &str) -> Option<&'static str> {
    match (severity, code) {
        (
            "error",
            "path-scope-violation"
            | "task-scope-violation"
            | "repo-allowed-path-violation"
            | "task-path-violation"
            | "intended-file-violation",
        ) => Some(
            "Recovery: revert out-of-scope changes or update the task contract to include them.",
        ),
        ("error", "missing-required-commands") => Some(
            "Recovery: run the missing commands or record why they were intentionally skipped.",
        ),
        ("error", "missing-evidence") => {
            Some("Recovery: write the missing evidence note before review.")
        }
        ("error", "protected-area-touched") => Some(
            "Recovery: revert the protected-area changes or add detailed review notes explaining the rationale.",
        ),
        ("error", "secrets-safety") | ("warning", "secrets-safety") => {
            Some("Recovery: move secrets to environment or secret storage before review.")
        }
        ("error", "change-type-violation") => Some(
            "Recovery: revert the unexpected change-type changes or update the task contract accordingly.",
        ),
        ("error", "test-coverage-missing") => {
            Some("Recovery: add tests or explicitly acknowledge why coverage is not possible.")
        }
        ("warning", "changed-file-budget-exceeded") => {
            Some("Recovery: reduce changed files or intentionally raise the file budget.")
        }
        ("warning", "broad-top-level-change") => {
            Some("Recovery: consolidate the change into fewer top-level areas.")
        }
        ("warning", "task-breadth-suspicious") => {
            Some("Recovery: narrow the task breadth before continuing.")
        }
        ("warning", "unsafe-patterns") => {
            Some("Recovery: review unsafe patterns and replace them where practical.")
        }
        ("warning", "sensitive-file-change") => {
            Some("Recovery: review the sensitive file change carefully before review.")
        }
        ("warning", "perf-degradation-large-change") => {
            Some("Recovery: split the large change or add performance validation.")
        }
        ("warning", "minor-scope-violation") => {
            Some("Recovery: expand the task contract or acknowledge the minor scope drift.")
        }
        ("warning", "continuity-breadth-warning") => {
            Some("Recovery: narrow the change to core files or document the maintenance risk.")
        }
        ("warning", "config-or-migration-change") => {
            Some("Recovery: review the config or migration change explicitly.")
        }
        _ => None,
    }
}

fn is_blocking_risk_concern(finding: &Value) -> bool {
    if finding.get("severity").and_then(Value::as_str) == Some("error") {
        return true;
    }
    !matches!(
        finding
            .get("code")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        "performance-sensitive-area-touched"
            | "protected-area-touched"
            | "continuity-sensitive-structure-change"
    )
}

fn risk_dimension_reminder(check_result: &Value) -> Option<String> {
    let risk_dimensions = check_result
        .pointer("/taskContract/session/riskDimensions")
        .or_else(|| check_result.get("taskContract"))
        .unwrap_or(&Value::Null);
    let labels = [
        ("securityRequirements", "security"),
        ("dependencyRequirements", "dependency"),
        ("performanceRequirements", "performance"),
        ("understandingRequirements", "understanding"),
        ("continuityRequirements", "continuity"),
    ]
    .into_iter()
    .filter_map(|(key, label)| {
        risk_dimensions
            .get(key)
            .and_then(Value::as_array)
            .filter(|items| !items.is_empty())
            .map(|_| label)
    })
    .collect::<Vec<_>>();

    if labels.is_empty() {
        None
    } else {
        Some(format!(
            "Keep evidence explicit for: {}.",
            labels.join(", ")
        ))
    }
}

fn build_deploy_readiness(
    check_result: &Value,
    has_scope_issues: bool,
    has_validation_issues: bool,
    has_blocking_risk_concerns: bool,
) -> Value {
    let task_contract = check_result.get("taskContract").unwrap_or(&Value::Null);
    let production_profile = string_field(task_contract, "productionProfile");
    let nfr_requirements = value_string_array(task_contract.get("nfrRequirements"));
    let observability_requirements =
        value_string_array(task_contract.get("observabilityRequirements"));
    let rollback_notes = string_field(task_contract, "rollbackNotes");
    let expected_concurrency_impact = string_field(task_contract, "expectedConcurrencyImpact");
    let load_sensitive_paths = value_string_array(task_contract.get("loadSensitivePaths"));
    let critical_path_files = value_string_array(check_result.get("criticalPathFiles"));
    let findings = value_array(check_result.get("findings"));
    let observability_covered = !findings.iter().any(|finding| {
        finding.get("code").and_then(Value::as_str)
            == Some("observability-requirements-unaddressed")
    });
    let concurrency_covered = !findings.iter().any(|finding| {
        finding.get("code").and_then(Value::as_str) == Some("concurrency-requirements-unaddressed")
    });
    let has_deploy_signals = !production_profile.is_empty()
        || !nfr_requirements.is_empty()
        || !observability_requirements.is_empty()
        || !rollback_notes.is_empty();
    let deploy_ready = bool_field(check_result, "ok")
        && !production_profile.is_empty()
        && !has_scope_issues
        && !has_validation_issues
        && !has_blocking_risk_concerns
        && !nfr_requirements.is_empty()
        && (critical_path_files.is_empty() || !rollback_notes.is_empty())
        && observability_covered
        && concurrency_covered;

    let mut checklist = Vec::new();
    if !production_profile.is_empty() {
        checklist.push(format!("Production profile: {production_profile}"));
    }
    if !nfr_requirements.is_empty() {
        checklist.push(format!(
            "Non-functional requirements: {}",
            nfr_requirements.join(", ")
        ));
    }
    if !critical_path_files.is_empty() {
        checklist.push(if rollback_notes.is_empty() {
            format!(
                "Add rollback notes for critical paths: {}",
                critical_path_files.join(", ")
            )
        } else {
            format!("Rollback path declared: {rollback_notes}")
        });
    }
    if !observability_requirements.is_empty() {
        checklist.push(if observability_covered {
            format!(
                "Observability covered: {}",
                observability_requirements.join(", ")
            )
        } else {
            format!(
                "Observability still missing: {}",
                observability_requirements.join(", ")
            )
        });
    }
    if !expected_concurrency_impact.is_empty() || !load_sensitive_paths.is_empty() {
        checklist.push(if concurrency_covered {
            "Performance and concurrency evidence is covered.".to_string()
        } else {
            "Add performance or concurrency validation before deploy.".to_string()
        });
    }

    let (status, summary) = if deploy_ready {
        (
            "ready",
            "The change meets the current deploy-readiness bar.",
        )
    } else if has_deploy_signals {
        ("blocked", "The change is not yet ready to deploy.")
    } else {
        (
            "not-applicable",
            "No production-shaped deploy gate was declared for this task.",
        )
    };

    json!({
        "status": status,
        "summary": summary,
        "checklist": checklist
    })
}

fn build_post_deploy_maintenance(check_result: &Value) -> Value {
    let task_contract = check_result.get("taskContract").unwrap_or(&Value::Null);
    let production_profile = string_field(task_contract, "productionProfile");
    let rollback_notes = string_field(task_contract, "rollbackNotes");
    let observability_requirements =
        value_string_array(task_contract.get("observabilityRequirements"));
    let expected_concurrency_impact = string_field(task_contract, "expectedConcurrencyImpact");
    let load_sensitive_paths = value_string_array(task_contract.get("loadSensitivePaths"));
    let findings = value_array(check_result.get("findings"));
    let continuity = check_result.get("continuity").unwrap_or(&Value::Null);
    let observability_covered = !findings.iter().any(|finding| {
        finding.get("code").and_then(Value::as_str)
            == Some("observability-requirements-unaddressed")
    });
    let concurrency_covered = !findings.iter().any(|finding| {
        finding.get("code").and_then(Value::as_str) == Some("concurrency-requirements-unaddressed")
    });
    let mut operator_next_actions = Vec::new();

    if !rollback_notes.is_empty() {
        operator_next_actions.push(format!("Use rollback path if needed: {rollback_notes}"));
    } else if !value_string_array(check_result.get("criticalPathFiles")).is_empty() {
        operator_next_actions.push("Add rollback notes for critical-path changes.".to_string());
    }
    if !observability_requirements.is_empty() {
        operator_next_actions.push(if observability_covered {
            format!(
                "Watch observability signals: {}",
                observability_requirements.join(", ")
            )
        } else {
            "Add observability evidence before deploy.".to_string()
        });
    } else if !production_profile.is_empty() {
        operator_next_actions.push("Watch service health after deploy.".to_string());
    }
    if !expected_concurrency_impact.is_empty() || !load_sensitive_paths.is_empty() {
        operator_next_actions.push(if concurrency_covered {
            "Watch performance after deploy.".to_string()
        } else {
            "Validate performance before deploy.".to_string()
        });
    }
    if continuity
        .get("futureMaintenanceRisks")
        .and_then(Value::as_array)
        .is_some_and(|items| !items.is_empty())
    {
        operator_next_actions.push("Track future maintenance risks.".to_string());
    }

    json!({
        "summary": if production_profile.is_empty() {
            "Review-ready maintenance notes."
        } else {
            "Production maintenance notes."
        },
        "rollbackPath": if rollback_notes.is_empty() {
            "not declared".to_string()
        } else {
            rollback_notes
        },
        "observabilityStatus": if observability_requirements.is_empty() {
            "not-declared"
        } else if observability_covered {
            "covered"
        } else {
            "missing"
        },
        "operatorNextActions": unique_strings(operator_next_actions)
    })
}

fn build_cost_hints(check_result: &Value, findings: &[Value]) -> Value {
    let total_files = value_string_array(check_result.get("changedFiles")).len();
    let source_files = value_string_array(check_result.get("sourceFiles")).len();
    let has_errors = findings
        .iter()
        .any(|finding| finding.get("severity").and_then(Value::as_str) == Some("error"));
    let has_warnings = findings
        .iter()
        .any(|finding| finding.get("severity").and_then(Value::as_str) == Some("warning"));
    let low_estimate = total_files * 50;
    let high_estimate = source_files * 1500 + total_files.saturating_sub(source_files) * 200;
    let size_level = if total_files <= 3 {
        "Small"
    } else if total_files <= 8 {
        "Medium"
    } else if total_files <= 15 {
        "Large"
    } else {
        "VeryLarge"
    };
    let mut entries = vec![
        json!({
            "key": format!("check.costSize{size_level}"),
            "vars": {
                "totalFiles": total_files,
                "sourceFiles": source_files
            }
        }),
        json!({
            "key": "check.costTokenEstimate",
            "vars": {
                "low": format_tokens(low_estimate),
                "high": format_tokens(high_estimate)
            }
        }),
    ];
    if total_files > 8 {
        entries.push(json!({
            "key": "check.costLargeChangeWarning",
            "vars": {}
        }));
    }
    if has_errors || has_warnings {
        let error_count = findings
            .iter()
            .filter(|finding| finding.get("severity").and_then(Value::as_str) == Some("error"))
            .count();
        let warning_count = findings
            .iter()
            .filter(|finding| finding.get("severity").and_then(Value::as_str) == Some("warning"))
            .count();
        entries.push(json!({
            "key": "check.costFixCostHint",
            "vars": {
                "errorCount": error_count,
                "warningCount": warning_count
            }
        }));
    }

    json!({
        "sizeLevel": size_level,
        "tokenEstimate": {
            "low": low_estimate,
            "high": high_estimate
        },
        "entries": entries
    })
}

fn format_tokens(count: usize) -> String {
    if count >= 1000 {
        format!("{}k", ((count as f64) / 1000.0).round() as usize)
    } else {
        count.to_string()
    }
}

fn top_risks(check_result: &Value) -> Vec<Value> {
    let mut risks = Vec::new();
    for pointer in [
        "/review/scopeIssues",
        "/review/validationIssues",
        "/review/consistencyConcerns",
        "/review/riskConcerns",
    ] {
        risks.extend(value_array(check_result.pointer(pointer)));
    }
    risks.into_iter().take(5).collect()
}

fn check_findings(result_or_cache: &Value) -> Vec<Value> {
    if result_or_cache
        .get("findings")
        .and_then(Value::as_array)
        .is_some()
    {
        return value_array(result_or_cache.get("findings"));
    }
    value_array(result_or_cache.pointer("/result/findings"))
}

fn check_after_edit_data_from_findings(
    fallback_status: &str,
    findings: Vec<Value>,
    cache_age_seconds: Option<usize>,
    score: Option<Value>,
    score_verdict: Option<Value>,
) -> Value {
    let error_count = findings
        .iter()
        .filter(|finding| {
            matches!(
                finding.get("severity").and_then(Value::as_str),
                Some("error" | "high")
            )
        })
        .count();
    let warning_count = findings
        .iter()
        .filter(|finding| finding.get("severity").and_then(Value::as_str) == Some("warning"))
        .count();
    let new_findings = findings
        .iter()
        .map(|finding| {
            json!({
                "severity": finding
                    .get("severity")
                    .and_then(Value::as_str)
                    .unwrap_or("info"),
                "rule": finding
                    .get("rule")
                    .or_else(|| finding.get("id"))
                    .or_else(|| finding.get("code"))
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
                "message": finding
                    .get("message")
                    .or_else(|| finding.get("description"))
                    .and_then(Value::as_str)
                    .unwrap_or_default()
            })
        })
        .collect::<Vec<_>>();
    let status = if error_count > 0 {
        "issues"
    } else if cache_age_seconds.is_some() {
        "clean"
    } else {
        fallback_status
    };
    let mut data = json!({
        "status": status,
        "newFindings": new_findings,
        "cacheAge": cache_age_seconds,
        "rustPreview": true,
        "summary": {
            "errors": error_count,
            "warnings": warning_count
        }
    });
    if let Some(score) = score {
        data.as_object_mut()
            .expect("object")
            .insert("score".to_string(), score);
    }
    if let Some(score_verdict) = score_verdict {
        data.as_object_mut()
            .expect("object")
            .insert("scoreVerdict".to_string(), score_verdict);
    }
    data
}

fn check_after_edit_summary(data: &Value, used_cache: bool) -> String {
    let errors = data
        .pointer("/summary/errors")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let warnings = data
        .pointer("/summary/warnings")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let findings = value_array(data.get("newFindings"));
    let mut lines = Vec::new();

    if data.get("status").and_then(Value::as_str) == Some("issues") {
        lines.push("Issues detected. Fix these before continuing with more edits.".to_string());
        lines.push(format!("Findings: {errors} errors, {warnings} warnings"));
        for finding in findings.iter().take(5) {
            lines.push(format!(
                "- {}: {}",
                finding
                    .get("rule")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown"),
                finding
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
            ));
        }
    } else if data.get("status").and_then(Value::as_str) == Some("clean") {
        lines.push("All clear. No guardrail violations found.".to_string());
        lines.push(format!("Findings: {errors} errors, {warnings} warnings"));
        if let Some(age) = data.get("cacheAge").and_then(Value::as_u64) {
            lines.push(format!("Cache: fresh ({age}s ago)"));
        }
    } else {
        lines.push(if used_cache {
            "No fresh daemon cache is available; ran a lightweight check.".to_string()
        } else {
            "No fresh daemon cache is available; ran a lightweight check.".to_string()
        });
        lines.push(format!("Findings: {errors} errors, {warnings} warnings"));
        lines
            .push("Tip: start `agent-guardrails start` for faster post-edit feedback.".to_string());
    }

    if let Some(score) = data.get("score").and_then(Value::as_f64) {
        lines.push(format!(
            "Trust score: {score}/100 ({})",
            data.get("scoreVerdict")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
        ));
    }
    lines.join("\n")
}

fn write_evidence_update(
    repo_root: &Path,
    contract: &TaskContract,
    evidence: &Value,
    commands_run: &[String],
) -> Result<Vec<Value>, McpError> {
    let evidence_paths = contract
        .evidence_paths
        .iter()
        .filter_map(Value::as_str)
        .map(normalize_repo_path)
        .filter(|path| !path.is_empty())
        .collect::<Vec<_>>();
    if evidence_paths.is_empty() {
        return Ok(Vec::new());
    }

    let task = evidence
        .get("task")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(&contract.task)
        .to_string();
    let effective_commands = unique_strings(
        commands_run
            .iter()
            .cloned()
            .chain(normalize_lines(evidence.get("commandsRun")))
            .collect(),
    );
    let notable_results = normalize_lines(evidence.get("notableResults"));
    let review_notes = normalize_lines(evidence.get("reviewNotes"));
    let residual_risk = evidence
        .get("residualRisk")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("none")
        .to_string();
    let note = render_evidence_note(
        &task,
        &effective_commands,
        &notable_results,
        &review_notes,
        &residual_risk,
    );
    let mut updates = Vec::new();

    for relative_path in evidence_paths {
        let absolute_path = repo_root.join(&relative_path);
        if let Some(parent) = absolute_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                McpError::new(
                    -32603,
                    format!("failed to create evidence directory: {error}"),
                )
            })?;
        }
        fs::write(&absolute_path, &note).map_err(|error| {
            McpError::new(-32603, format!("failed to write evidence file: {error}"))
        })?;
        updates.push(json!({
            "path": relative_path,
            "updated": true
        }));
    }

    Ok(updates)
}

fn normalize_lines(value: Option<&Value>) -> Vec<String> {
    match value {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        Some(Value::String(text)) => text
            .lines()
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        Some(other) => other
            .as_str()
            .map(|text| vec![text.trim().to_string()])
            .unwrap_or_default(),
        None => Vec::new(),
    }
}

fn render_evidence_note(
    task: &str,
    commands_run: &[String],
    notable_results: &[String],
    review_notes: &[String],
    residual_risk: &str,
) -> String {
    format!(
        "# Task Evidence\n\n- Task: {}\n- Commands run: {}\n- Notable results: {}\n- Review notes: {}\n- Residual risk: {}\n",
        if task.is_empty() { "Unknown" } else { task },
        if commands_run.is_empty() {
            "pending".to_string()
        } else {
            commands_run.join(", ")
        },
        if notable_results.is_empty() {
            "pending".to_string()
        } else {
            notable_results.join(" | ")
        },
        if review_notes.is_empty() {
            "pending".to_string()
        } else {
            review_notes.join(" | ")
        },
        if residual_risk.is_empty() {
            "pending"
        } else {
            residual_risk
        }
    )
}

fn ensure_evidence_files(
    repo_root: &Path,
    contract: &Value,
    write_files: bool,
) -> Result<Vec<Value>, McpError> {
    let task = contract
        .get("task")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let note = render_evidence_note(task, &[], &[], &[], "");
    let mut files = Vec::new();

    for evidence_path in value_string_array(contract.get("evidencePaths")) {
        let normalized_path = normalize_repo_path(&evidence_path);
        if normalized_path.is_empty() {
            continue;
        }
        let absolute_path = safe_repo_join(repo_root, &normalized_path)?;
        let existed = absolute_path.exists();
        if write_files && !existed {
            if let Some(parent) = absolute_path.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    McpError::new(
                        -32603,
                        format!("failed to create evidence directory: {error}"),
                    )
                })?;
            }
            fs::write(&absolute_path, &note).map_err(|error| {
                McpError::new(-32603, format!("failed to write evidence file: {error}"))
            })?;
        }
        files.push(json!({
            "path": normalized_path,
            "existed": existed,
            "created": write_files && !existed
        }));
    }

    Ok(files)
}

fn write_task_contract_file(
    repo_root: &Path,
    contract_path: &str,
    contract: &Value,
) -> Result<(), McpError> {
    let normalized_path = normalize_repo_path(contract_path);
    let path = safe_repo_join(repo_root, &normalized_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            McpError::new(
                -32603,
                format!("failed to create task contract directory: {error}"),
            )
        })?;
    }
    let text = serde_json::to_string_pretty(contract)
        .map_err(|error| McpError::new(-32603, format!("failed to serialize contract: {error}")))?
        + "\n";
    fs::write(&path, text).map_err(|error| {
        McpError::new(
            -32603,
            format!("failed to write task contract {}: {error}", path.display()),
        )
    })
}

fn safe_repo_join(repo_root: &Path, repo_path: &str) -> Result<PathBuf, McpError> {
    let normalized_path = normalize_repo_path(repo_path);
    if normalized_path.is_empty()
        || normalized_path.contains(':')
        || normalized_path.starts_with("../")
        || normalized_path == ".."
    {
        return Err(McpError::new(
            -32602,
            format!("unsafe repo-relative path: {repo_path}"),
        ));
    }
    Ok(repo_root.join(normalized_path))
}

fn build_finish_check_value(
    repo_root: &Path,
    session: &Value,
    commands_run: &[String],
    base_ref: &str,
) -> Value {
    let normalized_commands = unique_strings(
        commands_run
            .iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect(),
    );
    let required_commands = value_string_array(session.get("requiredCommandsSuggested"));
    let evidence_path = session
        .get("evidencePathSuggested")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let evidence_paths = if evidence_path.is_empty() {
        Vec::new()
    } else {
        vec![evidence_path.to_string()]
    };
    let finish_hints = value_string_array(session.get("finishCheckHints"));
    let suggested_base_ref = if base_ref.trim().is_empty() {
        "origin/main".to_string()
    } else {
        base_ref.trim().to_string()
    };
    let mut command_parts = vec![
        "agent-guardrails check".to_string(),
        "--review".to_string(),
        format!("--base-ref {suggested_base_ref}"),
    ];
    if !normalized_commands.is_empty() {
        command_parts.push(format!(
            "--commands-run \"{}\"",
            normalized_commands.join(", ")
        ));
    }
    let recommended_command = command_parts.join(" ");
    let mut next_actions = finish_hints.clone();
    next_actions.push(format!("Finish with `{recommended_command}`."));

    json!({
        "repoRoot": repo_root.to_string_lossy(),
        "sessionId": session.get("sessionId").and_then(Value::as_str).unwrap_or_default(),
        "baseRef": base_ref,
        "suggestedBaseRef": suggested_base_ref,
        "commandsRun": normalized_commands,
        "requiredCommands": required_commands,
        "evidencePaths": evidence_paths,
        "finishCheckHints": finish_hints,
        "recommendedCommand": recommended_command,
        "nextActions": unique_strings(next_actions)
    })
}

fn build_start_continuity(contract: &Value) -> Value {
    let reuse_targets = unique_strings(
        value_string_array(contract.get("allowedPaths"))
            .into_iter()
            .chain(value_string_array(contract.get("intendedFiles")))
            .take(8)
            .collect(),
    );
    let mut next_actions = Vec::new();
    if !reuse_targets.is_empty() {
        next_actions.push(format!(
            "Keep edits focused on: {}.",
            reuse_targets.join(", ")
        ));
    }
    next_actions.push("Prefer existing patterns before adding new abstractions.".to_string());

    json!({
        "reuseTargets": reuse_targets,
        "futureMaintenanceRisks": [],
        "hints": [],
        "nextActions": next_actions
    })
}

fn start_agent_native_loop_summary(data: &Value) -> String {
    let contract = data.get("contract").unwrap_or(&Value::Null);
    let loop_data = data.get("loop").unwrap_or(&Value::Null);
    let mut lines = vec![
        "Agent loop started.".to_string(),
        String::new(),
        format!(
            "Task: {}",
            contract
                .get("task")
                .and_then(Value::as_str)
                .unwrap_or("Unknown")
        ),
    ];
    let allowed_paths = value_string_array(contract.get("allowedPaths"));
    if !allowed_paths.is_empty() {
        lines.push(format!("Allowed paths: {}", allowed_paths.join(", ")));
    }
    let intended_files = value_string_array(contract.get("intendedFiles"));
    if !intended_files.is_empty() {
        lines.push(format!("Intended files: {}", intended_files.join(", ")));
    }
    if let Some(risk_level) = contract.get("riskLevel").and_then(Value::as_str) {
        lines.push(format!("Risk level: {risk_level}"));
    }
    let required_commands = value_string_array(contract.get("requiredCommands"));
    if !required_commands.is_empty() {
        lines.push(format!(
            "Required commands: {}",
            required_commands.join(", ")
        ));
    }
    lines.push(format!(
        "Loop status: {}",
        loop_data
            .get("status")
            .and_then(Value::as_str)
            .unwrap_or("bootstrapped")
    ));
    lines.push(String::new());
    lines.push(
        "After edits, call check_after_edit. Before handoff, call finish_agent_native_loop."
            .to_string(),
    );
    lines.join("\n")
}

fn generate_precision_prompts(findings: &[Value], _task_contract: &Value) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut prompts = Vec::new();
    for finding in findings {
        if finding.get("severity").and_then(Value::as_str) != Some("warning") {
            continue;
        }
        let category = finding
            .get("category")
            .and_then(Value::as_str)
            .unwrap_or("default")
            .replace('-', "_");
        if !seen.insert(category.clone()) {
            continue;
        }
        let code = finding
            .get("code")
            .and_then(Value::as_str)
            .unwrap_or("unknown");
        let prompt = match category.as_str() {
            "state_mgmt" => {
                "State management warning: confirm shared state and synchronization before handoff.".to_string()
            }
            "continuity" => {
                "Continuity warning: confirm the change preserves the existing structure or explain the deliberate break.".to_string()
            }
            "performance" => {
                "Performance warning: confirm the large or sensitive change has appropriate validation.".to_string()
            }
            _ => format!("Risk {code} detected. Confirm it is addressed before handoff."),
        };
        prompts.push(prompt);
        if prompts.len() == 3 {
            break;
        }
    }
    prompts
}

fn finish_agent_native_loop_summary(data: &Value) -> String {
    let summary = data.get("reviewerSummary").unwrap_or(&Value::Null);
    let status = summary
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let verdict = summary
        .get("verdict")
        .and_then(Value::as_str)
        .unwrap_or("Unknown");
    let mut lines = vec![
        format!("Task complete. Verdict: {verdict}"),
        String::new(),
        format!("Status: {status}"),
    ];
    let top_risks = value_array(summary.get("topRisks"));
    if top_risks.is_empty() {
        lines.push("Top risks: none".to_string());
    } else {
        lines.push("Top risks:".to_string());
        for risk in top_risks.iter().take(5) {
            lines.push(format!("- {}", format_risk(risk)));
        }
    }
    let next_actions = value_string_array(summary.get("nextActions"));
    lines.push(String::new());
    lines.push("Next steps:".to_string());
    if next_actions.is_empty() {
        lines.push("- All checks passed".to_string());
    } else {
        for action in next_actions {
            lines.push(format!("- {action}"));
        }
    }
    if let Some(readiness) = summary.get("deployReadiness") {
        if let Some(text) = readiness.get("summary").and_then(Value::as_str) {
            lines.push(String::new());
            lines.push(format!("Deploy readiness: {text}"));
        }
    }
    lines.join("\n")
}

fn format_risk(risk: &Value) -> String {
    if let Some(text) = risk.as_str() {
        return text.to_string();
    }
    let code = risk
        .get("code")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let message = risk
        .get("message")
        .or_else(|| risk.get("description"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if message.is_empty() {
        code.to_string()
    } else {
        format!("{code}: {message}")
    }
}

fn read_frame<R: BufRead>(input: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut content_length = None;

    loop {
        let mut line = String::new();
        let read = input.read_line(&mut line)?;
        if read == 0 {
            return Ok(None);
        }

        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }

        if let Some((name, value)) = trimmed.split_once(':') {
            if name.eq_ignore_ascii_case("Content-Length") {
                content_length = value.trim().parse::<usize>().ok();
            }
        }
    }

    let length = content_length.ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidData,
            "missing or invalid Content-Length header",
        )
    })?;
    let mut payload = vec![0_u8; length];
    input.read_exact(&mut payload)?;
    Ok(Some(payload))
}

fn write_response<W: Write>(output: &mut W, response: Value) -> Result<(), String> {
    let payload = serde_json::to_vec(&response)
        .map_err(|error| format!("failed to serialize MCP response: {error}"))?;
    write!(output, "Content-Length: {}\r\n\r\n", payload.len())
        .map_err(|error| format!("failed to write MCP header: {error}"))?;
    output
        .write_all(&payload)
        .map_err(|error| format!("failed to write MCP response: {error}"))?;
    output
        .flush()
        .map_err(|error| format!("failed to flush MCP response: {error}"))
}

fn mcp_error_json(code: i64, message: &str, data: Option<Value>) -> Value {
    let mut error = serde_json::Map::new();
    error.insert("code".to_string(), json!(code));
    error.insert("message".to_string(), json!(message));
    if let Some(data) = data {
        error.insert("data".to_string(), data);
    }
    Value::Object(error)
}

fn resolve_repo_root(args: &Value, default_repo_root: &Path) -> PathBuf {
    args.get("repoRoot")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| default_repo_root.to_path_buf())
}

fn plan_defaults(config: &Value) -> Value {
    let plan_defaults = config
        .get("workflow")
        .and_then(|workflow| workflow.get("planDefaults"))
        .unwrap_or(&Value::Null);
    let evidence_paths = clone_or_default(
        plan_defaults,
        "evidencePaths",
        json!([".agent-guardrails/evidence/current-task.md"]),
    );
    json!({
        "allowedPaths": clone_or_default(plan_defaults, "allowedPaths", json!([])),
        "requiredCommands": clone_or_default(plan_defaults, "requiredCommands", json!([])),
        "evidencePaths": evidence_paths,
        "readBeforeWrite": config
            .get("workflow")
            .and_then(|workflow| workflow.get("readBeforeWrite"))
            .cloned()
            .unwrap_or_else(|| json!([])),
        "constraints": config
            .get("workflow")
            .and_then(|workflow| workflow.get("constraints"))
            .cloned()
            .unwrap_or_else(|| json!([])),
        "definitionOfDone": config
            .get("workflow")
            .and_then(|workflow| workflow.get("definitionOfDone"))
            .cloned()
            .unwrap_or_else(|| json!([])),
        "securityRequirements": [policy_hint(
            config,
            "/nfrPolicies/security/evidenceHint",
            "Mention auth, secrets, permissions, and sensitive-data handling explicitly."
        )],
        "dependencyRequirements": [policy_hint(
            config,
            "/nfrPolicies/dependency/evidenceHint",
            "Mention new or upgraded packages, lockfile changes, and dependency impact explicitly."
        )],
        "performanceRequirements": [policy_hint(
            config,
            "/nfrPolicies/performance/evidenceHint",
            "Mention latency, throughput, or hotspot validation in evidence."
        )],
        "understandingRequirements": [policy_hint(
            config,
            "/nfrPolicies/understanding/evidenceHint",
            "Explain the main tradeoffs so future maintainers can follow the change."
        )],
        "continuityRequirements": [policy_hint(
            config,
            "/nfrPolicies/continuity/evidenceHint",
            "Mention reuse targets and any deliberate continuity break in evidence."
        )]
    })
}

fn policy_hint(config: &Value, pointer: &str, fallback: &str) -> String {
    config
        .pointer(pointer)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(fallback)
        .to_string()
}

fn clone_or_default(value: &Value, key: &str, default_value: Value) -> Value {
    value.get(key).cloned().unwrap_or(default_value)
}

fn value_string_list(value: Option<&Value>) -> Vec<String> {
    match value {
        None | Some(Value::Null) | Some(Value::Bool(true)) => Vec::new(),
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|item| item.as_str().map(ToString::to_string))
            .collect(),
        Some(Value::String(text)) => text
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToString::to_string)
            .collect(),
        Some(other) => other
            .as_str()
            .map(|text| vec![text.to_string()])
            .unwrap_or_default(),
    }
}

fn value_string_array(value: Option<&Value>) -> Vec<String> {
    value_string_list(value)
}

fn env_runtime_files(name: &str) -> Vec<String> {
    env::var(name)
        .ok()
        .map(|value| {
            env::split_paths(&value)
                .map(|path| path.to_string_lossy().to_string())
                .collect()
        })
        .unwrap_or_default()
}

fn normalize_repo_path(path_value: &str) -> String {
    let replaced = path_value.trim().replace('\\', "/");
    let without_prefix = replaced.strip_prefix("./").unwrap_or(&replaced);
    normalize_path_segments(without_prefix.trim_start_matches('/'))
}

fn normalize_path_segments(path_value: &str) -> String {
    let mut segments = Vec::new();
    let trailing_slash = path_value.ends_with('/');
    for segment in path_value.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            item => segments.push(item),
        }
    }
    let mut normalized = segments.join("/");
    if trailing_slash && !normalized.is_empty() && !normalized.ends_with('/') {
        normalized.push('/');
    }
    normalized
}

fn unique_strings(items: Vec<String>) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    let mut result = Vec::new();
    for item in items {
        if item.is_empty() {
            continue;
        }
        if seen.insert(item.clone()) {
            result.push(item);
        }
    }
    result
}

fn parent_scope(file_path: &str) -> Option<String> {
    let normalized = normalize_repo_path(file_path);
    if normalized.is_empty() {
        return None;
    }
    let parent = normalized.rsplit_once('/').map(|(parent, _)| parent);
    match parent {
        Some("") | None => Some(normalized),
        Some(parent) => Some(format!("{}/", parent.trim_end_matches('/'))),
    }
}

fn risk_dimensions(overrides: &Value, defaults: &Value) -> Value {
    json!({
        "securityRequirements": choose_requirement(
            overrides.get("security-requirements"),
            defaults.get("securityRequirements")
        ),
        "dependencyRequirements": choose_requirement(
            overrides.get("dependency-requirements"),
            defaults.get("dependencyRequirements")
        ),
        "performanceRequirements": choose_requirement(
            overrides.get("performance-requirements"),
            defaults.get("performanceRequirements")
        ),
        "understandingRequirements": choose_requirement(
            overrides.get("understanding-requirements"),
            defaults.get("understandingRequirements")
        ),
        "continuityRequirements": choose_requirement(
            overrides.get("continuity-requirements"),
            defaults.get("continuityRequirements")
        )
    })
}

fn choose_requirement(explicit: Option<&Value>, fallback: Option<&Value>) -> Vec<String> {
    let explicit_values = value_string_list(explicit);
    if explicit_values.is_empty() {
        value_string_array(fallback)
    } else {
        explicit_values
    }
}

fn protected_matches(config: &Value, files: &[String]) -> Vec<Value> {
    config
        .get("protectedAreas")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|area| {
            let path = area.as_str().map(ToString::to_string).or_else(|| {
                area.get("path")
                    .and_then(Value::as_str)
                    .map(ToString::to_string)
            })?;
            let normalized_path = normalize_repo_path(&path);
            if normalized_path.is_empty() {
                return None;
            }
            let prefix = format!("{}/", normalized_path.trim_end_matches('/'));
            let matched_files = files
                .iter()
                .filter(|file| {
                    let normalized_file = normalize_repo_path(file);
                    normalized_file == normalized_path || normalized_file.starts_with(&prefix)
                })
                .cloned()
                .collect::<Vec<_>>();
            if matched_files.is_empty() {
                return None;
            }
            Some(json!({
                "type": "protected-area",
                "path": normalized_path,
                "label": area
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or(&path),
                "minimumRiskLevel": area
                    .get("minimumRiskLevel")
                    .and_then(Value::as_str)
                    .unwrap_or("medium"),
                "requiresReviewNotes": area
                    .get("requiresReviewNotes")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                "files": matched_files
            }))
        })
        .collect()
}

fn max_risk(levels: &[String]) -> String {
    let mut max_score = 0;
    let mut max_level = "standard";
    for level in levels {
        let normalized = level.trim().to_ascii_lowercase();
        let score = match normalized.as_str() {
            "low" => 1,
            "standard" => 2,
            "medium" => 3,
            "high" => 4,
            "critical" => 5,
            _ => 0,
        };
        if score > max_score {
            max_score = score;
            max_level = match normalized.as_str() {
                "low" => "low",
                "medium" => "medium",
                "high" => "high",
                "critical" => "critical",
                _ => "standard",
            };
        }
    }
    max_level.to_string()
}

fn parse_bool_value(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(text)) => matches!(
            text.trim().to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "y"
        ),
        Some(Value::Number(number)) => number.as_i64().unwrap_or(0) != 0,
        _ => false,
    }
}

fn build_task_next_actions(
    required_commands: &[String],
    evidence_paths: &[String],
    risk_level: &str,
    requires_review_notes: bool,
) -> Vec<String> {
    let mut actions = vec!["Implement the smallest change that fits the contract.".to_string()];
    if !required_commands.is_empty() {
        actions.push(format!(
            "Run required command evidence: {}.",
            required_commands.join(", ")
        ));
    }
    if !evidence_paths.is_empty() {
        actions.push(format!("Update evidence: {}.", evidence_paths.join(", ")));
    }
    if requires_review_notes || matches!(risk_level, "high" | "critical") {
        actions.push("Capture review notes before finishing.".to_string());
    }
    actions.push("Run agent-guardrails check --review before completing the task.".to_string());
    actions
}

fn finish_check_hints(required_commands: &[String], evidence_paths: &[String]) -> Vec<String> {
    let mut hints = Vec::new();
    if !required_commands.is_empty() {
        hints.push(format!(
            "Report commands run: {}.",
            required_commands.join(", ")
        ));
    }
    if !evidence_paths.is_empty() {
        hints.push(format!("Keep evidence in: {}.", evidence_paths.join(", ")));
    }
    hints.push("Run agent-guardrails check --review.".to_string());
    hints
}

fn rough_intent_suggestion(
    task: &str,
    intended_files: &[String],
    allowed_paths: &[String],
    required_commands: &[String],
    evidence_paths: &[String],
) -> Option<Value> {
    if !is_rough_intent_task(task) {
        return None;
    }
    let primary_scope = intended_files
        .first()
        .or_else(|| allowed_paths.first())
        .cloned()
        .unwrap_or_else(|| "the existing repo target".to_string());
    let command_text = if required_commands.is_empty() {
        "the required commands".to_string()
    } else {
        required_commands.join(", ")
    };
    let evidence_text = evidence_paths
        .first()
        .cloned()
        .unwrap_or_else(|| ".agent-guardrails/evidence/current-task.md".to_string());
    let default_done = vec![
        format!("Change stays within {}.", allowed_paths.join(", ")),
        format!("Validation is covered by {}.", command_text),
        format!("Evidence is recorded in {}.", evidence_text),
    ];
    let scope = unique_strings(
        allowed_paths
            .iter()
            .chain(intended_files.iter())
            .take(4)
            .cloned()
            .collect(),
    );
    Some(json!({
        "detected": true,
        "firstNextAction": format!("Confirm the smallest safe scope around {} before editing.", primary_scope),
        "suggestions": [
            {
                "id": "refine-existing-target",
                "title": "Refine the existing target",
                "task": format!("Make the smallest safe change around {}.", primary_scope),
                "smallestScope": scope,
                "defaultDone": default_done,
                "recommended": true
            },
            {
                "id": "add-bounded-validation",
                "title": "Add bounded validation",
                "task": format!("Add validation for {} without widening the implementation scope.", primary_scope),
                "smallestScope": scope,
                "defaultDone": default_done,
                "recommended": false
            },
            {
                "id": "document-current-behavior",
                "title": "Document the current behavior",
                "task": format!("Document what is known about {} before changing code.", primary_scope),
                "smallestScope": scope,
                "defaultDone": default_done,
                "recommended": false
            }
        ]
    }))
}

fn is_rough_intent_task(task: &str) -> bool {
    let normalized = task.to_ascii_lowercase();
    [
        "rough idea",
        "smallest safe",
        "smallest change",
        "not sure",
        "help me move",
        "move this project",
        "find the smallest",
        "start with",
        "help me figure",
    ]
    .iter()
    .any(|pattern| normalized.contains(pattern))
}

fn current_timestamp() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    format!("unix-ms-{millis}")
}

fn current_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

fn read_json_file(path: &Path) -> Option<Value> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn merge_daemon_config(config: Option<Value>) -> Value {
    let mut merged = default_daemon_config();
    if let Some(Value::Object(object)) = config {
        if let Some(merged_object) = merged.as_object_mut() {
            for (key, value) in object {
                merged_object.insert(key, value);
            }
        }
    }
    merged
}

fn default_daemon_config() -> Value {
    json!({
        "enabled": true,
        "watchPaths": ["src/", "lib/", "tests/"],
        "ignorePatterns": ["node_modules", ".git", "dist", "coverage"],
        "checkInterval": 5000,
        "notifications": {
            "sound": false,
            "desktop": false
        },
        "autoFix": false,
        "blockOnHighRisk": true
    })
}

fn default_mcp_config() -> Value {
    json!({
        "preset": "generic",
        "workflow": {
            "planDefaults": {
                "allowedPaths": ["src/", "tests/"],
                "requiredCommands": ["npm test"],
                "evidencePaths": [".agent-guardrails/evidence/current-task.md"]
            }
        },
        "checks": {
            "sourceRoots": ["src", "lib", "app", "packages"],
            "testRoots": ["test", "tests", "__tests__"],
            "sourceExtensions": [".js", ".jsx", ".ts", ".tsx", ".py", ".rs", ".go", ".java"],
            "testExtensions": [".test.js", ".spec.js", ".test.ts", ".spec.ts", "_test.py"]
        }
    })
}

fn rough_intent_analysis(
    task: &str,
    repo_root: &Path,
    defaults: &Value,
    changed_files: &[String],
) -> Value {
    let task_type = infer_rough_task_type(task);
    let allowed_paths = infer_rough_allowed_paths(&task_type, repo_root, defaults, changed_files);
    let required_commands = infer_rough_commands(&task_type, repo_root, defaults);
    let risk_level = infer_rough_risk_level(task, &task_type);
    let guard_rules = rough_guard_rules(&task_type, &risk_level);
    let evidence_path = value_string_array(defaults.get("evidencePaths"))
        .into_iter()
        .next()
        .unwrap_or_else(|| ".agent-guardrails/evidence/current-task.md".to_string());
    let confidence = rough_confidence(task, &task_type, !allowed_paths.is_empty());
    let sources = json!({
        "changedFiles": changed_files,
        "repoSignals": repo_signal_sources(repo_root),
        "defaults": {
            "allowedPaths": value_string_array(defaults.get("allowedPaths")),
            "requiredCommands": value_string_array(defaults.get("requiredCommands")),
            "evidencePaths": value_string_array(defaults.get("evidencePaths"))
        }
    });

    json!({
        "taskType": task_type,
        "confidence": confidence,
        "inferred": {
            "allowedPaths": allowed_paths,
            "requiredCommands": required_commands,
            "riskLevel": risk_level,
            "guardRules": guard_rules,
            "evidencePath": evidence_path
        },
        "sources": sources
    })
}

fn infer_rough_task_type(task: &str) -> String {
    let normalized = task.to_ascii_lowercase();
    if contains_any(
        &normalized,
        &[
            "docker",
            "compose",
            "container",
            "k8s",
            "kubernetes",
            "deploy",
        ],
    ) {
        "deploy".to_string()
    } else if contains_any(
        &normalized,
        &["auth", "login", "permission", "token", "secret", "security"],
    ) {
        "security".to_string()
    } else if contains_any(
        &normalized,
        &["database", "db", "sql", "schema", "migration", "prisma"],
    ) {
        "data".to_string()
    } else if contains_any(&normalized, &["test", "spec", "coverage"]) {
        "tests".to_string()
    } else if contains_any(&normalized, &["doc", "readme", "guide", "documentation"]) {
        "docs".to_string()
    } else if contains_any(
        &normalized,
        &["ui", "frontend", "page", "screen", "component", "css"],
    ) {
        "frontend".to_string()
    } else {
        "implementation".to_string()
    }
}

fn infer_rough_allowed_paths(
    task_type: &str,
    repo_root: &Path,
    defaults: &Value,
    changed_files: &[String],
) -> Vec<String> {
    if !changed_files.is_empty() {
        return unique_strings(
            changed_files
                .iter()
                .filter_map(|file| parent_scope(file))
                .collect(),
        );
    }

    let candidates = match task_type {
        "deploy" => vec![
            "Dockerfile",
            "docker-compose.yml",
            "compose.yml",
            ".github/workflows/",
            "deploy/",
            "k8s/",
        ],
        "docs" => vec!["README.md", "docs/"],
        "tests" => vec!["tests/", "test/", "__tests__/"],
        "frontend" => vec!["src/", "app/", "components/", "pages/", "styles/"],
        "data" => vec!["migrations/", "prisma/", "db/", "src/", "tests/"],
        "security" => vec!["src/", "lib/", "app/", "tests/"],
        _ => vec!["src/", "lib/", "app/", "tests/"],
    };
    let existing = candidates
        .iter()
        .filter(|candidate| repo_has_path(repo_root, candidate))
        .map(|candidate| candidate.to_string())
        .collect::<Vec<_>>();
    if !existing.is_empty() {
        return unique_strings(existing);
    }
    let defaults = value_string_array(defaults.get("allowedPaths"));
    if defaults.is_empty() {
        vec!["src/".to_string(), "tests/".to_string()]
    } else {
        defaults
    }
}

fn infer_rough_commands(task_type: &str, repo_root: &Path, defaults: &Value) -> Vec<String> {
    let defaults = value_string_array(defaults.get("requiredCommands"));
    if !defaults.is_empty() {
        return defaults;
    }
    if repo_root.join("package.json").exists() {
        return vec!["npm test".to_string()];
    }
    if repo_root.join("Cargo.toml").exists() {
        return vec!["cargo test".to_string()];
    }
    if repo_root.join("pyproject.toml").exists() || repo_root.join("pytest.ini").exists() {
        return vec!["pytest".to_string()];
    }
    if task_type == "docs" {
        Vec::new()
    } else {
        vec!["run the project test command".to_string()]
    }
}

fn infer_rough_risk_level(task: &str, task_type: &str) -> String {
    let normalized = task.to_ascii_lowercase();
    if contains_any(
        &normalized,
        &[
            "payment",
            "billing",
            "refund",
            "production",
            "permission",
            "secret",
            "migration",
        ],
    ) || matches!(task_type, "security" | "data" | "deploy")
    {
        "high".to_string()
    } else {
        "standard".to_string()
    }
}

fn rough_guard_rules(task_type: &str, risk_level: &str) -> Vec<String> {
    let mut rules = vec![
        "Keep the first edit inside the inferred allowed paths.".to_string(),
        "Run the inferred validation command before finishing.".to_string(),
        "Record evidence in the suggested evidence path.".to_string(),
    ];
    if task_type == "deploy" {
        rules.push("Call out rollback and environment impact explicitly.".to_string());
    }
    if matches!(risk_level, "high" | "critical") {
        rules.push("Capture review notes for the sensitive change.".to_string());
    }
    rules
}

fn rough_confidence(task: &str, task_type: &str, has_scope: bool) -> f64 {
    let normalized = task.to_ascii_lowercase();
    let mut score = if contains_any(
        &normalized,
        &["rough", "not sure", "maybe", "help me figure"],
    ) {
        0.48
    } else {
        0.68
    };
    if task_type != "implementation" {
        score += 0.08;
    }
    if has_scope {
        score += 0.06;
    }
    if score > 0.92 { 0.92 } else { score }
}

fn repo_signal_sources(repo_root: &Path) -> Vec<String> {
    [
        "package.json",
        "Cargo.toml",
        "pyproject.toml",
        "Dockerfile",
        "README.md",
    ]
    .iter()
    .filter(|path| repo_root.join(path).exists())
    .map(|path| (*path).to_string())
    .collect()
}

fn localized_rough_display(locale: &str, analysis: &Value) -> Value {
    let zh = is_zh_locale(locale);
    let task_type = analysis
        .get("taskType")
        .and_then(Value::as_str)
        .unwrap_or("implementation");
    let risk_level = analysis
        .pointer("/inferred/riskLevel")
        .and_then(Value::as_str)
        .unwrap_or("standard");
    if zh {
        json!({
            "title": format!("建议按 {} 类型收敛任务", task_type),
            "summary": format!("已推断风险级别为 {}，建议先确认范围、验证命令和证据位置。", risk_level),
            "actions": {
                "confirm": localized_action(locale, "accept"),
                "modify": localized_action(locale, "modify"),
                "cancel": localized_action(locale, "reject")
            }
        })
    } else {
        json!({
            "title": format!("Suggested {task_type} task shape"),
            "summary": format!("Inferred risk level is {risk_level}. Confirm scope, validation command, and evidence path before editing."),
            "actions": {
                "confirm": localized_action(locale, "accept"),
                "modify": localized_action(locale, "modify"),
                "cancel": localized_action(locale, "reject")
            }
        })
    }
}

fn localized_rough_message(locale: &str, status: &str, analysis: &Value) -> String {
    let confidence = analysis
        .get("confidence")
        .and_then(Value::as_f64)
        .unwrap_or_default()
        * 100.0;
    let task_type = analysis
        .get("taskType")
        .and_then(Value::as_str)
        .unwrap_or("implementation");
    if is_zh_locale(locale) {
        if status == "auto_accepted" {
            format!(
                "已自动接受 {task_type} 任务形状，置信度 {:.0}%。",
                confidence
            )
        } else {
            format!("检测到 {task_type} 任务形状，置信度 {:.0}%。", confidence)
        }
    } else if status == "auto_accepted" {
        format!(
            "Auto-accepted {task_type} task shape at {:.0}% confidence.",
            confidence
        )
    } else {
        format!(
            "Detected {task_type} task shape at {:.0}% confidence.",
            confidence
        )
    }
}

fn localized_action(locale: &str, action: &str) -> String {
    match (is_zh_locale(locale), action) {
        (true, "accept") => "使用这个任务范围".to_string(),
        (true, "modify") => "调整范围或命令".to_string(),
        (true, "reject") => "取消".to_string(),
        (false, "accept") => "Use this task shape".to_string(),
        (false, "modify") => "Adjust scope or commands".to_string(),
        (false, "reject") => "Cancel".to_string(),
        _ => action.to_string(),
    }
}

fn git_numstat(repo_root: &Path) -> BTreeMap<String, (i64, i64, bool)> {
    let output = Command::new("git")
        .args(["diff", "--numstat", "HEAD"])
        .current_dir(repo_root)
        .output();
    let Ok(output) = output else {
        return BTreeMap::new();
    };
    if !output.status.success() {
        return BTreeMap::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\t');
            let additions = parts.next()?;
            let deletions = parts.next()?;
            let file_path = normalize_repo_path(parts.next()?);
            let binary = additions == "-" && deletions == "-";
            Some((
                file_path,
                (
                    if binary {
                        0
                    } else {
                        additions.parse().unwrap_or(0)
                    },
                    if binary {
                        0
                    } else {
                        deletions.parse().unwrap_or(0)
                    },
                    binary,
                ),
            ))
        })
        .collect()
}

fn classify_explain_change_category(file_path: &str, config: &Value) -> String {
    let category = crate::diff::classify_change_type(file_path, config);
    if category != "other" {
        return category;
    }
    let lower = normalize_repo_path(file_path).to_ascii_lowercase();
    if lower.starts_with("tests/")
        || lower.starts_with("test/")
        || lower.contains("/tests/")
        || lower.contains("/test/")
        || lower.contains("__tests__/")
        || lower.contains(".test.")
        || lower.contains(".spec.")
    {
        "tests".to_string()
    } else if lower.starts_with("docs/")
        || lower.ends_with(".md")
        || lower.ends_with(".txt")
        || lower.ends_with(".rst")
    {
        "docs".to_string()
    } else if lower.ends_with(".json")
        || lower.ends_with(".yaml")
        || lower.ends_with(".yml")
        || lower.ends_with(".toml")
        || lower.starts_with(".github/")
    {
        "config".to_string()
    } else {
        category
    }
}

fn category_change_type(category: &str) -> &'static str {
    match category {
        "tests" => "test",
        "docs" => "documentation",
        "config" => "configuration",
        "migration" => "migration",
        "interface" => "interface",
        "implementation" => "implementation",
        _ => "other",
    }
}

fn file_change_summary(locale: &str, file_path: &str, category: &str) -> String {
    if is_zh_locale(locale) {
        format!("{} 有 {} 类变更", normalize_repo_path(file_path), category)
    } else {
        format!(
            "{} has {} changes",
            normalize_repo_path(file_path),
            category
        )
    }
}

fn change_risk_indicators(files: &[Value], total_additions: i64) -> Vec<String> {
    let mut risks = Vec::new();
    if files
        .iter()
        .any(|file| file.get("nature").and_then(Value::as_str) == Some("interface"))
    {
        risks.push("interface surface changed".to_string());
    }
    if files
        .iter()
        .any(|file| file.get("nature").and_then(Value::as_str) == Some("migration"))
    {
        risks.push("migration changed".to_string());
    }
    if total_additions > 200 {
        risks.push("large change size".to_string());
    }
    risks
}

fn change_summary_text(
    locale: &str,
    file_count: usize,
    categories: &serde_json::Map<String, Value>,
    task: &str,
    risk_indicators: &[String],
) -> String {
    let parts = categories
        .iter()
        .map(|(category, files)| {
            let count = files
                .as_array()
                .map(|items| items.len())
                .unwrap_or_default();
            if is_zh_locale(locale) {
                format!("{count} 个{category}")
            } else {
                format!("{count} {category}")
            }
        })
        .collect::<Vec<_>>();
    if is_zh_locale(locale) {
        let mut text = format!("共修改 {file_count} 个文件：{}。", parts.join("，"));
        if !task.is_empty() {
            text.push_str(&format!("任务：{task}。"));
        }
        if !risk_indicators.is_empty() {
            text.push_str(&format!("风险提示：{}。", risk_indicators.join("，")));
        }
        text
    } else {
        let mut text = format!("Modified {file_count} file(s): {}.", parts.join(", "));
        if !task.is_empty() {
            text.push_str(&format!(" Task: {task}."));
        }
        if !risk_indicators.is_empty() {
            text.push_str(&format!(
                " Risk indicators: {}.",
                risk_indicators.join(", ")
            ));
        }
        text
    }
}

fn contains_any(text: &str, patterns: &[&str]) -> bool {
    patterns.iter().any(|pattern| text.contains(pattern))
}

fn repo_has_path(repo_root: &Path, path_value: &str) -> bool {
    repo_root.join(path_value.trim_end_matches('/')).exists()
}

fn is_zh_locale(locale: &str) -> bool {
    let lower = locale.to_ascii_lowercase();
    lower == "zh" || lower == "zh-cn" || lower.starts_with("zh-")
}

#[cfg(windows)]
fn is_process_running(pid: u32) -> bool {
    let Ok(output) = Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}")])
        .output()
    else {
        return false;
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    stdout
        .split_whitespace()
        .any(|part| part == pid.to_string())
}

#[cfg(not(windows))]
fn is_process_running(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
