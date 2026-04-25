use serde_json::{Value, json};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
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
            "agent-guardrails-rs-mcp-{name}-{}-{unique}",
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
fn rust_mcp_supports_initialize_tool_list_and_read_only_tools() {
    let repo = TempDir::new("happy");
    seed_config(&repo);
    seed_daemon_files(&repo);

    let responses = run_mcp_frames(
        &repo,
        vec![
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "rust-contract-test",
                        "version": "1.0.0"
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list"
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "read_repo_guardrails",
                    "arguments": {
                        "repoRoot": repo.path
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {
                    "name": "suggest_task_contract",
                    "arguments": {
                        "repoRoot": repo.path,
                        "taskRequest": "I only have a rough idea. Please find the smallest safe change.",
                        "selectedFiles": ["src/billing/refund-service.js"],
                        "changedFiles": ["tests/refund-service.test.js"],
                        "overrides": {
                            "required-commands": "npm test,npm run lint",
                            "allowed-change-types": "implementation-only"
                        }
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "params": {
                    "name": "check_after_edit",
                    "arguments": {
                        "repoRoot": repo.path
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": {
                    "name": "read_daemon_status",
                    "arguments": {
                        "repoRoot": repo.path
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 7,
                "method": "tools/call",
                "params": {
                    "name": "unknown_tool",
                    "arguments": {}
                }
            }),
        ],
    );

    assert_eq!(responses.len(), 7);
    assert_eq!(
        responses[0]["result"]["serverInfo"]["name"],
        "agent-guardrails-mcp"
    );

    let tool_names: Vec<_> = responses[1]["result"]["tools"]
        .as_array()
        .expect("tools array")
        .iter()
        .map(|tool| tool["name"].as_str().expect("tool name"))
        .collect();
    assert_eq!(
        tool_names,
        vec![
            "read_repo_guardrails",
            "suggest_task_contract",
            "start_agent_native_loop",
            "check_after_edit",
            "finish_agent_native_loop",
            "run_guardrail_check",
            "summarize_review_risks",
            "plan_rough_intent",
            "read_daemon_status",
            "explain_change",
            "query_archaeology"
        ]
    );

    let guardrails = &responses[2]["result"]["structuredContent"];
    assert_eq!(guardrails["preset"], "node-service");
    assert_eq!(guardrails["policy"]["maxChangedFilesPerTask"], 12.0);
    assert_eq!(guardrails["defaults"]["requiredCommands"][0], "npm test");
    assert_eq!(guardrails["rustPreview"], true);
    assert_eq!(
        responses[2]["result"]["content"][0]["type"],
        Value::String("text".to_string())
    );

    let suggestion = &responses[3]["result"]["structuredContent"];
    assert_eq!(
        suggestion["contract"]["task"],
        "I only have a rough idea. Please find the smallest safe change."
    );
    assert_eq!(suggestion["contract"]["preset"], "node-service");
    assert_eq!(
        suggestion["contract"]["intendedFiles"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
    assert_eq!(suggestion["contract"]["allowedPaths"][0], "src/billing/");
    assert_eq!(
        suggestion["contract"]["requiredCommands"][1],
        "npm run lint"
    );
    assert_eq!(suggestion["contract"]["riskLevel"], "medium");
    assert_eq!(suggestion["contract"]["requiresReviewNotes"], true);
    assert_eq!(
        suggestion["contract"]["session"]["contractSource"],
        "runtime-suggested"
    );
    assert_eq!(suggestion["suggestions"]["roughIntent"]["detected"], true);
    assert_eq!(suggestion["rustPreview"], true);

    let edit_check = &responses[4]["result"]["structuredContent"];
    assert_eq!(edit_check["status"], "clean");
    assert_eq!(edit_check["cacheAge"], 0);
    assert_eq!(edit_check["rustPreview"], true);
    assert!(
        responses[4]["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("All clear")
    );

    let daemon = &responses[5]["result"]["structuredContent"];
    assert_eq!(daemon["running"], false);
    assert_eq!(daemon["config"]["checkInterval"], 2500);
    assert_eq!(daemon["lastResult"]["ok"], true);

    assert_eq!(responses[6]["error"]["code"], -32601);
}

#[test]
fn rust_mcp_returns_missing_config_error_for_repo_guardrails() {
    let repo = TempDir::new("missing-config");

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "read_repo_guardrails",
                "arguments": {
                    "repoRoot": repo.path
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    assert_eq!(responses[0]["error"]["code"], -32010);
}

#[test]
fn rust_mcp_requires_task_request_for_contract_suggestion() {
    let repo = TempDir::new("missing-task");
    seed_config(&repo);

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "suggest_task_contract",
                "arguments": {
                    "repoRoot": repo.path
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    assert_eq!(responses[0]["error"]["code"], -32602);
}

#[test]
fn rust_mcp_start_agent_native_loop_writes_contract_and_evidence() {
    let repo = TempDir::new("start-loop");
    seed_config(&repo);

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "start_agent_native_loop",
                "arguments": {
                    "repoRoot": repo.path,
                    "taskRequest": "Refine billing refund behavior",
                    "selectedFiles": ["src/billing/refund-service.js"],
                    "overrides": {
                        "required-commands": ["npm test"]
                    }
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    let result = &responses[0]["result"]["structuredContent"];
    assert_eq!(
        result["contractPath"],
        ".agent-guardrails/task-contract.json"
    );
    assert_eq!(result["contract"]["schemaVersion"], 3);
    assert_eq!(result["contract"]["task"], "Refine billing refund behavior");
    assert_eq!(result["session"]["contractSource"], "runtime-suggested");
    assert_eq!(result["evidenceFiles"][0]["created"], true);
    assert_eq!(result["loop"]["status"], "bootstrapped");
    assert_eq!(result["rustPreview"], true);
    assert!(
        responses[0]["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Agent loop started")
    );
    let contract_text = fs::read_to_string(repo.path.join(".agent-guardrails/task-contract.json"))
        .expect("contract file");
    assert!(contract_text.contains("\"schemaVersion\": 3"));
    let evidence = fs::read_to_string(repo.path.join(".agent-guardrails/evidence/current-task.md"))
        .expect("evidence file");
    assert!(evidence.contains("- Task: Refine billing refund behavior"));
}

#[test]
fn rust_mcp_start_loop_defaults_evidence_path_without_workflow_defaults() {
    let repo = TempDir::new("start-loop-default-evidence");
    let config_dir = repo.path.join(".agent-guardrails");
    fs::create_dir_all(&config_dir).expect("config dir");
    fs::write(
        config_dir.join("config.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "preset": "generic",
                "checks": {
                    "sourceRoots": ["src"],
                    "testRoots": ["tests"],
                    "sourceExtensions": [".js"],
                    "testExtensions": [".js"]
                }
            }))
            .expect("serialize config")
        ),
    )
    .expect("write config");

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "start_agent_native_loop",
                "arguments": {
                    "repoRoot": repo.path,
                    "taskRequest": "Update service value",
                    "selectedFiles": ["src/service.js"],
                    "overrides": {
                        "allowedPaths": ["src/", "tests/"],
                        "intendedFiles": ["src/service.js", "tests/service.test.js"]
                    }
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    let result = &responses[0]["result"]["structuredContent"];
    assert_eq!(
        result["contract"]["evidencePaths"],
        json!([".agent-guardrails/evidence/current-task.md"])
    );
    assert_eq!(
        result["session"]["evidencePathSuggested"],
        ".agent-guardrails/evidence/current-task.md"
    );
    assert_eq!(
        result["evidenceFiles"][0]["path"],
        ".agent-guardrails/evidence/current-task.md"
    );
    assert!(
        repo.path
            .join(".agent-guardrails/evidence/current-task.md")
            .exists()
    );
}

#[test]
fn rust_mcp_run_guardrail_check_returns_check_result() {
    let repo = TempDir::new("check");
    init_git_repo(&repo);
    seed_check_repo(&repo);
    git(&repo.path, ["add", "."]);
    git(&repo.path, ["commit", "-m", "initial"]);
    fs::write(
        repo.path.join("src/service.js"),
        "export const value = 2;\n",
    )
    .expect("modify source");

    let mut responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "run_guardrail_check",
                "arguments": {
                    "repoRoot": repo.path,
                    "commandsRun": ["npm test"],
                    "review": true
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    let check_response = responses.pop().expect("check response");
    let check = &check_response["result"]["structuredContent"];
    assert_eq!(check["ok"], false);
    assert_eq!(check["preset"], "generic");
    assert_eq!(check["counts"]["changedFiles"], 1);
    assert_eq!(check["counts"]["sourceFiles"], 1);
    assert_eq!(check["findings"][0]["code"], "source-without-tests");
    assert_eq!(check["rustPreview"], true);

    let summary_responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "summarize_review_risks",
                "arguments": {
                    "checkResult": check
                }
            }
        })],
    );
    assert_eq!(summary_responses.len(), 1);
    let summary = &summary_responses[0]["result"]["structuredContent"];
    assert_eq!(summary["status"], "fail");
    assert_eq!(summary["verdict"], "Validation incomplete");
    assert_eq!(summary["costHints"]["sizeLevel"], "Small");
    assert_eq!(summary["topRisks"][0]["code"], "source-without-tests");
    assert_eq!(
        summary["nextActions"]
            .as_array()
            .expect("next actions")
            .is_empty(),
        false
    );
    assert_eq!(summary["rustPreview"], true);
}

#[test]
fn rust_mcp_finish_agent_native_loop_writes_evidence_and_returns_summary() {
    let repo = TempDir::new("finish");
    init_git_repo(&repo);
    seed_check_repo(&repo);
    seed_task_contract(&repo);
    git(&repo.path, ["add", "."]);
    git(&repo.path, ["commit", "-m", "initial"]);
    fs::write(
        repo.path.join("src/service.js"),
        "export const value = 3;\n",
    )
    .expect("modify source");

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "finish_agent_native_loop",
                "arguments": {
                    "repoRoot": repo.path,
                    "commandsRun": ["npm test"],
                    "evidence": {
                        "notableResults": ["unit tests passed"],
                        "reviewNotes": ["source-only change reviewed"],
                        "residualRisk": "none"
                    }
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    let result = &responses[0]["result"]["structuredContent"];
    assert_eq!(
        result["contractPath"],
        ".agent-guardrails/task-contract.json"
    );
    assert_eq!(result["evidenceFiles"][0]["updated"], true);
    assert_eq!(result["checkResult"]["commandsRun"][0], "npm test");
    assert_eq!(
        result["checkResult"]["missingEvidencePaths"]
            .as_array()
            .expect("missing evidence paths")
            .len(),
        0
    );
    assert_eq!(result["reviewerSummary"]["status"], "fail");
    assert_eq!(result["rustPreview"], true);
    assert!(
        responses[0]["result"]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("Task complete")
    );
    let evidence = fs::read_to_string(repo.path.join(".agent-guardrails/evidence/current-task.md"))
        .expect("read evidence");
    assert!(evidence.contains("- Commands run: npm test"));
    assert!(evidence.contains("- Notable results: unit tests passed"));
}

#[test]
fn rust_mcp_supports_rough_intent_explanation_and_archaeology_tools() {
    let repo = TempDir::new("oss-parity-tools");
    init_git_repo(&repo);
    seed_check_repo(&repo);
    fs::create_dir_all(repo.path.join("tests")).expect("tests dir");
    fs::write(
        repo.path.join("tests/service.test.js"),
        "export const testValue = 1;\n",
    )
    .expect("test file");
    seed_task_contract(&repo);
    fs::write(
        repo.path.join(".agent-guardrails/archaeology.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "version": 1,
                "lastUpdated": "2026-04-24T00:00:00.000Z",
                "notes": [
                    {
                        "sessionId": "session-1",
                        "summary": "Changed service value for smoke coverage."
                    },
                    {
                        "sessionId": "session-2",
                        "summary": "Unrelated note."
                    }
                ]
            }))
            .expect("serialize archaeology")
        ),
    )
    .expect("archaeology");
    git(&repo.path, ["add", "."]);
    git(&repo.path, ["commit", "-m", "initial"]);
    fs::write(
        repo.path.join("src/service.js"),
        "export const value = 2;\n",
    )
    .expect("modify source");
    fs::write(
        repo.path.join("tests/service.test.js"),
        "export const testValue = 2;\n",
    )
    .expect("modify test");

    let responses = run_mcp_frames(
        &repo,
        vec![
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {
                    "name": "plan_rough_intent",
                    "arguments": {
                        "repoRoot": repo.path,
                        "task": "Help me figure out the smallest safe service change",
                        "locale": "en"
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "explain_change",
                    "arguments": {
                        "repoRoot": repo.path,
                        "locale": "en"
                    }
                }
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "query_archaeology",
                    "arguments": {
                        "repoRoot": repo.path,
                        "sessionId": "session-1"
                    }
                }
            }),
        ],
    );

    assert_eq!(responses.len(), 3);
    let rough = &responses[0]["result"]["structuredContent"];
    assert_eq!(rough["status"], "suggestion");
    assert_eq!(rough["taskType"], "implementation");
    assert_eq!(rough["rustPreview"], true);
    assert!(
        rough["inferred"]["allowedPaths"]
            .as_array()
            .expect("allowed paths")
            .iter()
            .any(|path| path.as_str() == Some("src/"))
    );

    let explanation = &responses[1]["result"]["structuredContent"];
    assert_eq!(explanation["fileCount"], 2);
    assert_eq!(explanation["rustPreview"], true);
    assert!(
        explanation["summary"]
            .as_str()
            .expect("summary")
            .contains("Modified 2 file")
    );
    assert_eq!(
        explanation["categories"]["implementation"][0],
        "src/service.js"
    );
    assert_eq!(
        explanation["categories"]["tests"][0],
        "tests/service.test.js"
    );

    let archaeology = &responses[2]["result"]["structuredContent"];
    assert_eq!(archaeology["sessionId"], "session-1");
    assert_eq!(archaeology["noteCount"], 1);
    assert_eq!(
        archaeology["notes"][0]["summary"],
        "Changed service value for smoke coverage."
    );
    assert_eq!(archaeology["rustPreview"], true);
}

