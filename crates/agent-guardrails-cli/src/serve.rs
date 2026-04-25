use crate::diff::resolve_git_root;
use crate::mcp::call_tool_for_repo;
use serde_json::{Value, json};
use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const MAX_BODY_BYTES: usize = 1024 * 1024;

#[derive(Debug)]
struct ServeArgs {
    host: String,
    port: u16,
    locale: String,
}

pub fn run_serve_cli(args: &[String]) -> i32 {
    match run_serve(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails serve: {error}");
            1
        }
    }
}

fn run_serve(args: &[String]) -> Result<(), String> {
    let args = parse_serve_args(args)?;
    if let Some(warning) = host_warning(&args.host) {
        eprintln!("{warning}");
    }
    let listener = TcpListener::bind(format!("{}:{}", args.host, args.port))
        .map_err(|error| format!("failed to listen on {}:{}: {error}", args.host, args.port))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("failed to read listener address: {error}"))?;
    println!(
        "{}",
        serve_message(&args.locale, "started").replace("{url}", &format!("http://{address}"))
    );
    println!("  GET  /api/health");
    println!("  POST /api/chat");
    println!("  POST /api/tools/:name");
    println!("  POST /api/explain");
    println!("  POST /api/archaeology");
    println!("{}", serve_message(&args.locale, "stop_hint"));

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let _ = handle_stream(&mut stream);
            }
            Err(error) => {
                eprintln!("agent-guardrails serve: connection error: {error}");
            }
        }
    }
    Ok(())
}

fn parse_serve_args(args: &[String]) -> Result<ServeArgs, String> {
    let mut host = "127.0.0.1".to_string();
    let mut port = 3456_u16;
    let mut locale = "en".to_string();
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "--host" => {
                host = read_flag_value(args, index, "--host")?;
                index += 2;
            }
            "--port" | "-p" => {
                let value = read_flag_value(args, index, args[index].as_str())?;
                port = value
                    .parse::<u16>()
                    .map_err(|_| format!("invalid port: {value}"))?;
                if port == 0 {
                    return Err("invalid port: 0".to_string());
                }
                index += 2;
            }
            "--lang" => {
                locale = read_flag_value(args, index, "--lang")?;
                index += 2;
            }
            value if value.starts_with('-') => {
                return Err(format!("unknown option: {value}"));
            }
            value => {
                return Err(format!("unexpected argument: {value}"));
            }
        }
    }

    Ok(ServeArgs { host, port, locale })
}

fn handle_stream(stream: &mut TcpStream) -> Result<(), String> {
    let request = read_http_request(stream)?;
    let response = match (request.method.as_str(), request.path.as_str()) {
        ("GET", "/api/health") => http_json(
            200,
            json!({
                "status": "ok",
                "version": VERSION,
                "activeSessions": 0,
                "rustPreview": true,
                "endpoints": {
                    "chat": "/api/chat",
                    "health": "/api/health",
                    "tools": "/api/tools/:name",
                    "explain": "/api/explain",
                    "archaeology": "/api/archaeology"
                }
            }),
        ),
        ("POST", "/api/chat") => handle_chat(&request.body),
        ("POST", "/api/explain") => handle_named_tool("explain_change", &request.body),
        ("POST", "/api/archaeology") => handle_named_tool("query_archaeology", &request.body),
        ("POST", path) if path.starts_with("/api/tools/") => {
            handle_named_tool(path.trim_start_matches("/api/tools/"), &request.body)
        }
        _ => http_json(404, json!({ "error": "Not found" })),
    };
    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("failed to write response: {error}"))
}

