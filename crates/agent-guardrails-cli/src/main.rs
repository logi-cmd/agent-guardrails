use std::env;
use std::process;

use agent_guardrails_cli::check::{
    CheckContextOptions, build_check_context, build_check_result_from_context, run_oss_detectors,
    run_semantic_plugins, try_enrich_check_result_with_pro,
};
use agent_guardrails_cli::daemon::{
    run_daemon_worker_cli, run_start_cli, run_status_cli, run_stop_cli,
};
use agent_guardrails_cli::doctor::run_doctor_cli;
use agent_guardrails_cli::enforce::{run_enforce_cli, run_unenforce_cli};
use agent_guardrails_cli::generate_agents::run_generate_agents_cli;
use agent_guardrails_cli::init::run_init_cli;
use agent_guardrails_cli::mcp::run_mcp_cli;
use agent_guardrails_cli::plan::run_plan_cli;
use agent_guardrails_cli::repo::read_config;
use agent_guardrails_cli::serve::run_serve_cli;
use agent_guardrails_cli::setup::run_setup_cli;

const VERSION: &str = env!("CARGO_PKG_VERSION");

const COMMANDS: &[(&str, &str)] = &[
    ("init", "Create a task contract and repo config"),
    ("setup", "Install agent integration files"),
    ("plan", "Generate a bounded task plan"),
    ("check", "Check the current diff against the task contract"),
    ("doctor", "Inspect repo guardrail setup"),
    ("enforce", "Enable local guardrail hooks"),
    ("unenforce", "Disable local guardrail hooks"),
    ("start", "Start the local background checker"),
    ("stop", "Stop the local background checker"),
    ("status", "Show local background checker status"),
    (
        "pro status",
        "Show optional Pro package install and license status",
    ),
    ("pro activate", "Activate an installed Pro package"),
    ("pro report", "Print the optional Pro go-live report"),
    (
        "pro workbench",
        "Open or run the local Pro operator workbench",
    ),
    ("pro cleanup", "Preview or apply Pro proof memory cleanup"),
    ("generate-agents", "Generate AGENTS.md for agent setup"),
    (
        "serve",
        "Start chat API server for desktop apps and chat tools",
    ),
    ("mcp", "Start the MCP server"),
];

fn main() {
    let code = run(env::args().skip(1).collect());
    if code != 0 {
        process::exit(code);
    }
}

fn run(args: Vec<String>) -> i32 {
    let first = args.first().map(String::as_str);

    if matches!(first, Some("--version" | "-v")) {
        println!("agent-guardrails v{VERSION}");
        return 0;
    }

    if first.is_none() || matches!(first, Some("help" | "--help" | "-h")) {
        print_help();
        return 0;
    }

    let command = first.expect("checked above");
    if command == "init" {
        return run_init_cli(&args[1..]);
    }

    if command == "plan" {
        return run_plan_cli(&args[1..]);
    }

    if command == "setup" {
        return run_setup_cli(&args[1..]);
    }

    if command == "doctor" {
        return run_doctor_cli(&args[1..]);
    }

    if command == "enforce" {
        return run_enforce_cli(&args[1..]);
    }

    if command == "unenforce" {
        return run_unenforce_cli(&args[1..]);
    }

    if command == "generate-agents" || command == "gen-agents" {
        return run_generate_agents_cli(&args[1..]);
    }

    if command == "mcp" {
        return run_mcp_cli(&args[1..]);
    }

    if command == "serve" {
        return run_serve_cli(&args[1..]);
    }

    if command == "start" {
        return run_start_cli(&args[1..]);
    }

    if command == "stop" {
        return run_stop_cli(&args[1..]);
    }

    if command == "status" {
        return run_status_cli(&args[1..]);
    }

    if command == "daemon-worker" {
        return run_daemon_worker_cli(&args[1..]);
    }

    if command == "check" {
        return run_check(&args[1..]);
    }

    eprintln!("agent-guardrails: Unknown command: {command}");
    1
}