#[test]
fn rust_mcp_enforces_loop_oriented_session_limit() {
    let repo = TempDir::new("loop-limit");
    seed_config(&repo);
    let mut messages = Vec::new();
    for id in 1..=51 {
        messages.push(json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": "tools/call",
            "params": {
                "name": "explain_change",
                "arguments": {
                    "repoRoot": repo.path
                }
            }
        }));
    }
    messages.push(json!({
        "jsonrpc": "2.0",
        "id": 52,
        "method": "tools/call",
        "params": {
            "name": "read_repo_guardrails",
            "arguments": {
                "repoRoot": repo.path
            }
        }
    }));

    let responses = run_mcp_frames(&repo, messages);
    assert_eq!(responses.len(), 52);
    assert!(responses[49]["result"].is_object());
    assert_eq!(responses[50]["error"]["code"], -32020);
    assert_eq!(responses[50]["error"]["data"]["limit"], 50);
    assert_eq!(responses[50]["error"]["data"]["current"], 51);
    assert_eq!(responses[50]["error"]["data"]["tool"], "explain_change");
    assert_eq!(
        responses[51]["result"]["structuredContent"]["preset"],
        "node-service"
    );
}

#[test]
fn rust_mcp_forwards_repo_local_pro_tools() {
    let repo = TempDir::new("pro-tools");
    seed_config(&repo);
    install_mock_pro_mcp_package(&repo);

    let responses = run_mcp_frames(
        &repo,
        vec![
            json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/list"
            }),
            json!({
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {
                    "name": "pro_read_workbench",
                    "arguments": {
                        "repoRoot": repo.path
                    }
                }
            }),
        ],
    );

    assert_eq!(responses.len(), 2);
    let tool_names = responses[0]["result"]["tools"]
        .as_array()
        .expect("tools")
        .iter()
        .map(|tool| tool["name"].as_str().expect("tool name"))
        .collect::<Vec<_>>();
    assert!(tool_names.contains(&"pro_read_workbench"));
    let workbench = &responses[1]["result"]["structuredContent"];
    assert_eq!(workbench["state"], "ready");
    assert_eq!(workbench["source"], "mock-pro");
    assert!(
        workbench["agentHandoff"]["prompt"]
            .as_str()
            .expect("prompt")
            .contains("rerun agent-guardrails check --review")
    );
}