fn handle_chat(body: &[u8]) -> String {
    let body = match parse_json_body(body) {
        Ok(value) => value,
        Err((status, value)) => return http_json(status, value),
    };

    let locale = body
        .get("locale")
        .and_then(Value::as_str)
        .unwrap_or("en")
        .to_string();
    let message = body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let session_id = body
        .get("sessionId")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("rust-{}", current_millis()));

    if message.is_empty() {
        return http_json(
            200,
            json!({
                "reply": welcome_reply(&locale),
                "sessionId": session_id,
                "rustPreview": true
            }),
        );
    }

    let Some(intent) = route_intent(&message) else {
        return http_json(
            200,
            json!({
                "reply": welcome_reply(&locale),
                "sessionId": session_id,
                "rustPreview": true
            }),
        );
    };

    let repo_root = resolve_body_repo_root(&body);
    let mut args = intent.args;
    if let Some(object) = args.as_object_mut() {
        object.insert(
            "repoRoot".to_string(),
            json!(repo_root.to_string_lossy().to_string()),
        );
        object.insert("locale".to_string(), json!(locale.clone()));
    }

    match call_tool_for_repo(&intent.tool, args, &repo_root) {
        Ok(tool_result) => {
            let data = structured_content(&tool_result);
            http_json(
                200,
                json!({
                    "reply": format_human_output(&intent.tool, &data, &locale),
                    "sessionId": session_id,
                    "tool": intent.tool,
                    "rawResult": data,
                    "rustPreview": true
                }),
            )
        }
        Err(error) => http_json(
            500,
            json!({
                "reply": format!("Tool {} failed: {error}", intent.tool),
                "sessionId": session_id,
                "rustPreview": true
            }),
        ),
    }
}

fn handle_named_tool(tool_name: &str, body: &[u8]) -> String {
    let body = match parse_json_body(body) {
        Ok(value) => value,
        Err((status, value)) => return http_json(status, value),
    };
    if tool_name.trim().is_empty() {
        return http_json(400, json!({ "error": "Tool name required in URL path" }));
    }

    let locale = body
        .get("locale")
        .and_then(Value::as_str)
        .unwrap_or("en")
        .to_string();
    let repo_root = resolve_body_repo_root(&body);
    let mut args = body;
    if let Some(object) = args.as_object_mut() {
        object.insert(
            "repoRoot".to_string(),
            json!(repo_root.to_string_lossy().to_string()),
        );
    }

    match call_tool_for_repo(tool_name, args, &repo_root) {
        Ok(tool_result) => {
            let data = structured_content(&tool_result);
            http_json(
                200,
                json!({
                    "reply": format_human_output(tool_name, &data, &locale),
                    "tool": tool_name,
                    "rawResult": data,
                    "rustPreview": true
                }),
            )
        }
        Err(error) => http_json(
            500,
            json!({
                "error": format!("Tool {tool_name} failed: {error}"),
                "rustPreview": true
            }),
        ),
    }
}

fn resolve_body_repo_root(body: &Value) -> PathBuf {
    let repo_root = body
        .get("repoRoot")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .unwrap_or_else(|| env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));
    resolve_git_root(&repo_root).unwrap_or(repo_root)
}

fn structured_content(tool_result: &Value) -> Value {
    tool_result
        .get("structuredContent")
        .cloned()
        .unwrap_or_else(|| tool_result.clone())
}

struct RoutedIntent {
    tool: String,
    args: Value,
}

fn route_intent(message: &str) -> Option<RoutedIntent> {
    let trimmed = message.trim();
    if trimmed.is_empty() {
        return None;
    }
    let lower = trimmed.to_ascii_lowercase();
    let (tool, args) = if starts_or_contains(
        &lower,
        &["check", "verify", "review", "inspect", "guardrail check"],
    ) {
        ("run_guardrail_check", json!({ "review": true }))
    } else if starts_or_contains(
        &lower,
        &[
            "explain",
            "explain change",
            "what changed",
            "why changed",
            "describe change",
        ],
    ) {
        ("explain_change", json!({}))
    } else if starts_or_contains(
        &lower,
        &[
            "archaeology",
            "history",
            "change history",
            "why this way",
            "query",
        ],
    ) {
        ("query_archaeology", json!({}))
    } else if starts_or_contains(&lower, &["daemon", "watcher", "monitor"]) {
        ("read_daemon_status", json!({}))
    } else if starts_or_contains(&lower, &["rules", "guardrails", "config", "repo"]) {
        ("read_repo_guardrails", json!({}))
    } else if starts_or_contains(&lower, &["done", "finished", "complete", "finish"]) {
        ("finish_agent_native_loop", json!({}))
    } else if starts_or_contains(&lower, &["risk", "summary", "summarize", "risks"]) {
        ("summarize_review_risks", json!({}))
    } else if starts_or_contains(&lower, &["suggest", "contract", "brief"]) {
        ("suggest_task_contract", json!({ "taskRequest": trimmed }))
    } else if starts_or_contains(&lower, &["start", "begin", "implement"]) {
        ("start_agent_native_loop", json!({ "taskRequest": trimmed }))
    } else {
        ("plan_rough_intent", json!({ "task": trimmed }))
    };

    Some(RoutedIntent {
        tool: tool.to_string(),
        args,
    })
}