fn run_check(args: &[String]) -> i32 {
    let check_args = match parse_check_args(args) {
        Ok(value) => value,
        Err(error) => {
            eprintln!("agent-guardrails check: {error}");
            return 1;
        }
    };
    let repo_root = match env::current_dir() {
        Ok(path) => path,
        Err(error) => {
            eprintln!("agent-guardrails check: failed to read current directory: {error}");
            return 1;
        }
    };
    match read_config(&repo_root) {
        Ok(Some(_)) => {}
        Ok(None) => {
            eprintln!("{}", message(&check_args.locale, "missing_config"));
            return 1;
        }
        Err(error) => {
            eprintln!("agent-guardrails check: {error}");
            return 1;
        }
    }
    let context = match build_check_context(&repo_root, check_args.options) {
        Ok(context) => context,
        Err(error) => {
            eprintln!("agent-guardrails check: {error}");
            return 1;
        }
    };
    let mut findings = run_oss_detectors(&context);
    let plugins = run_semantic_plugins(&context, &mut findings);
    let mut result = build_check_result_from_context(&context, findings);
    apply_plugin_metadata(&mut result, plugins);
    try_enrich_check_result_with_pro(&repo_root, &mut result);

    if check_args.json {
        match serde_json::to_string_pretty(&result) {
            Ok(json) => println!("{json}"),
            Err(error) => {
                eprintln!("agent-guardrails check: failed to serialize JSON result: {error}");
                return 1;
            }
        }
    } else {
        print_text_result(&result, &check_args.locale, check_args.review);
    }

    if result.ok { 0 } else { 1 }
}

fn apply_plugin_metadata(
    result: &mut agent_guardrails_cli::check::CheckResult,
    plugins: Vec<serde_json::Value>,
) {
    result.counts.loaded_plugins = plugins
        .iter()
        .filter(|plugin| plugin.get("status").and_then(serde_json::Value::as_str) == Some("loaded"))
        .count();
    result.counts.missing_plugins = plugins
        .iter()
        .filter(|plugin| {
            plugin.get("status").and_then(serde_json::Value::as_str) == Some("missing")
        })
        .count();
    result.plugins = plugins;
}

struct CheckArgs {
    json: bool,
    review: bool,
    locale: String,
    options: CheckContextOptions,
}