#[test]
fn rust_mcp_finish_agent_native_loop_requires_contract() {
    let repo = TempDir::new("finish-missing-contract");
    seed_config(&repo);

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "finish_agent_native_loop",
                "arguments": {
                    "repoRoot": repo.path
                }
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    assert_eq!(responses[0]["error"]["code"], -32010);
}

#[test]
fn rust_mcp_requires_check_result_for_risk_summary() {
    let repo = TempDir::new("summary-missing-check");

    let responses = run_mcp_frames(
        &repo,
        vec![json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {
                "name": "summarize_review_risks",
                "arguments": {}
            }
        })],
    );

    assert_eq!(responses.len(), 1);
    assert_eq!(responses[0]["error"]["code"], -32602);
}

fn seed_config(repo: &TempDir) {
    let config_dir = repo.path.join(".agent-guardrails");
    fs::create_dir_all(&config_dir).expect("config dir");
    fs::write(
        config_dir.join("config.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "preset": "node-service",
                "workflow": {
                    "planDefaults": {
                        "allowedPaths": ["src/", "tests/"],
                        "requiredCommands": ["npm test"],
                        "evidencePaths": [".agent-guardrails/evidence/current-task.md"]
                    },
                    "readBeforeWrite": ["AGENTS.md"],
                    "constraints": ["Keep the change small."],
                    "definitionOfDone": ["Tests pass."]
                },
                "checks": {
                    "allowedPaths": ["src/", "tests/"],
                    "consistency": {
                        "maxChangedFilesPerTask": 12,
                        "maxTopLevelEntries": 4
                    },
                    "correctness": {
                        "requireTestsWithSourceChanges": true
                    }
                },
                "protectedAreas": [
                    {
                        "path": "src/billing/",
                        "label": "Billing",
                        "minimumRiskLevel": "medium",
                        "requiresReviewNotes": true
                    }
                ],
                "productionProfiles": {
                    "default": {
                        "risk": "standard"
                    }
                },
                "languagePlugins": {
                    "javascript": "@agent-guardrails/plugin-js"
                }
            }))
            .expect("serialize config")
        ),
    )
    .expect("write config");
}

