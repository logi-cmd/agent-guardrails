use serde_json::Value;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) const SUPPORTED_PRESETS: &[&str] = &[
    "node-service",
    "nextjs",
    "python-fastapi",
    "monorepo",
    "static-frontend",
    "generic",
];

pub(crate) const SUPPORTED_ADAPTERS: &[&str] =
    &["claude-code", "codex", "cursor", "gemini", "opencode"];

#[derive(Default)]
struct InitArgs {
    target_dir: Option<String>,
    preset: String,
    adapters: Vec<String>,
    locale: String,
    force: bool,
}

pub(crate) struct InitOptions {
    pub(crate) target_dir: PathBuf,
    pub(crate) preset: String,
    pub(crate) adapters: Vec<String>,
    pub(crate) locale: String,
    pub(crate) force: bool,
    pub(crate) silent: bool,
}

#[allow(dead_code)]
pub(crate) struct InitResult {
    pub(crate) target_dir: PathBuf,
    pub(crate) preset: String,
    pub(crate) adapters: Vec<String>,
    pub(crate) created: Vec<PathBuf>,
    pub(crate) appended: Vec<PathBuf>,
    pub(crate) skipped: Vec<PathBuf>,
    pub(crate) existing_ci: bool,
    pub(crate) hook_injected: bool,
    pub(crate) locale: String,
}

struct WriteEntry {
    kind: WriteKind,
    path: PathBuf,
    content: String,
    marker: Option<&'static str>,
}

#[derive(Clone, Copy)]
enum WriteKind {
    Create,
    Force,
    Append,
}

struct WriteResult {
    created: Vec<PathBuf>,
    appended: Vec<PathBuf>,
    skipped: Vec<PathBuf>,
}

pub fn run_init_cli(args: &[String]) -> i32 {
    match run_init(args) {
        Ok(()) => 0,
        Err(error) => {
            eprintln!("agent-guardrails init: {error}");
            1
        }
    }
}

fn run_init(args: &[String]) -> Result<(), String> {
    let args = parse_init_args(args)?;
    let target_dir = resolve_target_dir(args.target_dir.as_deref())?;

    execute_init(InitOptions {
        target_dir,
        preset: args.preset,
        adapters: args.adapters,
        locale: args.locale,
        force: args.force,
        silent: false,
    })?;
    Ok(())
}

pub(crate) fn execute_init(options: InitOptions) -> Result<InitResult, String> {
    if !SUPPORTED_PRESETS.contains(&options.preset.as_str()) {
        return Err(format!(
            "unknown preset: {}. Supported presets: {}",
            options.preset,
            SUPPORTED_PRESETS.join(", ")
        ));
    }

    let unsupported_adapters: Vec<&str> = options
        .adapters
        .iter()
        .map(String::as_str)
        .filter(|adapter| !SUPPORTED_ADAPTERS.contains(adapter))
        .collect();
    if !unsupported_adapters.is_empty() {
        return Err(format!(
            "unknown adapter(s): {}. Supported adapters: {}",
            unsupported_adapters.join(", "),
            SUPPORTED_ADAPTERS.join(", ")
        ));
    }

    let template_root = find_template_root()?;
    let preset_config_text = load_template(
        &template_root,
        &format!("presets/{}/config.json", options.preset),
        None,
    )?;
    let preset_config: Value = serde_json::from_str(&preset_config_text)
        .map_err(|error| format!("failed to parse preset config: {error}"))?;
    let preset_name = preset_config
        .get("preset")
        .and_then(Value::as_str)
        .unwrap_or(&options.preset);
    let existing_ci = has_existing_ci(&options.target_dir);
    let writes = classify_writes(
        &options.target_dir,
        &options.adapters,
        &preset_config_text,
        preset_name,
        existing_ci,
        &options.locale,
        &template_root,
    )?;
    let write_result = apply_writes(writes, options.force)?;
    let hook_result = inject_git_hook(&options.target_dir, &template_root)?;
    let slash_result = inject_slash_commands(&template_root)?;
    if !options.silent {
        print_summary(
            &options.target_dir,
            &options,
            existing_ci,
            &write_result,
            hook_result,
            &slash_result,
        );
    }
    Ok(InitResult {
        target_dir: options.target_dir,
        preset: options.preset,
        adapters: options.adapters,
        created: write_result.created,
        appended: write_result.appended,
        skipped: write_result.skipped,
        existing_ci,
        hook_injected: hook_result,
        locale: options.locale,
    })
}

