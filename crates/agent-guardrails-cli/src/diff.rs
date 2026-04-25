use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct ChangedFilesResult {
    pub files: Vec<String>,
    pub error: Option<String>,
    pub fallback: bool,
    pub fallback_reason: Option<String>,
}

pub fn normalize_repo_path(file_path: &str) -> String {
    let replaced = file_path.replace('\\', "/");
    let without_dot = replaced.strip_prefix("./").unwrap_or(&replaced);
    let without_leading = without_dot.trim_start_matches('/');
    normalize_posix_path(without_leading)
}

pub fn get_top_level_entry(file_path: &str) -> String {
    let normalized = normalize_repo_path(file_path);
    normalized
        .split('/')
        .next()
        .unwrap_or(&normalized)
        .to_string()
}

#[derive(Clone, Debug, PartialEq)]
pub struct AllowedScope {
    pub kind: String,
    pub value: String,
}

pub fn is_source_file(file_path: &str, config: &Value) -> bool {
    let normalized = file_path.replace('\\', "/");
    let extensions = string_array(config.pointer("/checks/sourceExtensions"));
    let roots = string_array(config.pointer("/checks/sourceRoots"));

    roots
        .iter()
        .any(|root| normalized.starts_with(&format!("{root}/")))
        && extensions
            .iter()
            .any(|extension| normalized.ends_with(extension))
}

pub fn is_test_file(file_path: &str, config: &Value) -> bool {
    let normalized = normalize_repo_path(file_path);
    let extensions = string_array(config.pointer("/checks/testExtensions"));
    let roots = string_array(config.pointer("/checks/testRoots"));
    let filename_signals = string_array(config.pointer("/checks/testFileSignals"));

    let root_match = roots
        .iter()
        .any(|root| normalized.starts_with(&format!("{root}/")));
    let extension_match = extensions
        .iter()
        .any(|extension| normalized.ends_with(extension));
    let filename_match = filename_signals
        .iter()
        .any(|signal| normalized.contains(signal));

    (root_match && extension_match) || filename_match
}

pub fn classify_change_type(file_path: &str, config: &Value) -> String {
    let normalized = normalize_repo_path(file_path);
    let lower = normalized.to_lowercase();
    let extension = posix_extension(&lower);
    let base_name = lower.rsplit('/').next().unwrap_or(&lower);

    if lower.starts_with(".agent-guardrails/") {
        return "guardrails-internal".to_string();
    }

    if is_test_file(&normalized, config) {
        return "tests".to_string();
    }

    if matches!(extension.as_str(), ".md" | ".txt" | ".rst") || lower.starts_with("docs/") {
        return "docs".to_string();
    }

    if lower.contains("/migrations/")
        || lower.contains("/migration/")
        || lower.starts_with("migrations/")
        || lower.starts_with("migration/")
        || matches!(extension.as_str(), ".sql" | ".prisma")
    {
        return "migration".to_string();
    }

    if base_name == "package.json"
        || lower.ends_with(".json")
        || lower.ends_with(".yaml")
        || lower.ends_with(".yml")
        || lower.ends_with(".toml")
        || lower.starts_with(".github/")
    {
        return "config".to_string();
    }

    if lower.ends_with(".d.ts")
        || lower.contains("/types/")
        || lower.contains("/contracts/")
        || lower.contains("/schema/")
        || lower.contains("/schemas/")
        || lower.contains("/api/")
        || base_name.contains("types.")
        || base_name.contains("contract.")
        || base_name.contains("schema.")
    {
        return "interface".to_string();
    }

    if is_source_file(&normalized, config) {
        return "implementation".to_string();
    }

    "other".to_string()
}

pub fn normalize_allowed_scope(scope: &str, repo_root: &Path) -> AllowedScope {
    let normalized = normalize_repo_path(scope);

    if normalized.is_empty() || normalized == "." {
        return AllowedScope {
            kind: "all".to_string(),
            value: String::new(),
        };
    }

    if normalized.ends_with("/**") {
        return AllowedScope {
            kind: "directory".to_string(),
            value: normalized.trim_end_matches("/**").to_string(),
        };
    }

    let absolute_path = repo_root.join(scope);
    if absolute_path.is_dir() {
        return AllowedScope {
            kind: "directory".to_string(),
            value: trim_trailing_slashes(&normalized),
        };
    }

    if scope.ends_with('/') || scope.ends_with('\\') {
        return AllowedScope {
            kind: "directory".to_string(),
            value: trim_trailing_slashes(&normalized),
        };
    }

    AllowedScope {
        kind: "file".to_string(),
        value: normalized,
    }
}

pub fn is_path_within_allowed_scope(file_path: &str, scope: &str, repo_root: &Path) -> bool {
    let normalized_file = normalize_repo_path(file_path);
    let normalized_scope = normalize_allowed_scope(scope, repo_root);

    if normalized_scope.kind == "all" {
        return true;
    }

    if normalized_scope.kind == "file" {
        return normalized_file == normalized_scope.value;
    }

    normalized_file == normalized_scope.value
        || normalized_file.starts_with(&format!("{}/", normalized_scope.value))
}