fn starts_or_contains(lower: &str, needles: &[&str]) -> bool {
    needles
        .iter()
        .any(|needle| lower.starts_with(needle) || lower.contains(needle))
}

fn welcome_reply(locale: &str) -> &'static str {
    if is_zh_locale(locale) {
        "我是 Agent Guardrails 助手。你可以让我规划任务、检查改动、解释当前 diff，或查看仓库规则。"
    } else {
        "I'm the Agent Guardrails assistant. Ask me to plan a task, check a change, explain the current diff, or show repo rules."
    }
}

fn format_human_output(tool_name: &str, data: &Value, locale: &str) -> String {
    let zh = is_zh_locale(locale);
    match tool_name {
        "run_guardrail_check" | "finish_agent_native_loop" => format_check_reply(data, zh),
        "plan_rough_intent" => format_plan_reply(data, zh),
        "explain_change" => data
            .get("explanation")
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| {
                if zh {
                    "当前没有可解释的改动。".to_string()
                } else {
                    "No change explanation is available yet.".to_string()
                }
            }),
        "query_archaeology" => {
            let count = data
                .get("noteCount")
                .and_then(Value::as_u64)
                .unwrap_or_default();
            if count == 0 {
                if zh {
                    "还没有项目记录。".to_string()
                } else {
                    "No archaeology records yet.".to_string()
                }
            } else {
                format!("{count} archaeology record(s) found.")
            }
        }
        "read_daemon_status" => format_daemon_reply(data, zh),
        "read_repo_guardrails" => {
            let preset = data
                .get("preset")
                .and_then(Value::as_str)
                .unwrap_or("generic");
            if zh {
                format!("当前仓库规则已读取，预设为 {preset}。")
            } else {
                format!("Repo guardrails loaded. Preset: {preset}.")
            }
        }
        _ => data
            .get("message")
            .or_else(|| data.get("summary"))
            .and_then(Value::as_str)
            .map(ToString::to_string)
            .unwrap_or_else(|| {
                if zh {
                    "工具已运行，结果在 rawResult 中。".to_string()
                } else {
                    "Tool completed. See rawResult for details.".to_string()
                }
            }),
    }
}

fn format_check_reply(data: &Value, zh: bool) -> String {
    let ok = data.get("ok").and_then(Value::as_bool).unwrap_or(false);
    let score = data
        .get("score")
        .and_then(Value::as_f64)
        .unwrap_or_default();
    let failures = data
        .pointer("/counts/failures")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let warnings = data
        .pointer("/counts/warnings")
        .and_then(Value::as_u64)
        .unwrap_or_default();
    let changed = data
        .pointer("/counts/changedFiles")
        .or_else(|| data.pointer("/counts/changed_files"))
        .and_then(Value::as_u64)
        .unwrap_or_default();
    if zh {
        format!(
            "{} 评分 {:.0}/100。改动文件 {changed} 个，错误 {failures} 个，警告 {warnings} 个。",
            if ok {
                "检查通过。"
            } else {
                "检查需要处理。"
            },
            score
        )
    } else {
        format!(
            "{} Score {:.0}/100. Changed files: {changed}; errors: {failures}; warnings: {warnings}.",
            if ok {
                "Guardrail check passed."
            } else {
                "Guardrail check needs attention."
            },
            score
        )
    }
}

