use crate::init::{find_template_root, load_template, relative_display, resolve_target_dir};
use std::fs;
use std::path::{Path, PathBuf};

const ARCHITECTURE_TEMPLATE: &str = r#"# Architecture

## System Overview

Describe what this project does and where the main entry points live.

## Module Boundaries

List the main modules, packages, or services and what each one owns.

## Data Flow

Describe the important request, event, or job flows through the system.

## Decisions

Record architecture decisions that future maintainers should preserve.
"#;

const TESTING_TEMPLATE: &str = r#"# Testing

## Test Strategy

Describe the test layers this project relies on.

## Required Commands

```bash
npm test
```

## Notes For Agents

- Add or update tests when behavior changes.
- Record any intentionally skipped validation in the task evidence.
- Keep test fixtures small and close to the behavior they cover.
"#;

#[derive(Default)]
struct GenerateAgentsArgs {
    target_dir: Option<String>,
    preset: String,
    locale: String,
}

struct GenerateAgentsResult {
    ok: bool,
    reason: Option<String>,
    path: Option<PathBuf>,
    files: Vec<PathBuf>,
}

pub fn run_generate_agents_cli(args: &[String]) -> i32 {
    match run_generate_agents(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails generate-agents: {error}");
            1
        }
    }
}

fn run_generate_agents(args: &[String]) -> Result<(), String> {
    let args = parse_args(args)?;
    let repo_root = resolve_target_dir(args.target_dir.as_deref())?;
    let result = generate_agents_md(&repo_root, &args.locale)?;
    print_summary(&repo_root, &args, &result);
    Ok(())
}

fn parse_args(args: &[String]) -> Result<GenerateAgentsArgs, String> {
    let mut parsed = GenerateAgentsArgs {
        preset: "node-service".to_string(),
        locale: "en".to_string(),
        ..GenerateAgentsArgs::default()
    };
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--preset" => {
                parsed.preset = read_flag_value(args, index, "--preset")?;
                index += 2;
            }
            "--lang" => {
                parsed.locale = read_flag_value(args, index, "--lang")?;
                index += 2;
            }
            value if value.starts_with('-') => return Err(format!("unknown option: {value}")),
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

fn generate_agents_md(repo_root: &Path, locale: &str) -> Result<GenerateAgentsResult, String> {
    let agents_path = repo_root.join("AGENTS.md");
    if agents_path.exists() {
        return Ok(GenerateAgentsResult {
            ok: false,
            reason: Some("AGENTS.md already exists".to_string()),
            path: Some(agents_path),
            files: Vec::new(),
        });
    }

    let template_root = find_template_root()?;
    let agents_template = load_template(&template_root, "base/AGENTS.md", Some(locale))?;
    let docs_dir = repo_root.join("docs");
    fs::create_dir_all(&docs_dir)
        .map_err(|error| format!("failed to create {}: {error}", docs_dir.display()))?;

    write_file(&agents_path, &agents_template)?;
    let architecture_path = docs_dir.join("ARCHITECTURE.md");
    let testing_path = docs_dir.join("TESTING.md");
    if !architecture_path.exists() {
        write_file(&architecture_path, ARCHITECTURE_TEMPLATE)?;
    }
    if !testing_path.exists() {
        write_file(&testing_path, TESTING_TEMPLATE)?;
    }

    Ok(GenerateAgentsResult {
        ok: true,
        reason: None,
        path: None,
        files: vec![agents_path, architecture_path, testing_path],
    })
}

fn write_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    let content = if content.ends_with('\n') {
        content.to_string()
    } else {
        format!("{content}\n")
    };
    fs::write(path, content).map_err(|error| format!("failed to write {}: {error}", path.display()))
}

fn print_summary(repo_root: &Path, args: &GenerateAgentsArgs, result: &GenerateAgentsResult) {
    println!("{}", message(&args.locale, "generating"));
    if result.ok {
        println!("{}", message(&args.locale, "generated"));
        println!("{}", message(&args.locale, "files"));
        for file in &result.files {
            println!("  - {}", relative_display(repo_root, file));
        }
        println!("{}", message(&args.locale, "next"));
        println!("  1. {}", message(&args.locale, "next1"));
        println!("  2. {}", message(&args.locale, "next2"));
        println!("  3. {}", message(&args.locale, "next3"));
        println!("  4. {}", message(&args.locale, "next4"));
    } else {
        println!(
            "{}",
            message(&args.locale, "failed").replace(
                "{reason}",
                result.reason.as_deref().unwrap_or("generation failed")
            )
        );
        if let Some(path) = &result.path {
            println!("   Path: {}", path.display());
        }
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn message<'a>(locale: &str, key: &str) -> &'a str {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    match (zh, key) {
        (true, "generating") => "Generating AGENTS.md...",
        (true, "generated") => "AGENTS.md generated.",
        (true, "files") => "Files created:",
        (true, "next") => "Next steps:",
        (true, "next1") => "Review AGENTS.md and adjust it for this project.",
        (true, "next2") => "Update docs/ARCHITECTURE.md with the real architecture.",
        (true, "next3") => "Update docs/TESTING.md with the real test strategy.",
        (true, "next4") => "Point your AI agent at AGENTS.md.",
        (true, "failed") => "AGENTS.md generation failed: {reason}",
        (_, "generating") => "Generating AGENTS.md...",
        (_, "generated") => "AGENTS.md generated.",
        (_, "files") => "Files created:",
        (_, "next") => "Next steps:",
        (_, "next1") => "Review AGENTS.md and adjust it for this project.",
        (_, "next2") => "Update docs/ARCHITECTURE.md with the real architecture.",
        (_, "next3") => "Update docs/TESTING.md with the real test strategy.",
        (_, "next4") => "Point your AI agent at AGENTS.md.",
        (_, "failed") => "AGENTS.md generation failed: {reason}",
        _ => "",
    }
}