fn seed_daemon_files(repo: &TempDir) {
    let config_dir = repo.path.join(".agent-guardrails");
    fs::create_dir_all(&config_dir).expect("config dir");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_millis() as i64;
    fs::write(
        config_dir.join("daemon.json"),
        "{\n  \"watchPaths\": [\"src/\"],\n  \"checkInterval\": 2500,\n  \"blockOnHighRisk\": false\n}\n",
    )
    .expect("write daemon config");
    fs::write(
        config_dir.join("daemon-info.json"),
        "{\n  \"pid\": 999999,\n  \"checksRun\": 2,\n  \"lastCheck\": \"2026-04-24T00:00:00.000Z\"\n}\n",
    )
    .expect("write daemon info");
    fs::write(
        config_dir.join("daemon-result.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "ok": true,
                "timestamp": timestamp,
                "findings": [],
                "score": 100,
                "scoreVerdict": "safe-to-deploy",
                "result": { "ok": true }
            }))
            .expect("serialize daemon result")
        ),
    )
    .expect("write daemon result");
}

fn init_git_repo(repo: &TempDir) {
    git(&repo.path, ["init"]);
    git(&repo.path, ["config", "user.email", "test@example.com"]);
    git(
        &repo.path,
        ["config", "user.name", "Agent Guardrails MCP Test"],
    );
    git(&repo.path, ["config", "core.autocrlf", "false"]);
}