fn format_plan_reply(data: &Value, zh: bool) -> String {
    let task_type = data
        .get("taskType")
        .and_then(Value::as_str)
        .unwrap_or("implementation");
    let risk = data
        .pointer("/inferred/riskLevel")
        .and_then(Value::as_str)
        .unwrap_or("standard");
    if zh {
        format!("已建议 {task_type} 类型的任务范围，风险级别为 {risk}。")
    } else {
        format!("Suggested a {task_type} task shape with {risk} risk.")
    }
}

fn format_daemon_reply(data: &Value, zh: bool) -> String {
    let running = data
        .get("running")
        .or_else(|| data.pointer("/status/running"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let checks = data
        .get("checksRun")
        .or_else(|| data.pointer("/status/checksRun"))
        .and_then(Value::as_u64)
        .unwrap_or_default();
    if zh {
        format!(
            "后台检查{}，已运行 {checks} 次检查。",
            if running { "正在运行" } else { "未运行" }
        )
    } else {
        format!(
            "Daemon is {}. Checks run: {checks}.",
            if running { "running" } else { "stopped" }
        )
    }
}

fn is_zh_locale(locale: &str) -> bool {
    let lower = locale.to_ascii_lowercase();
    lower == "zh" || lower == "zh-cn" || lower.starts_with("zh-")
}

fn current_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default()
}

struct HttpRequest {
    method: String,
    path: String,
    body: Vec<u8>,
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = Vec::new();
    let mut temp = [0_u8; 4096];
    loop {
        let count = stream
            .read(&mut temp)
            .map_err(|error| format!("failed to read request: {error}"))?;
        if count == 0 {
            break;
        }
        buffer.extend_from_slice(&temp[..count]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
        if buffer.len() > MAX_BODY_BYTES {
            return Err("request headers too large".to_string());
        }
    }

    let header_end = buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| "invalid HTTP request".to_string())?;
    let header_text = String::from_utf8_lossy(&buffer[..header_end]);
    let mut lines = header_text.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "missing method".to_string())?
        .to_string();
    let path = request_parts
        .next()
        .ok_or_else(|| "missing path".to_string())?
        .split('?')
        .next()
        .unwrap_or("/")
        .to_string();
    let content_length = lines
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.eq_ignore_ascii_case("content-length"))
        .and_then(|(_, value)| value.trim().parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Ok(HttpRequest {
            method,
            path,
            body: b"{\"__tooLarge\":true}".to_vec(),
        });
    }

    let body_start = header_end + 4;
    let mut body = buffer[body_start..].to_vec();
    while body.len() < content_length {
        let count = stream
            .read(&mut temp)
            .map_err(|error| format!("failed to read request body: {error}"))?;
        if count == 0 {
            break;
        }
        body.extend_from_slice(&temp[..count]);
    }
    body.truncate(content_length);
    Ok(HttpRequest { method, path, body })
}

fn parse_json_body(body: &[u8]) -> Result<Value, (u16, Value)> {
    if body == b"{\"__tooLarge\":true}" {
        return Err((413, json!({ "error": "Request body too large" })));
    }
    if body.is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_slice::<Value>(body).map_err(|_| (400, json!({ "error": "Invalid JSON" })))
}

fn http_json(status: u16, value: Value) -> String {
    let payload = serde_json::to_string(&value).unwrap_or_else(|_| "{}".to_string());
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        404 => "Not Found",
        413 => "Payload Too Large",
        500 => "Internal Server Error",
        _ => "OK",
    };
    format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    )
}

fn host_warning(host: &str) -> Option<&'static str> {
    match host.trim().to_ascii_lowercase().as_str() {
        "" | "127.0.0.1" | "localhost" | "::1" | "[::1]" => None,
        _ => Some(
            "Warning: agent-guardrails serve is listening on non-loopback network interfaces. Only use this on trusted networks.",
        ),
    }
}

fn serve_message<'a>(locale: &str, key: &str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "started") => "Agent Guardrails 本地服务已启动：{url}",
        (true, "stop_hint") => "按 Ctrl+C 停止服务。",
        (_, "started") => "Agent Guardrails local server started: {url}",
        (_, "stop_hint") => "Press Ctrl+C to stop.",
        _ => "",
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}