pub fn find_out_of_scope_files(
    file_paths: &[String],
    allowed_scopes: &[String],
    repo_root: &Path,
) -> Vec<String> {
    if allowed_scopes.is_empty() {
        return Vec::new();
    }

    file_paths
        .iter()
        .filter(|file_path| {
            !allowed_scopes
                .iter()
                .any(|scope| is_path_within_allowed_scope(file_path, scope, repo_root))
        })
        .cloned()
        .collect()
}

pub fn normalize_change_type(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    if normalized.is_empty() {
        return String::new();
    }
    if normalized == "implementation-only" {
        return "implementation-only".to_string();
    }
    if normalized == "interface-changing" {
        return "interface-changing".to_string();
    }
    normalized
}

pub fn parse_git_status_porcelain_z(output: &str) -> Vec<String> {
    let entries = output
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;

    while index < entries.len() {
        let entry = entries[index];
        let status = entry.chars().take(2).collect::<String>();
        let file_path = entry.get(3..).unwrap_or("");
        if !file_path.is_empty() {
            files.push(file_path.to_string());
        }

        if matches!(status.chars().next(), Some('R' | 'C')) && entries.get(index + 1).is_some() {
            files.push(entries[index + 1].to_string());
            index += 1;
        }

        index += 1;
    }

    unique(files)
}

pub fn parse_git_diff_name_status_z(output: &str) -> Vec<String> {
    let entries = output
        .split('\0')
        .filter(|entry| !entry.is_empty())
        .collect::<Vec<_>>();
    let mut files = Vec::new();
    let mut index = 0;

    while index < entries.len() {
        let status = entries[index];
        index += 1;
        let code = status.chars().next();

        if matches!(code, Some('R' | 'C'))
            && entries.get(index).is_some()
            && entries.get(index + 1).is_some()
        {
            files.push(entries[index].to_string());
            files.push(entries[index + 1].to_string());
            index += 2;
            continue;
        }

        if let Some(file_path) = entries.get(index) {
            files.push((*file_path).to_string());
            index += 1;
        }
    }

    unique(files)
}

pub fn list_changed_files(repo_root: &Path) -> ChangedFilesResult {
    if let Ok(injected) = std::env::var("AGENT_GUARDRAILS_CHANGED_FILES") {
        if !injected.is_empty() {
            return ChangedFilesResult {
                files: split_injected_files(&injected),
                error: None,
                fallback: false,
                fallback_reason: None,
            };
        }
    }

    let git_root = resolve_git_root(repo_root).unwrap_or_else(|| repo_root.to_path_buf());
    let output = match run_git(&git_root, ["status", "--porcelain=v1", "-z"]) {
        Ok(output) => output,
        Err(message) => {
            return ChangedFilesResult {
                files: Vec::new(),
                error: Some(format!(
                    "Unable to inspect working-tree changes. Run inside a git repository or pass --base-ref <ref>. {message}"
                )),
                fallback: false,
                fallback_reason: None,
            };
        }
    };

    let prefix = repo_prefix(&git_root, repo_root);
    let files = parse_git_status_porcelain_z(&output)
        .into_iter()
        .flat_map(|file_path| expand_changed_path(&git_root, &file_path))
        .filter(|file_path| matches_prefix(file_path, prefix.as_deref()))
        .map(|file_path| strip_prefix(file_path, prefix.as_deref()))
        .collect();

    ChangedFilesResult {
        files,
        error: None,
        fallback: false,
        fallback_reason: None,
    }
}

pub fn list_changed_files_from_base_ref(repo_root: &Path, base_ref: &str) -> ChangedFilesResult {
    if let Ok(error) = std::env::var("AGENT_GUARDRAILS_BASE_REF_ERROR") {
        if !error.is_empty() {
            return ChangedFilesResult {
                files: Vec::new(),
                error: Some(error),
                fallback: false,
                fallback_reason: None,
            };
        }
    }

    if let Ok(injected) = std::env::var("AGENT_GUARDRAILS_BASE_REF_CHANGED_FILES") {
        if !injected.is_empty() {
            return ChangedFilesResult {
                files: split_injected_files(&injected),
                error: None,
                fallback: false,
                fallback_reason: None,
            };
        }
    }

    let git_root = resolve_git_root(repo_root).unwrap_or_else(|| repo_root.to_path_buf());
    let prefix = repo_prefix(&git_root, repo_root);
    let primary_ref = format!("{base_ref}...HEAD");

    match run_git(
        &git_root,
        [
            "diff",
            "--name-status",
            "-z",
            "--diff-filter=ACMRD",
            &primary_ref,
        ],
    ) {
        Ok(output) => ChangedFilesResult {
            files: parse_base_ref_diff(&output, prefix.as_deref()),
            error: None,
            fallback: false,
            fallback_reason: None,
        },
        Err(primary_error) => match run_git(
            &git_root,
            ["diff", "--name-status", "-z", "--diff-filter=ACMRD", "HEAD"],
        ) {
            Ok(output) => ChangedFilesResult {
                files: parse_base_ref_diff(&output, prefix.as_deref()),
                error: None,
                fallback: true,
                fallback_reason: Some(format!(
                    "base-ref \"{base_ref}\" not found, fell back to working-tree diff (HEAD). For full baseline comparison, add a remote: git remote add origin <url> && git push -u origin <branch>."
                )),
            },
            Err(_) => ChangedFilesResult {
                files: Vec::new(),
                error: Some(format!(
                    "Unable to diff against base ref \"{base_ref}\": {primary_error}"
                )),
                fallback: false,
                fallback_reason: None,
            },
        },
    }
}

