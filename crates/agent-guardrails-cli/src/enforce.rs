use crate::init::{find_template_root, load_template, relative_display};
use serde::Serialize;
use std::env;
use std::fs;
use std::path::Path;

const ENFORCE_MARKER_START: &str = "<!-- agent-guardrails-enforce:start -->";
const ENFORCE_MARKER_END: &str = "<!-- agent-guardrails-enforce:end -->";

const AGENT_INSTRUCTION_FILES: &[AgentInstructionFile] = &[
    AgentInstructionFile {
        id: "claude-code",
        path: "CLAUDE.md",
        template: "enforce/claude-code.md",
    },
    AgentInstructionFile {
        id: "cursor",
        path: ".cursor/rules/agent-guardrails-enforce.mdc",
        template: "enforce/cursor.mdc",
    },
    AgentInstructionFile {
        id: "opencode",
        path: "AGENTS.md",
        template: "enforce/opencode.md",
    },
    AgentInstructionFile {
        id: "codex",
        path: ".codex/instructions.md",
        template: "enforce/codex.md",
    },
    AgentInstructionFile {
        id: "gemini",
        path: "GEMINI.md",
        template: "enforce/gemini.md",
    },
];

#[derive(Clone, Copy)]
struct AgentInstructionFile {
    id: &'static str,
    path: &'static str,
    template: &'static str,
}

#[derive(Default)]
struct EnforceArgs {
    agent: Option<String>,
    all: bool,
    json: bool,
    locale: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EnforceResult {
    ok: bool,
    repo_root: String,
    written: Vec<String>,
    skipped: Vec<String>,
    agents: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UnenforceResult {
    ok: bool,
    repo_root: String,
    removed: Vec<RemovalResult>,
    skipped: Vec<SkipResult>,
}

#[derive(Serialize)]
struct RemovalResult {
    path: String,
    action: String,
}

#[derive(Serialize)]
struct SkipResult {
    path: String,
    reason: String,
}

pub fn run_enforce_cli(args: &[String]) -> i32 {
    match run_enforce(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails enforce: {error}");
            1
        }
    }
}

pub fn run_unenforce_cli(args: &[String]) -> i32 {
    match run_unenforce(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails unenforce: {error}");
            1
        }
    }
}

fn run_enforce(args: &[String]) -> Result<(), String> {
    let args = parse_args(args)?;
    let repo_root =
        env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?;
    let targets = select_targets(&args)?;
    let template_root = find_template_root()?;
    let mut written = Vec::new();
    let mut skipped = Vec::new();

    for target in &targets {
        let path = repo_root.join(target.path);
        if is_enforced_file(&path) {
            skipped.push(target.path.to_string());
            continue;
        }

        let template = load_template(&template_root, target.template, None)?;
        let block = format!("{ENFORCE_MARKER_START}\n{template}\n{ENFORCE_MARKER_END}\n");

        if path.exists() {
            let existing = fs::read_to_string(&path).unwrap_or_default();
            write_file(&path, &format!("{}\n\n{}", existing.trim_end(), block))?;
        } else {
            write_file(&path, &block)?;
        }
        written.push(target.path.to_string());
    }

    let result = EnforceResult {
        ok: true,
        repo_root: repo_root.to_string_lossy().to_string(),
        written,
        skipped,
        agents: targets.iter().map(|target| target.id.to_string()).collect(),
    };

    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&result)
                .map_err(|error| format!("failed to serialize enforce result: {error}"))?
        );
    } else {
        print_enforce_summary(&repo_root, &result, &args.locale);
    }

    Ok(())
}

fn run_unenforce(args: &[String]) -> Result<(), String> {
    let args = parse_args(args)?;
    let repo_root =
        env::current_dir().map_err(|error| format!("failed to read current directory: {error}"))?;
    let targets = select_targets(&args)?;
    let mut removed = Vec::new();
    let mut skipped = Vec::new();

    for target in &targets {
        let path = repo_root.join(target.path);
        if !path.exists() {
            skipped.push(SkipResult {
                path: target.path.to_string(),
                reason: "not-found".to_string(),
            });
            continue;
        }
        if !is_enforced_file(&path) {
            skipped.push(SkipResult {
                path: target.path.to_string(),
                reason: "not-enforced".to_string(),
            });
            continue;
        }

        let content = fs::read_to_string(&path)
            .map_err(|error| format!("failed to read {}: {error}", path.display()))?;
        let Some(start) = content.find(ENFORCE_MARKER_START) else {
            fs::remove_file(&path)
                .map_err(|error| format!("failed to delete {}: {error}", path.display()))?;
            removed.push(RemovalResult {
                path: target.path.to_string(),
                action: "deleted".to_string(),
            });
            continue;
        };
        let Some(end) = content.rfind(ENFORCE_MARKER_END) else {
            fs::remove_file(&path)
                .map_err(|error| format!("failed to delete {}: {error}", path.display()))?;
            removed.push(RemovalResult {
                path: target.path.to_string(),
                action: "deleted".to_string(),
            });
            continue;
        };
        if end <= start {
            fs::remove_file(&path)
                .map_err(|error| format!("failed to delete {}: {error}", path.display()))?;
            removed.push(RemovalResult {
                path: target.path.to_string(),
                action: "deleted".to_string(),
            });
            continue;
        }

        let before = content[..start].trim_end();
        let after = content[end + ENFORCE_MARKER_END.len()..].trim_start();
        let remaining = [before, after]
            .into_iter()
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>()
            .join("\n\n");
        if remaining.trim().is_empty() {
            fs::remove_file(&path)
                .map_err(|error| format!("failed to delete {}: {error}", path.display()))?;
            removed.push(RemovalResult {
                path: target.path.to_string(),
                action: "deleted".to_string(),
            });
        } else {
            write_file(&path, &format!("{remaining}\n"))?;
            removed.push(RemovalResult {
                path: target.path.to_string(),
                action: "stripped".to_string(),
            });
        }
    }

    let result = UnenforceResult {
        ok: true,
        repo_root: repo_root.to_string_lossy().to_string(),
        removed,
        skipped,
    };

    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&result)
                .map_err(|error| format!("failed to serialize unenforce result: {error}"))?
        );
    } else {
        print_unenforce_summary(&repo_root, &result, &args.locale);
    }

    Ok(())
}

