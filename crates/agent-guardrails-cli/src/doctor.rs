use crate::init::{find_template_root, resolve_target_dir};
use crate::repo::read_config;
use serde::Serialize;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const ENFORCE_MARKER: &str = "<!-- agent-guardrails-enforce:start -->";

pub fn run_doctor_cli(args: &[String]) -> i32 {
    match run_doctor(args) {
        Ok(ok) => {
            if ok {
                0
            } else {
                1
            }
        }
        Err(error) => {
            eprintln!("agent-guardrails doctor: {error}");
            1
        }
    }
}

#[derive(Default)]
struct DoctorArgs {
    target_dir: Option<String>,
    json: bool,
    locale: String,
}

#[derive(Clone, Serialize)]
struct DoctorCheck {
    key: String,
    passed: bool,
    detail: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctorResult {
    ok: bool,
    repo_root: String,
    checks: Vec<DoctorCheck>,
}

fn run_doctor(args: &[String]) -> Result<bool, String> {
    let args = parse_doctor_args(args)?;
    let repo_root = resolve_target_dir(args.target_dir.as_deref())?;
    let checks = run_doctor_checks(&repo_root);
    let ok = checks.iter().all(|check| check.passed);
    if args.json {
        println!(
            "{}",
            serde_json::to_string_pretty(&DoctorResult {
                ok,
                repo_root: repo_root.to_string_lossy().to_string(),
                checks,
            })
            .map_err(|error| format!("failed to serialize doctor result: {error}"))?
        );
    } else {
        print_text_result(&repo_root, &checks, &args.locale);
    }
    Ok(ok)
}

fn parse_doctor_args(args: &[String]) -> Result<DoctorArgs, String> {
    let mut parsed = DoctorArgs {
        locale: "en".to_string(),
        ..DoctorArgs::default()
    };
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--json" => {
                parsed.json = true;
                index += 1;
            }
            "--lang" => {
                parsed.locale = read_flag_value(args, index, "--lang")?;
                index += 2;
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

fn run_doctor_checks(repo_root: &Path) -> Vec<DoctorCheck> {
    vec![
        check_config(repo_root),
        check_git_hook(repo_root),
        check_agent_setup_files(repo_root),
        check_enforcement(repo_root),
        check_cli_binary(),
        check_runtime_selection(),
    ]
}

fn check_config(repo_root: &Path) -> DoctorCheck {
    match read_config(repo_root) {
        Ok(Some(_)) => DoctorCheck {
            key: "configExists".to_string(),
            passed: true,
            detail: ".agent-guardrails/config.json present.".to_string(),
        },
        Ok(None) => DoctorCheck {
            key: "configExists".to_string(),
            passed: false,
            detail: "Missing .agent-guardrails/config.json. Run `agent-guardrails setup --agent <name>` first.".to_string(),
        },
        Err(error) => DoctorCheck {
            key: "configExists".to_string(),
            passed: false,
            detail: error.to_string(),
        },
    }
}

fn check_git_hook(repo_root: &Path) -> DoctorCheck {
    let hook_path = repo_root.join(".git").join("hooks").join("pre-commit");
    if !hook_path.exists() {
        return DoctorCheck {
            key: "gitHook".to_string(),
            passed: false,
            detail:
                "No git pre-commit hook found. Run `agent-guardrails setup --agent <name>` to inject one."
                    .to_string(),
        };
    }
    let content = fs::read_to_string(&hook_path).unwrap_or_default();
    if !content.contains("agent-guardrails") {
        return DoctorCheck {
            key: "gitHook".to_string(),
            passed: false,
            detail: "Git pre-commit hook exists but does not reference agent-guardrails. Re-run setup to inject.".to_string(),
        };
    }
    DoctorCheck {
        key: "gitHook".to_string(),
        passed: true,
        detail: "Git pre-commit hook installed.".to_string(),
    }
}

fn check_agent_setup_files(repo_root: &Path) -> DoctorCheck {
    let mut present = Vec::new();
    let mut missing = Vec::new();
    for (agent, files) in agent_helper_files() {
        if files.iter().all(|file| repo_root.join(file).exists()) {
            present.push(agent);
        } else {
            missing.push(agent);
        }
    }
    if present.is_empty() {
        return DoctorCheck {
            key: "agentSetupFiles".to_string(),
            passed: false,
            detail: "No agent helper files found. Run `agent-guardrails setup --agent <name>` for at least one agent.".to_string(),
        };
    }
    let suffix = if missing.is_empty() {
        String::new()
    } else {
        format!(" ({} not set up)", missing.join(", "))
    };
    DoctorCheck {
        key: "agentSetupFiles".to_string(),
        passed: true,
        detail: format!(
            "Agent helper files present for: {}{}.",
            present.join(", "),
            suffix
        ),
    }
}

fn check_enforcement(repo_root: &Path) -> DoctorCheck {
    let mut enforced = Vec::new();
    for (agent, file) in enforced_instruction_files() {
        let path = repo_root.join(file);
        if path.exists()
            && fs::read_to_string(path)
                .unwrap_or_default()
                .contains(ENFORCE_MARKER)
        {
            enforced.push(agent);
        }
    }
    if enforced.is_empty() {
        return DoctorCheck {
            key: "enforced".to_string(),
            passed: false,
            detail: "No agents have enforced instructions. Run `agent-guardrails enforce --all` for strongest protection.".to_string(),
        };
    }
    DoctorCheck {
        key: "enforced".to_string(),
        passed: true,
        detail: format!("Enforced agents: {}.", enforced.join(", ")),
    }
}

fn check_cli_binary() -> DoctorCheck {
    let project_root = project_root();
    let binary_path = project_root.join("bin").join("agent-guardrails.js");
    let exists = binary_path.exists();
    DoctorCheck {
        key: "cliBinary".to_string(),
        passed: exists,
        detail: if exists {
            "CLI binary available.".to_string()
        } else {
            "CLI binary not found at expected location.".to_string()
        },
    }
}

fn check_runtime_selection() -> DoctorCheck {
    let requested = env::var("AGENT_GUARDRAILS_RUNTIME")
        .unwrap_or_else(|_| "auto".to_string())
        .to_ascii_lowercase();
    if !matches!(requested.as_str(), "auto" | "node" | "js" | "rust") {
        return DoctorCheck {
            key: "checkRuntime".to_string(),
            passed: false,
            detail: "AGENT_GUARDRAILS_RUNTIME must be one of: auto, node, rust.".to_string(),
        };
    }
    if requested == "rust" {
        return DoctorCheck {
            key: "checkRuntime".to_string(),
            passed: true,
            detail: "Check runtime: Rust (forced-rust).".to_string(),
        };
    }
    let project_root = project_root();
    let packaged = project_root
        .join("native")
        .join(format!("{}-{}", env::consts::OS, env::consts::ARCH))
        .join(if cfg!(windows) {
            "agent-guardrails-rs.exe"
        } else {
            "agent-guardrails-rs"
        });
    if requested == "auto" && packaged.exists() {
        return DoctorCheck {
            key: "checkRuntime".to_string(),
            passed: true,
            detail: "Check runtime: Rust (packaged-rust).".to_string(),
        };
    }
    DoctorCheck {
        key: "checkRuntime".to_string(),
        passed: true,
        detail: "Check runtime: Node (no-packaged-rust). Set AGENT_GUARDRAILS_RUNTIME=rust to force Rust, or ship native/* to enable Rust by default.".to_string(),
    }
}

fn print_text_result(_repo_root: &Path, checks: &[DoctorCheck], locale: &str) {
    let passed = checks.iter().filter(|check| check.passed).count();
    let total = checks.len();
    let all_passed = passed == total;
    println!("{}", doctor_message(locale, "title"));
    println!();
    println!(
        "{}",
        doctor_message(locale, "summary")
            .replace("{passed}", &passed.to_string())
            .replace("{total}", &total.to_string())
            .replace(
                "{status}",
                if all_passed {
                    doctor_message(locale, "all_passed")
                } else {
                    doctor_message(locale, "issues_found")
                },
            )
    );
    println!();
    for check in checks {
        let icon = if check.passed { "OK" } else { "!!" };
        println!("  {icon} {}", doctor_check_label(locale, &check.key));
        println!("     {}", check.detail);
    }
    if !all_passed {
        println!();
        println!("{}", doctor_message(locale, "fix_hint"));
    }
}

fn doctor_message<'a>(locale: &str, key: &str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "title") => "Agent Guardrails 安装诊断",
        (true, "summary") => "{passed}/{total} 项检查通过，{status}",
        (true, "all_passed") => "全部正常",
        (true, "issues_found") => "发现问题",
        (true, "fix_hint") => {
            "运行 `agent-guardrails setup --agent <name>` 修复缺失项，或运行 `agent-guardrails enforce --all` 启用更强保护。"
        }
        (_, "title") => "Agent Guardrails Doctor",
        (_, "summary") => "{passed}/{total} checks passed — {status}",
        (_, "all_passed") => "all passed",
        (_, "issues_found") => "issues found",
        (_, "fix_hint") => {
            "Run `agent-guardrails setup --agent <name>` to fix missing pieces, or `agent-guardrails enforce --all` for strongest protection."
        }
        _ => "",
    }
}