fn seed_check_repo(repo: &TempDir) {
    fs::create_dir_all(repo.path.join(".agent-guardrails")).expect("guardrails dir");
    fs::create_dir_all(repo.path.join("docs")).expect("docs dir");
    fs::create_dir_all(repo.path.join("src")).expect("src dir");
    fs::write(repo.path.join("AGENTS.md"), "# Agent instructions\n").expect("AGENTS");
    fs::write(repo.path.join("docs/PROJECT_STATE.md"), "# Project state\n").expect("state");
    fs::write(repo.path.join("docs/PR_CHECKLIST.md"), "# PR checklist\n").expect("checklist");
    fs::write(
        repo.path.join(".agent-guardrails/config.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "preset": "generic",
                "checks": {
                    "sourceRoots": ["src"],
                    "sourceExtensions": [".js"],
                    "correctness": {
                        "requireTestsWithSourceChanges": true
                    }
                }
            }))
            .expect("serialize config")
        ),
    )
    .expect("config");
    fs::write(
        repo.path.join("src/service.js"),
        "export const value = 1;\n",
    )
    .expect("source");
}

fn seed_task_contract(repo: &TempDir) {
    fs::create_dir_all(repo.path.join(".agent-guardrails")).expect("guardrails dir");
    fs::write(
        repo.path.join(".agent-guardrails/task-contract.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&json!({
                "schemaVersion": 3,
                "task": "Update service",
                "preset": "generic",
                "allowedPaths": ["src/", "tests/"],
                "intendedFiles": ["src/service.js"],
                "requiredCommands": ["npm test"],
                "evidencePaths": [".agent-guardrails/evidence/current-task.md"],
                "riskLevel": "standard",
                "requiresReviewNotes": true,
                "validationProfile": "standard"
            }))
            .expect("serialize contract")
        ),
    )
    .expect("task contract");
}