fn parse_init_args(args: &[String]) -> Result<InitArgs, String> {
    let mut parsed = InitArgs {
        preset: "generic".to_string(),
        locale: "en".to_string(),
        ..InitArgs::default()
    };
    let mut index = 0;

    while index < args.len() {
        match args[index].as_str() {
            "--preset" => {
                parsed.preset = read_flag_value(args, index, "--preset")?;
                index += 2;
            }
            "--adapter" => {
                parsed.adapters = parse_adapter_list(&read_flag_value(args, index, "--adapter")?);
                index += 2;
            }
            "--lang" => {
                parsed.locale = read_flag_value(args, index, "--lang")?;
                index += 2;
            }
            "--force" => {
                parsed.force = true;
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

fn classify_writes(
    target_dir: &Path,
    adapters: &[String],
    preset_config_text: &str,
    preset_name: &str,
    existing_ci: bool,
    locale: &str,
    template_root: &Path,
) -> Result<Vec<WriteEntry>, String> {
    let project_name = target_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project");
    let current_date = current_utc_date();
    let replacements = [
        ("PROJECT_NAME", project_name),
        ("PRESET_NAME", preset_name),
        ("CURRENT_DATE", current_date.as_str()),
    ];
    let mut writes = Vec::new();

    writes.push(WriteEntry {
        kind: WriteKind::Append,
        path: target_dir.join("AGENTS.md"),
        content: apply_template(
            &load_template(template_root, "base/AGENTS.md", Some(locale))?,
            &replacements,
        ),
        marker: Some("agent-guardrails"),
    });
    writes.push(WriteEntry {
        kind: WriteKind::Create,
        path: target_dir.join("docs").join("PROJECT_STATE.md"),
        content: apply_template(
            &load_template(template_root, "base/PROJECT_STATE.md", Some(locale))?,
            &replacements,
        ),
        marker: None,
    });
    writes.push(WriteEntry {
        kind: WriteKind::Create,
        path: target_dir.join("docs").join("PR_CHECKLIST.md"),
        content: load_template(template_root, "base/PR_CHECKLIST.md", Some(locale))?,
        marker: None,
    });
    writes.push(WriteEntry {
        kind: WriteKind::Force,
        path: target_dir
            .join(".agent-guardrails")
            .join("tasks")
            .join("TASK_TEMPLATE.md"),
        content: load_template(template_root, "base/TASK_TEMPLATE.md", Some(locale))?,
        marker: None,
    });
    writes.push(WriteEntry {
        kind: WriteKind::Force,
        path: target_dir
            .join(".agent-guardrails")
            .join("prompts")
            .join("IMPLEMENT_PROMPT.md"),
        content: load_template(template_root, "base/IMPLEMENT_PROMPT.md", Some(locale))?,
        marker: None,
    });
    writes.push(WriteEntry {
        kind: WriteKind::Force,
        path: target_dir.join(".agent-guardrails").join("config.json"),
        content: ensure_trailing_newline(preset_config_text),
        marker: None,
    });

    if !existing_ci {
        writes.push(WriteEntry {
            kind: WriteKind::Create,
            path: target_dir
                .join(".github")
                .join("workflows")
                .join("agent-guardrails.yml"),
            content: load_template(template_root, "base/workflows/agent-guardrails.yml", None)?,
            marker: None,
        });
    }

    for adapter in adapters {
        if let Some((target, template)) = adapter_write(adapter) {
            writes.push(WriteEntry {
                kind: WriteKind::Create,
                path: target_dir.join(target),
                content: load_template(template_root, template, Some(locale))?,
                marker: None,
            });
        }
    }

    Ok(writes)
}

fn adapter_write(adapter: &str) -> Option<(&'static str, &'static str)> {
    match adapter {
        "claude-code" => Some(("CLAUDE.md", "adapters/claude-code/CLAUDE.md")),
        "cursor" => Some((
            ".cursor/rules/agent-guardrails.mdc",
            "adapters/cursor/agent-guardrails.mdc",
        )),
        "gemini" => Some(("GEMINI.md", "adapters/gemini/GEMINI.md")),
        "codex" => Some((".codex/instructions.md", "adapters/codex/instructions.md")),
        _ => None,
    }
}

fn apply_writes(writes: Vec<WriteEntry>, force_all: bool) -> Result<WriteResult, String> {
    let mut result = WriteResult {
        created: Vec::new(),
        appended: Vec::new(),
        skipped: Vec::new(),
    };

    for entry in writes {
        let path = entry.path;
        let wrote = match entry.kind {
            WriteKind::Append => append_text(&path, &entry.content, entry.marker)?,
            WriteKind::Force => write_text(&path, &entry.content, true)?,
            WriteKind::Create => write_text(&path, &entry.content, force_all)?,
        };

        if wrote {
            match entry.kind {
                WriteKind::Append => result.appended.push(path),
                WriteKind::Create | WriteKind::Force => result.created.push(path),
            }
        } else {
            result.skipped.push(path);
        }
    }

    Ok(result)
}

fn print_summary(
    target_dir: &Path,
    args: &InitOptions,
    existing_ci: bool,
    writes: &WriteResult,
    hook_injected: bool,
    slash_commands: &[String],
) {
    let project_name = target_dir
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("project");
    println!(
        "{}",
        init_message(
            &args.locale,
            "initialized",
            &[("project", project_name), ("preset", &args.preset)]
        )
    );

    if !args.adapters.is_empty() {
        println!(
            "{}",
            init_message(
                &args.locale,
                "adapters",
                &[("adapters", &args.adapters.join(", "))]
            )
        );
    }
    print_paths(target_dir, &args.locale, "created", &writes.created);
    print_paths(target_dir, &args.locale, "appended", &writes.appended);
    print_paths(target_dir, &args.locale, "skipped", &writes.skipped);

    if existing_ci {
        println!("\n{}", init_message(&args.locale, "ci_detected", &[]));
    }
    println!(
        "\n{}",
        init_message(
            &args.locale,
            if hook_injected {
                "hook_injected"
            } else {
                "hook_skipped"
            },
            &[]
        )
    );
    if !slash_commands.is_empty() {
        println!("\n{}", init_message(&args.locale, "slash_installed", &[]));
        for command in slash_commands {
            println!("- /ag:{}", command.trim_end_matches(".md"));
        }
    }

    println!("\n{}", init_message(&args.locale, "next_steps", &[]));
    println!("1. agent-guardrails plan --task \"Describe the next change\"");
    println!("2. Let your AI agent make the smallest safe change.");
    println!("3. Update .agent-guardrails/evidence/current-task.md.");
    println!("4. agent-guardrails check --commands-run \"npm test\" --review");
}

fn print_paths(target_dir: &Path, locale: &str, title_key: &str, paths: &[PathBuf]) {
    if paths.is_empty() {
        return;
    }
    println!("\n{}", init_message(locale, title_key, &[]));
    for path in paths {
        println!("- {}", relative_display(target_dir, path));
    }
}

fn init_message(locale: &str, key: &str, replacements: &[(&str, &str)]) -> String {
    let zh = locale.eq_ignore_ascii_case("zh-cn") || locale.eq_ignore_ascii_case("zh_cn");
    let template = match (zh, key) {
        (true, "initialized") => "已为 {project} 初始化 agent-guardrails（preset: {preset}）。",
        (true, "adapters") => "已选择适配器：{adapters}",
        (true, "created") => "已创建：",
        (true, "appended") => "已追加：",
        (true, "skipped") => "已跳过已存在文件：",
        (true, "ci_detected") => "检测到已有 CI workflow，未写入默认 GitHub Actions 文件。",
        (true, "hook_injected") => "已安装本地 pre-commit hook。",
        (true, "hook_skipped") => "未安装本地 pre-commit hook（没有 .git/hooks 或已安装）。",
        (true, "slash_installed") => "已安装 Claude slash commands：",
        (true, "next_steps") => "下一步：",
        (_, "initialized") => "Initialized agent-guardrails for {project} (preset: {preset}).",
        (_, "adapters") => "Adapters: {adapters}",
        (_, "created") => "Created:",
        (_, "appended") => "Appended:",
        (_, "skipped") => "Skipped existing files:",
        (_, "ci_detected") => {
            "Existing CI workflow detected; skipped the default GitHub Actions file."
        }
        (_, "hook_injected") => "Installed local pre-commit hook.",
        (_, "hook_skipped") => {
            "Skipped local pre-commit hook (no .git/hooks directory or already installed)."
        }
        (_, "slash_installed") => "Installed Claude slash commands:",
        (_, "next_steps") => "Next steps:",
        _ => "",
    };
    replacements
        .iter()
        .fold(template.to_string(), |output, (key, value)| {
            output.replace(&format!("{{{key}}}"), value)
        })
}

fn has_existing_ci(target_dir: &Path) -> bool {
    let workflows_dir = target_dir.join(".github").join("workflows");
    let Ok(entries) = fs::read_dir(workflows_dir) else {
        return false;
    };
    entries.filter_map(Result::ok).any(|entry| {
        let path = entry.path();
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(|extension| {
                extension.eq_ignore_ascii_case("yml") || extension.eq_ignore_ascii_case("yaml")
            })
            .unwrap_or(false)
    })
}

fn inject_git_hook(target_dir: &Path, template_root: &Path) -> Result<bool, String> {
    let hooks_dir = target_dir.join(".git").join("hooks");
    if !hooks_dir.exists() {
        return Ok(false);
    }
    let hook_path = hooks_dir.join("pre-commit");
    if hook_path.exists() {
        let existing = fs::read_to_string(&hook_path).unwrap_or_default();
        if existing.contains("agent-guardrails") {
            return Ok(false);
        }
    }
    let content = load_template(template_root, "base/hooks/pre-commit.cjs", None)?;
    write_text(&hook_path, &content, true)?;
    make_executable(&hook_path)?;
    Ok(true)
}

fn inject_slash_commands(template_root: &Path) -> Result<Vec<String>, String> {
    let Some(home_dir) = home_dir() else {
        return Ok(Vec::new());
    };
    let commands_dir = home_dir.join(".claude").join("commands").join("ag");
    let commands = ["check.md", "plan.md", "review.md", "fix.md", "status.md"];
    let mut installed = Vec::new();
    for command in commands {
        let content = load_template(template_root, &format!("commands/{command}"), None)?;
        write_text(&commands_dir.join(command), &content, true)?;
        installed.push(command.to_string());
    }
    Ok(installed)
}

pub(crate) fn find_template_root() -> Result<PathBuf, String> {
    if let Ok(value) = env::var("AGENT_GUARDRAILS_TEMPLATE_ROOT") {
        let candidate = PathBuf::from(value);
        if candidate
            .join("templates")
            .join("base")
            .join("AGENTS.md")
            .exists()
        {
            return Ok(candidate.join("templates"));
        }
        if candidate.join("base").join("AGENTS.md").exists() {
            return Ok(candidate);
        }
    }

    if let Ok(exe) = env::current_exe() {
        for ancestor in exe.ancestors() {
            let candidate = ancestor.join("templates");
            if candidate.join("base").join("AGENTS.md").exists() {
                return Ok(candidate);
            }
        }
    }

    let manifest_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(Path::parent)
        .map(|root| root.join("templates"));
    if let Some(candidate) = manifest_root {
        if candidate.join("base").join("AGENTS.md").exists() {
            return Ok(candidate);
        }
    }

    Err("failed to locate templates directory".to_string())
}

pub(crate) fn load_template(
    template_root: &Path,
    relative_path: &str,
    locale: Option<&str>,
) -> Result<String, String> {
    if let Some(locale) = locale {
        let localized = template_root
            .join("locales")
            .join(locale)
            .join(relative_path);
        if localized.exists() {
            return read_text(&localized);
        }
    }
    read_text(&template_root.join(relative_path))
}

pub(crate) fn read_text(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("failed to read {}: {error}", path.display()))
}

pub(crate) fn write_text(path: &Path, content: &str, force: bool) -> Result<bool, String> {
    if path.exists() && !force {
        return Ok(false);
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create {}: {error}", parent.display()))?;
    }
    fs::write(path, content)
        .map_err(|error| format!("failed to write {}: {error}", path.display()))?;
    Ok(true)
}

fn append_text(path: &Path, content: &str, marker: Option<&str>) -> Result<bool, String> {
    if path.exists() {
        let existing = fs::read_to_string(path).unwrap_or_default();
        if let Some(marker) = marker {
            if existing.contains(&format!("<!-- {marker}:start -->")) {
                return Ok(false);
            }
            let appended = format!("\n<!-- {marker}:start -->\n{content}\n<!-- {marker}:end -->\n");
            fs::OpenOptions::new()
                .append(true)
                .open(path)
                .and_then(|mut file| {
                    use std::io::Write;
                    file.write_all(appended.as_bytes())
                })
                .map_err(|error| format!("failed to append {}: {error}", path.display()))?;
            return Ok(true);
        }
    }
    write_text(path, content, false)
}

fn apply_template(template: &str, replacements: &[(&str, &str)]) -> String {
    replacements
        .iter()
        .fold(template.to_string(), |output, (key, value)| {
            output.replace(&format!("{{{{{key}}}}}"), value)
        })
}

fn ensure_trailing_newline(value: &str) -> String {
    if value.ends_with('\n') {
        value.to_string()
    } else {
        format!("{value}\n")
    }
}

fn read_flag_value(args: &[String], index: usize, flag: &str) -> Result<String, String> {
    args.get(index + 1)
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .ok_or_else(|| format!("missing value for {flag}"))
}

fn parse_adapter_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .map(str::to_lowercase)
        .filter(|item| !item.is_empty())
        .collect()
}

pub(crate) fn resolve_target_dir(value: Option<&str>) -> Result<PathBuf, String> {
    let path = match value {
        Some(value) => PathBuf::from(value),
        None => env::current_dir()
            .map_err(|error| format!("failed to read current directory: {error}"))?,
    };
    if path.is_absolute() {
        Ok(path)
    } else {
        env::current_dir()
            .map(|cwd| cwd.join(path))
            .map_err(|error| format!("failed to read current directory: {error}"))
    }
}

pub(crate) fn relative_display(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn current_utc_date() -> String {
    let days = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| (duration.as_secs() / 86_400) as i64)
        .unwrap_or(0);
    let (year, month, day) = civil_from_days(days);
    format!("{year:04}-{month:02}-{day:02}")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, u32, u32) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if month <= 2 { 1 } else { 0 };
    (year, month as u32, day as u32)
}

#[cfg(unix)]
pub(crate) fn make_executable(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = fs::metadata(path)
        .map_err(|error| format!("failed to stat {}: {error}", path.display()))?
        .permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("failed to chmod {}: {error}", path.display()))
}

#[cfg(not(unix))]
pub(crate) fn make_executable(_path: &Path) -> Result<(), String> {
    Ok(())
}
