use serde_json::Value;
use std::fs;
use std::path::PathBuf;

const DEFAULT_PANEL_PATH: &str = ".agent-guardrails/pro/operator-workbench-panel.json";

pub fn run_workbench_panel_cli(args: &[String]) -> i32 {
    let options = match parse_args(args) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("agent-guardrails workbench-panel: {error}");
            return 1;
        }
    };

    let panel = match read_panel(&options.file) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("agent-guardrails workbench-panel: {error}");
            return 1;
        }
    };

    if options.json {
        match serde_json::to_string_pretty(&panel) {
            Ok(json) => println!("{json}"),
            Err(error) => {
                eprintln!(
                    "agent-guardrails workbench-panel: failed to serialize panel JSON: {error}"
                );
                return 1;
            }
        }
        return 0;
    }

    println!("{}", render_workbench_panel_text(&panel));
    0
}

struct PanelOptions {
    file: PathBuf,
    json: bool,
}

fn parse_args(args: &[String]) -> Result<PanelOptions, String> {
    let mut file = PathBuf::from(DEFAULT_PANEL_PATH);
    let mut json = false;
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "--file" | "--from" => {
                let value = args
                    .get(index + 1)
                    .filter(|item| !item.starts_with('-'))
                    .ok_or_else(|| format!("missing value for {}", args[index]))?;
                file = PathBuf::from(value);
                index += 2;
            }
            "--json" => {
                json = true;
                index += 1;
            }
            "--help" | "-h" => {
                return Err(
                    "usage: agent-guardrails workbench-panel [--file <operator-workbench-panel.json>] [--json]"
                        .to_string(),
                );
            }
            value if value.starts_with('-') => return Err(format!("unknown option: {value}")),
            value => return Err(format!("unexpected argument: {value}")),
        }
    }

    Ok(PanelOptions { file, json })
}

fn read_panel(file: &PathBuf) -> Result<Value, String> {
    let raw = fs::read_to_string(file)
        .map_err(|error| format!("failed to read {}: {error}", file.display()))?;
    let value: Value = serde_json::from_str(raw.trim_start_matches('\u{feff}'))
        .map_err(|error| format!("failed to parse {} as JSON: {error}", file.display()))?;
    let format = value
        .get("format")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if format != "agent-guardrails-workbench-panel.v1" {
        return Err(format!(
            "unsupported panel format {format:?}; expected agent-guardrails-workbench-panel.v1"
        ));
    }
    Ok(value)
}