fn parse_args(args: &[String]) -> Result<EnforceArgs, String> {
    let mut parsed = EnforceArgs {
        locale: "en".to_string(),
        ..EnforceArgs::default()
    };
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--agent" => {
                parsed.agent = Some(read_flag_value(args, index, "--agent")?.to_ascii_lowercase());
                index += 2;
            }
            "--all" => {
                parsed.all = true;
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
            value if value.starts_with('-') => return Err(format!("unknown option: {value}")),
            value => return Err(format!("unexpected argument: {value}")),
        }
    }
    Ok(parsed)
}

fn select_targets(args: &EnforceArgs) -> Result<Vec<AgentInstructionFile>, String> {
    if args.all || args.agent.is_none() {
        return Ok(AGENT_INSTRUCTION_FILES.to_vec());
    }
    let agent = args.agent.as_deref().expect("agent checked");
    AGENT_INSTRUCTION_FILES
        .iter()
        .find(|target| target.id == agent)
        .copied()
        .map(|target| vec![target])
        .ok_or_else(|| {
            format!(
                "unknown agent: {agent}. Supported agents: {}",
                AGENT_INSTRUCTION_FILES
                    .iter()
                    .map(|target| target.id)
                    .collect::<Vec<_>>()
                    .join(", ")
            )
        })
}

fn is_enforced_file(path: &Path) -> bool {
    fs::read_to_string(path)
        .map(|content| content.contains(ENFORCE_MARKER_START))
        .unwrap_or(false)
}

fn write_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::write(path, content).map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn print_enforce_summary(repo_root: &Path, result: &EnforceResult, locale: &str) {
    println!("{}", message(locale, "enforce_title"));
    println!();
    println!("{}: {}", message(locale, "repo_root"), result.repo_root);
    if !result.written.is_empty() {
        println!();
        println!("{}", message(locale, "written"));
        for path in &result.written {
            println!("  - {}", relative_display(repo_root, &repo_root.join(path)));
        }
    }
    if !result.skipped.is_empty() {
        println!();
        println!("{}", message(locale, "skipped"));
        for path in &result.skipped {
            println!("  - {}", relative_display(repo_root, &repo_root.join(path)));
        }
    }
    println!();
    println!("{}", message(locale, "enforce_next"));
    println!("{}", message(locale, "unenforce_hint"));
}

fn print_unenforce_summary(repo_root: &Path, result: &UnenforceResult, locale: &str) {
    println!("{}", message(locale, "unenforce_title"));
    println!();
    println!("{}: {}", message(locale, "repo_root"), result.repo_root);
    if !result.removed.is_empty() {
        println!();
        println!("{}", message(locale, "removed"));
        for item in &result.removed {
            println!(
                "  - {} ({})",
                relative_display(repo_root, &repo_root.join(&item.path)),
                item.action
            );
        }
    }
    if !result.skipped.is_empty() {
        println!();
        println!("{}", message(locale, "skipped"));
        for item in &result.skipped {
            println!(
                "  - {} ({})",
                relative_display(repo_root, &repo_root.join(&item.path)),
                item.reason
            );
        }
    }
}

fn message<'a>(locale: &str, key: &str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "enforce_title") => "Agent Guardrails 强制说明",
        (true, "unenforce_title") => "Agent Guardrails 移除强制说明",
        (true, "repo_root") => "仓库",
        (true, "written") => "已写入强制说明：",
        (true, "removed") => "已移除强制说明：",
        (true, "skipped") => "已跳过：",
        (true, "enforce_next") => "这些文件会被 agent 自动读取。",
        (true, "unenforce_hint") => "如需移除：agent-guardrails unenforce --all",
        (_, "enforce_title") => "Agent Guardrails Enforce",
        (_, "unenforce_title") => "Agent Guardrails Unenforce",
        (_, "repo_root") => "Repo root",
        (_, "written") => "Enforced instructions written to:",
        (_, "removed") => "Removed enforced instructions from:",
        (_, "skipped") => "Skipped:",
        (_, "enforce_next") => {
            "These files are auto-read by the agent. The guardrail check is now enforced at the system level."
        }
        (_, "unenforce_hint") => "To remove: agent-guardrails unenforce --all",
        _ => "",
    }
}