fn install_mock_pro_mcp_package(repo: &TempDir) {
    let package_dir = repo
        .path
        .join("node_modules")
        .join("@agent-guardrails")
        .join("pro");
    fs::create_dir_all(&package_dir).expect("pro package dir");
    fs::write(
        package_dir.join("package.json"),
        "{\n  \"name\": \"@agent-guardrails/pro\",\n  \"version\": \"0.1.0-test\",\n  \"type\": \"module\",\n  \"exports\": { \".\": \"./index.js\" }\n}\n",
    )
    .expect("pro package json");
    fs::write(
        package_dir.join("index.js"),
        [
            "export function getProMcpToolDefinitions() {",
            "  return [{",
            "    name: 'pro_read_workbench',",
            "    description: 'Read the latest Pro Workbench for the current repo.',",
            "    inputSchema: { type: 'object', properties: { repoRoot: { type: 'string' } }, additionalProperties: false }",
            "  }];",
            "}",
            "export async function callProMcpTool(name, args = {}) {",
            "  if (name !== 'pro_read_workbench') throw new Error(`Unknown Pro MCP tool ${name}`);",
            "  return {",
            "    state: 'ready',",
            "    source: 'mock-pro',",
            "    repoRoot: args.repoRoot,",
            "    workbench: { headline: 'Can I ship? No, hold this change.' },",
            "    agentHandoff: { prompt: 'Run tests, capture evidence, and rerun agent-guardrails check --review.' }",
            "  };",
            "}",
            "",
        ]
        .join("\n"),
    )
    .expect("pro package index");
}

fn git<I, S>(cwd: &Path, args: I)
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = Command::new("git")
        .args(args.into_iter().map(|arg| arg.as_ref().to_string()))
        .current_dir(cwd)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git command failed in {}: {}",
        cwd.display(),
        String::from_utf8_lossy(&output.stderr)
    );
}

fn run_mcp_frames(repo: &TempDir, messages: Vec<Value>) -> Vec<Value> {
    let mut child = cli()
        .arg("mcp")
        .current_dir(&repo.path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn mcp");

    {
        let mut stdin = child.stdin.take().expect("stdin");
        for message in messages {
            stdin
                .write_all(&encode_message(&message))
                .expect("write mcp frame");
        }
    }

    let output = child.wait_with_output().expect("mcp output");
    assert!(
        output.status.success(),
        "stderr: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    decode_messages(&output.stdout)
}

fn encode_message(message: &Value) -> Vec<u8> {
    let payload = serde_json::to_vec(message).expect("message JSON");
    let mut frame = format!("Content-Length: {}\r\n\r\n", payload.len()).into_bytes();
    frame.extend(payload);
    frame
}

fn decode_messages(mut bytes: &[u8]) -> Vec<Value> {
    let mut messages = Vec::new();
    while !bytes.is_empty() {
        let header_end = bytes
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .expect("header end");
        let header = std::str::from_utf8(&bytes[..header_end]).expect("header utf8");
        let content_length = header
            .split("\r\n")
            .find_map(|line| {
                let (name, value) = line.split_once(':')?;
                if name.eq_ignore_ascii_case("Content-Length") {
                    value.trim().parse::<usize>().ok()
                } else {
                    None
                }
            })
            .expect("content length");
        let payload_start = header_end + 4;
        let payload_end = payload_start + content_length;
        messages.push(
            serde_json::from_slice(&bytes[payload_start..payload_end]).expect("response JSON"),
        );
        bytes = &bytes[payload_end..];
    }
    messages
}