pub fn render_workbench_panel_text(panel: &Value) -> String {
    let header_model = panel.get("header").unwrap_or(&Value::Null);
    let trust = panel.get("trust").unwrap_or(&Value::Null);
    let hero = panel
        .get("hero")
        .or_else(|| panel.get("decision"))
        .unwrap_or(&Value::Null);
    let next_step = panel.get("nextStep").unwrap_or(&Value::Null);
    let handoff = panel
        .get("handoff")
        .or_else(|| panel.get("agentHandoff"))
        .unwrap_or(&Value::Null);
    let header = join_parts(&[
        string_field(header_model, "title")
            .or_else(|| string_field(hero, "title"))
            .or_else(|| Some("Agent Guardrails Workbench".to_string())),
        string_field(hero, "state")
            .or_else(|| string_field(header_model, "status"))
            .map(|value| value.to_uppercase()),
        string_field(hero, "riskLabel").or_else(|| string_field(header_model, "severity")),
    ]);
    let mut lines = vec![
        header.clone(),
        "=".repeat(header.len().clamp(32, 72)),
        format!(
            "{}{}",
            string_field(hero, "question").unwrap_or_else(|| "Can I ship this change?".to_string()),
            string_field(hero, "answer")
                .map(|answer| format!(" -> {answer}"))
                .unwrap_or_default()
        ),
    ];

    if let Some(reason) = string_field(hero, "reason").and_then(|value| first_sentence(&value)) {
        lines.push(format!("Reason: {reason}"));
    }
    if let Some(score) = hero
        .get("trustScore")
        .and_then(Value::as_i64)
        .or_else(|| trust.get("score").and_then(Value::as_i64))
    {
        lines.push(format!("Trust score: {score}"));
    }
    if let Some(status) = render_status_strip(panel.get("statusStrip").and_then(Value::as_array)) {
        lines.push(format!("Status: {status}"));
    }

    lines.extend([
        "".to_string(),
        "Next step".to_string(),
        "---------".to_string(),
    ]);
    push_labeled(
        &mut lines,
        "Action",
        string_field(next_step, "label").or_else(|| string_field(next_step, "title")),
    );
    push_labeled(
        &mut lines,
        "Why",
        string_field(next_step, "summary")
            .or_else(|| string_field(next_step, "body"))
            .and_then(|value| first_sentence(&value)),
    );
    if let Some(command) = string_field(next_step, "command") {
        lines.push(format!("$ {command}"));
    }
    push_labeled(
        &mut lines,
        "Then rerun",
        string_field(next_step, "rerunCommand"),
    );
    push_labeled(
        &mut lines,
        "Evidence tool",
        string_field(next_step, "evidenceTool"),
    );

    lines.extend([
        "".to_string(),
        "Agent handoff".to_string(),
        "-------------".to_string(),
    ]);
    push_labeled(
        &mut lines,
        "Action",
        string_field(handoff, "label")
            .or_else(|| string_field(handoff, "title"))
            .or_else(|| string_field(handoff, "copyLabel")),
    );
    push_labeled(
        &mut lines,
        "Human role",
        string_field(handoff, "humanRole")
            .or_else(|| string_field(handoff, "summary"))
            .and_then(|value| first_sentence(&value)),
    );
    if let Some(checks) =
        render_string_array(handoff.get("humanChecks").and_then(Value::as_array), 2)
    {
        lines.push(format!("Check: {checks}"));
    }
    if let Some(stop) =
        render_string_array(handoff.get("stopConditions").and_then(Value::as_array), 2)
    {
        lines.push(format!("Stop if: {stop}"));
    }

    lines.extend([
        "".to_string(),
        "Sections".to_string(),
        "--------".to_string(),
    ]);
    for section in panel
        .get("sections")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .take(4)
    {
        let parts = join_parts(&[
            string_field(section, "status")
                .or_else(|| string_field(section, "state"))
                .map(|status| format!("[{status}]")),
            string_field(section, "title"),
            string_field(section, "summary").and_then(|value| first_sentence(&value)),
        ]);
        if !parts.is_empty() {
            lines.push(format!("- {parts}"));
        }
    }

    lines
        .into_iter()
        .filter(|line| !line.trim().is_empty() || line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn push_labeled(lines: &mut Vec<String>, label: &str, value: Option<String>) {
    if let Some(value) = value {
        lines.push(format!("{label}: {value}"));
    }
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
}

fn first_sentence(value: &str) -> Option<String> {
    let text = value.trim();
    if text.is_empty() {
        return None;
    }
    let mut split_at = text.len();
    for marker in ['.', '!', '?'] {
        if let Some(index) = text.find(marker) {
            split_at = split_at.min(index + marker.len_utf8());
        }
    }
    let sentence = text[..split_at].trim();
    let char_count = sentence.chars().count();
    if char_count > 180 {
        Some(format!(
            "{}...",
            sentence.chars().take(177).collect::<String>()
        ))
    } else {
        Some(sentence.to_string())
    }
}

fn join_parts(parts: &[Option<String>]) -> String {
    parts
        .iter()
        .filter_map(|part| part.as_deref())
        .filter(|part| !part.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" | ")
}

fn render_string_array(values: Option<&Vec<Value>>, limit: usize) -> Option<String> {
    let text = values?
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .take(limit)
        .collect::<Vec<_>>()
        .join(" | ");
    if text.is_empty() { None } else { Some(text) }
}

fn render_status_strip(values: Option<&Vec<Value>>) -> Option<String> {
    let rendered = values?
        .iter()
        .take(4)
        .filter_map(|card| {
            let label = string_field(card, "label")?;
            let value = string_field(card, "value").unwrap_or_default();
            let state = string_field(card, "state")
                .map(|state| format!("/{state}"))
                .unwrap_or_default();
            let progress = card
                .get("progress")
                .and_then(Value::as_i64)
                .map(|value| format!(" {value}%"))
                .unwrap_or_default();
            Some(
                format!("{label}: {value}{state}{progress}")
                    .trim()
                    .to_string(),
            )
        })
        .collect::<Vec<_>>()
        .join("  |  ");
    if rendered.is_empty() {
        None
    } else {
        Some(rendered)
    }
}