fn parse_check_args(args: &[String]) -> Result<CheckArgs, String> {
    let mut json = false;
    let mut review = false;
    let mut locale = "en".to_string();
    let mut options = CheckContextOptions::default();
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "--json" => {
                json = true;
                index += 1;
            }
            "--review" => {
                review = true;
                index += 1;
            }
            "--base-ref" => {
                options.base_ref = Some(read_flag_value(args, index, "--base-ref")?);
                index += 2;
            }
            "--contract-path" => {
                options.contract_path = Some(read_flag_value(args, index, "--contract-path")?);
                index += 2;
            }
            "--commands-run" => {
                let value = read_flag_value(args, index, "--commands-run")?;
                options.commands_run.extend(parse_comma_list(&value));
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

    Ok(CheckArgs {
        json,
        review,
        locale,
        options,
    })
}

fn print_text_result(
    result: &agent_guardrails_cli::check::CheckResult,
    locale: &str,
    include_review: bool,
) {
    let blocked = if result.ok {
        message(locale, "status_passed")
    } else {
        message(locale, "status_blocked")
    };
    println!("{}", message(locale, "title"));
    println!(
        "{}: {}/100 ({})",
        message(locale, "score"),
        format_score(result.score),
        result.score_verdict
    );
    println!(
        "{}: {} ({})",
        message(locale, "status"),
        result.verdict,
        blocked
    );
    println!(
        "{}: {}",
        message(locale, "changed_files"),
        result.counts.changed_files
    );
    println!("{}: {}", message(locale, "errors"), result.counts.failures);
    println!(
        "{}: {}",
        message(locale, "warnings"),
        result.counts.warnings
    );

    let actions = next_actions(result);
    if !actions.is_empty() {
        println!();
        println!("{}:", message(locale, "next_actions"));
        for (index, action) in actions.iter().take(3).enumerate() {
            println!("{}. {}", index + 1, action);
        }
    }

    if !result.findings.is_empty() {
        println!();
        println!("{}:", message(locale, "findings"));
        for finding in result.findings.iter().take(8) {
            let code = if finding.code.is_empty() {
                "finding"
            } else {
                &finding.code
            };
            println!("- [{}] {}: {}", finding.severity, code, finding.message);
            if let Some(action) = &finding.action {
                println!("  {}: {}", message(locale, "suggestion"), action);
            }
            if !finding.files.is_empty() {
                println!(
                    "  {}: {}",
                    message(locale, "files"),
                    finding
                        .files
                        .iter()
                        .take(5)
                        .cloned()
                        .collect::<Vec<_>>()
                        .join(", ")
                );
            }
        }
        if result.findings.len() > 8 {
            println!(
                "{}",
                message(locale, "more_findings")
                    .replace("{count}", &(result.findings.len() - 8).to_string())
            );
        }
    }

    if include_review {
        print_review_summary(result, locale);
    }

    println!();
    println!("{}:", message(locale, "finish"));
    println!("agent-guardrails check --review");
}

fn print_review_summary(result: &agent_guardrails_cli::check::CheckResult, locale: &str) {
    println!();
    println!("{}:", message(locale, "review_summary"));
    println!(
        "- {}: {}",
        message(locale, "scope_issues"),
        result.review.summary.scope_issues
    );
    println!(
        "- {}: {}",
        message(locale, "validation_issues"),
        result.review.summary.validation_issues
    );
    println!(
        "- {}: {}",
        message(locale, "consistency_concerns"),
        result.review.summary.consistency_concerns
    );
    println!(
        "- {}: {}",
        message(locale, "continuity_concerns"),
        result.review.summary.continuity_concerns
    );
    println!(
        "- {}: {}",
        message(locale, "performance_concerns"),
        result.review.summary.performance_concerns
    );
    println!(
        "- {}: {}",
        message(locale, "risk_concerns"),
        result.review.summary.risk_concerns
    );
}

fn next_actions(result: &agent_guardrails_cli::check::CheckResult) -> Vec<String> {
    let mut actions = Vec::new();
    for finding in &result.findings {
        if let Some(action) = &finding.action {
            if !actions.iter().any(|existing| existing == action) {
                actions.push(action.clone());
            }
        }
    }
    if !result.missing_required_commands.is_empty() {
        let commands = result.missing_required_commands.join(", ");
        actions.push(format!(
            "Run and record required command evidence: {commands}"
        ));
    }
    if !result.missing_evidence_paths.is_empty() {
        let paths = result.missing_evidence_paths.join(", ");
        actions.push(format!("Add the expected evidence file(s): {paths}"));
    }
    if actions.is_empty() {
        if result.ok {
            actions.push(
                "Keep the evidence with the PR and proceed with the normal review.".to_string(),
            );
        } else {
            actions.push("Fix the listed findings, then rerun agent-guardrails check.".to_string());
        }
    }
    if !actions
        .iter()
        .any(|action| action.contains("rerun agent-guardrails check"))
    {
        actions.push("Re-run agent-guardrails check after the update.".to_string());
    }
    actions
}

fn format_score(score: f64) -> String {
    if (score.fract()).abs() < f64::EPSILON {
        format!("{score:.0}")
    } else {
        format!("{score:.1}")
    }
}

fn message<'a>(locale: &str, key: &str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "title") => "Agent Guardrails 检查结果",
        (true, "score") => "评分",
        (true, "status") => "状态",
        (true, "status_passed") => "通过",
        (true, "status_blocked") => "需要处理",
        (true, "changed_files") => "变更文件",
        (true, "errors") => "错误",
        (true, "warnings") => "警告",
        (true, "next_actions") => "下一步",
        (true, "findings") => "问题",
        (true, "suggestion") => "建议",
        (true, "files") => "文件",
        (true, "review_summary") => "Review 摘要",
        (true, "scope_issues") => "范围问题",
        (true, "validation_issues") => "验证问题",
        (true, "consistency_concerns") => "一致性关注点",
        (true, "continuity_concerns") => "连续性关注点",
        (true, "performance_concerns") => "性能关注点",
        (true, "risk_concerns") => "风险关注点",
        (true, "finish") => "收尾命令",
        (true, "more_findings") => "还有 {count} 个问题未展开。请使用 --json 查看完整结果。",
        (true, "missing_config") => {
            "agent-guardrails check: 缺少 .agent-guardrails/config.json。请先运行 init。"
        }
        (_, "title") => "Agent Guardrails check result",
        (_, "score") => "Score",
        (_, "status") => "Status",
        (_, "status_passed") => "passed",
        (_, "status_blocked") => "needs attention",
        (_, "changed_files") => "Changed files",
        (_, "errors") => "Errors",
        (_, "warnings") => "Warnings",
        (_, "next_actions") => "Next actions",
        (_, "findings") => "Findings",
        (_, "suggestion") => "Action",
        (_, "files") => "Files",
        (_, "review_summary") => "Review summary",
        (_, "scope_issues") => "Scope issues",
        (_, "validation_issues") => "Validation issues",
        (_, "consistency_concerns") => "Consistency concerns",
        (_, "continuity_concerns") => "Continuity concerns",
        (_, "performance_concerns") => "Performance concerns",
        (_, "risk_concerns") => "Risk concerns",
        (_, "finish") => "Finish",
        (_, "more_findings") => "There are {count} more findings. Use --json for the full result.",
        (_, "missing_config") => {
            "agent-guardrails check: Missing .agent-guardrails/config.json. Run init first."
        }
        _ => "",
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn parse_comma_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn print_help() {
    println!("agent-guardrails\n");
    println!("Usage:");
    println!(
        "  agent-guardrails init [targetDir] [--preset <name>] [--adapter <name[,name]>] [--lang <locale>] [--force]"
    );
    println!(
        "  agent-guardrails setup [targetDir] --agent <name> [--preset <name>] [--lang <locale>] [--json] [--write-repo-config]"
    );
    println!(
        "  agent-guardrails plan --task \"<task description>\" [--intended-files \"src/service.js,tests/service.test.js\"] [--required-commands \"npm test\"]"
    );
    println!("  agent-guardrails doctor [targetDir] [--json] [--lang <locale>]");
    println!(
        "  agent-guardrails check [--contract-path <path>] [--base-ref <ref>] [--commands-run \"npm test\"] [--review] [--lang <locale>] [--json]"
    );
    println!("  agent-guardrails enforce [--agent <name>] [--all] [--lang <locale>] [--json]");
    println!("  agent-guardrails unenforce [--agent <name>] [--all] [--lang <locale>] [--json]");
    println!("  agent-guardrails pro status [--json]");
    println!(
        "  agent-guardrails pro activate <license-key> [--instance-name <name>] [--instance-id <id>] [--json]"
    );
    println!("  agent-guardrails pro report [--json]");
    println!("  agent-guardrails pro workbench [--open] [--live] [--json]");
    println!("  agent-guardrails pro cleanup [--apply] [--json]");
    println!("  agent-guardrails generate-agents [targetDir] [--preset <name>] [--lang <locale>]");
    println!("  agent-guardrails serve [--port <port>] [--host <host>] [--lang <locale>]");
    println!("  agent-guardrails mcp");
    println!("  agent-guardrails --version\n");
    println!("Commands:");
    for (name, summary) in COMMANDS {
        println!("  {name:<16} {summary}");
    }
    println!("\nSupported locales:");
    println!("  en, zh-CN");
}