fn doctor_check_label<'a>(locale: &str, key: &'a str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "configExists") => "仓库配置",
        (true, "gitHook") => "Git pre-commit hook",
        (true, "agentSetupFiles") => "Agent 辅助文件",
        (true, "enforced") => "强制说明",
        (true, "cliBinary") => "CLI 可执行文件",
        (true, "checkRuntime") => "Check 运行时",
        (_, "configExists") => "Repo config",
        (_, "gitHook") => "Git pre-commit hook",
        (_, "agentSetupFiles") => "Agent helper files",
        (_, "enforced") => "Enforced instructions",
        (_, "cliBinary") => "CLI binary",
        (_, "checkRuntime") => "Check runtime",
        _ => key,
    }
}

fn agent_helper_files() -> Vec<(&'static str, Vec<&'static str>)> {
    vec![
        (
            "claude-code",
            vec![
                "CLAUDE.md",
                ".claude/settings.json",
                ".agent-guardrails/hooks/claude-code-pre-tool.cjs",
                ".agent-guardrails/hooks/claude-code-post-tool.cjs",
            ],
        ),
        ("codex", vec![".codex/instructions.md"]),
        ("cursor", vec![".cursor/rules/agent-guardrails.mdc"]),
        (
            "gemini",
            vec![
                "GEMINI.md",
                ".agent-guardrails/hooks/gemini-pre-tool.cjs",
                ".agent-guardrails/hooks/gemini-post-tool.cjs",
            ],
        ),
        (
            "opencode",
            vec!["AGENTS.md", ".opencode/plugins/guardrails.js"],
        ),
    ]
}

fn enforced_instruction_files() -> Vec<(&'static str, &'static str)> {
    vec![
        ("claude-code", "CLAUDE.md"),
        ("cursor", ".cursor/rules/agent-guardrails-enforce.mdc"),
        ("opencode", "AGENTS.md"),
        ("codex", ".codex/instructions.md"),
        ("gemini", "GEMINI.md"),
    ]
}

fn project_root() -> PathBuf {
    find_template_root()
        .ok()
        .and_then(|root| root.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| {
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .and_then(Path::parent)
                .map(Path::to_path_buf)
                .unwrap_or_else(|| PathBuf::from("."))
        })
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}
