use serde_json::Value;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::{fs, process};

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
            "agent-guardrails-rs-serve-{name}-{}-{unique}",
            process::id()
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

struct RunningServer {
    child: Child,
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn rust_serve_rejects_invalid_port() {
    let output = cli()
        .arg("serve")
        .arg("--port")
        .arg("0")
        .output()
        .expect("serve");

    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("invalid port"));
}

#[test]
fn rust_serve_health_endpoint_returns_preview_status() {
    let repo = TempDir::new("health");
    let port = free_port();
    let _server = start_server(&repo, port);

    let response = wait_for_http(port, "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    let body = response_body(&response);
    let value: Value = serde_json::from_str(body).expect("health json");
    assert_eq!(value["status"], "ok");
    assert_eq!(value["rustPreview"], true);
    assert_eq!(value["endpoints"]["chat"], "/api/chat");
    assert_eq!(value["endpoints"]["health"], "/api/health");
    assert_eq!(value["endpoints"]["tools"], "/api/tools/:name");
    assert_eq!(value["endpoints"]["explain"], "/api/explain");
    assert_eq!(value["endpoints"]["archaeology"], "/api/archaeology");
}

#[test]
fn rust_serve_tool_endpoint_routes_to_mcp_tools() {
    let repo = TempDir::new("tool-route");
    let port = free_port();
    let _server = start_server(&repo, port);

    let body = r#"{"task":"add login safely"}"#;
    let request = format!(
        "POST /api/tools/plan_rough_intent HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let response = wait_for_http(port, &request);
    assert!(response.starts_with("HTTP/1.1 200"));
    let value: Value = serde_json::from_str(response_body(&response)).expect("tool json");
    assert_eq!(value["tool"], "plan_rough_intent");
    assert_eq!(value["rustPreview"], true);
    assert_eq!(value["rawResult"]["status"], "suggestion");
}

#[test]
fn rust_serve_chat_routes_plain_language_to_tools() {
    let repo = TempDir::new("chat-route");
    let port = free_port();
    let _server = start_server(&repo, port);

    let body = r#"{"message":"plan add login","locale":"en"}"#;
    let request = format!(
        "POST /api/chat HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let response = wait_for_http(port, &request);
    assert!(response.starts_with("HTTP/1.1 200"));
    let value: Value = serde_json::from_str(response_body(&response)).expect("chat json");
    assert_eq!(value["tool"], "plan_rough_intent");
    assert_eq!(value["rustPreview"], true);
    assert!(value["sessionId"].as_str().is_some());
}

#[test]
fn rust_serve_explain_and_archaeology_aliases_route_to_mcp_tools() {
    let repo = TempDir::new("aliases");
    let port = free_port();
    let _server = start_server(&repo, port);

    let body = "{}";
    let explain = format!(
        "POST /api/explain HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let explain_response = wait_for_http(port, &explain);
    assert!(explain_response.starts_with("HTTP/1.1 200"));
    let explain_value: Value =
        serde_json::from_str(response_body(&explain_response)).expect("explain json");
    assert_eq!(explain_value["tool"], "explain_change");

    let archaeology = format!(
        "POST /api/archaeology HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
        body.len(),
        body
    );
    let archaeology_response = wait_for_http(port, &archaeology);
    assert!(archaeology_response.starts_with("HTTP/1.1 200"));
    let archaeology_value: Value =
        serde_json::from_str(response_body(&archaeology_response)).expect("archaeology json");
    assert_eq!(archaeology_value["tool"], "query_archaeology");
}

fn start_server(repo: &TempDir, port: u16) -> RunningServer {
    let child = cli()
        .arg("serve")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .current_dir(&repo.path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("start server");
    RunningServer { child }
}

fn wait_for_http(port: u16, request: &str) -> String {
    let deadline = SystemTime::now() + Duration::from_secs(5);
    loop {
        if let Ok(response) = http_request(port, request) {
            return response;
        }
        assert!(SystemTime::now() < deadline, "server did not become ready");
        thread::sleep(Duration::from_millis(50));
    }
}

fn http_request(port: u16, request: &str) -> Result<String, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    stream
        .shutdown(std::net::Shutdown::Write)
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|error| error.to_string())?;
    Ok(response)
}

fn response_body(response: &str) -> &str {
    response.split("\r\n\r\n").nth(1).unwrap_or("")
}

fn free_port() -> u16 {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind free port");
    listener.local_addr().expect("addr").port()
}