pub fn resolve_git_root(start_dir: &Path) -> Option<PathBuf> {
    let output = run_git(start_dir, ["rev-parse", "--show-toplevel"]).ok()?;
    let raw = output.trim();

    #[cfg(windows)]
    {
        if raw.starts_with('/') && !raw.starts_with("//") {
            let mut chars = raw.chars();
            let _slash = chars.next();
            if let (Some(drive), Some('/')) = (chars.next(), chars.next()) {
                if drive.is_ascii_alphabetic() {
                    let rest = chars.as_str();
                    return Some(PathBuf::from(format!("{}:/{}", drive, rest)));
                }
            }
        }
    }

    Some(PathBuf::from(raw))
}

fn parse_base_ref_diff(output: &str, prefix: Option<&str>) -> Vec<String> {
    parse_git_diff_name_status_z(output)
        .into_iter()
        .filter(|file_path| matches_prefix(file_path, prefix))
        .map(|file_path| strip_prefix(file_path, prefix))
        .collect()
}

fn run_git<I, S>(cwd: &Path, args: I) -> Result<String, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let output = Command::new("git")
        .args(args.into_iter().map(|arg| arg.as_ref().to_string()))
        .current_dir(cwd)
        .output()
        .map_err(|cause| cause.to_string())?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("git exited with status {}", output.status))
    } else {
        Err(stderr)
    }
}

fn split_injected_files(value: &str) -> Vec<String> {
    value
        .split(if cfg!(windows) { ';' } else { ':' })
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn repo_prefix(git_root: &Path, repo_root: &Path) -> Option<String> {
    let git_root = fs::canonicalize(git_root).unwrap_or_else(|_| git_root.to_path_buf());
    let repo_root = fs::canonicalize(repo_root).unwrap_or_else(|_| repo_root.to_path_buf());

    if git_root == repo_root {
        return None;
    }

    repo_root
        .strip_prefix(&git_root)
        .ok()
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .filter(|path| !path.is_empty())
}

fn matches_prefix(file_path: &str, prefix: Option<&str>) -> bool {
    match prefix {
        None | Some("") => true,
        Some(prefix) => file_path.starts_with(&format!("{prefix}/")),
    }
}

fn strip_prefix(file_path: String, prefix: Option<&str>) -> String {
    match prefix {
        None | Some("") => file_path,
        Some(prefix) => file_path
            .strip_prefix(&format!("{prefix}/"))
            .unwrap_or(&file_path)
            .to_string(),
    }
}

fn expand_changed_path(git_root: &Path, file_path: &str) -> Vec<String> {
    let absolute_path = git_root.join(file_path);
    if !file_path.ends_with('/') || !absolute_path.is_dir() {
        return vec![file_path.to_string()];
    }

    list_files_recursively(&absolute_path)
        .into_iter()
        .map(|nested_path| format!("{file_path}{nested_path}"))
        .collect()
}

fn list_files_recursively(root_dir: &Path) -> Vec<String> {
    let mut files = Vec::new();
    list_files_recursively_inner(root_dir, root_dir, &mut files);
    files
}

fn list_files_recursively_inner(root_dir: &Path, current_dir: &Path, files: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(current_dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            list_files_recursively_inner(root_dir, &path, files);
            continue;
        }
        if !path.is_file() {
            continue;
        }
        if let Ok(relative) = path.strip_prefix(root_dir) {
            files.push(relative.to_string_lossy().replace('\\', "/"));
        }
    }
}

fn unique(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(item.clone()))
        .collect()
}

fn normalize_posix_path(path: &str) -> String {
    let mut parts = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            value => parts.push(value),
        }
    }
    parts.join("/")
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToString::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn posix_extension(path: &str) -> String {
    let file_name = path.rsplit('/').next().unwrap_or(path);
    let Some(dot_index) = file_name.rfind('.') else {
        return String::new();
    };
    file_name[dot_index..].to_string()
}

fn trim_trailing_slashes(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}
