use crate::diff::{
    classify_change_type, find_out_of_scope_files, get_top_level_entry,
    is_path_within_allowed_scope, is_source_file, is_test_file, list_changed_files,
    list_changed_files_from_base_ref, normalize_repo_path,
};
use crate::policy::required_paths;
use crate::policy::{Policy, build_policy};
use crate::repo::{
    DEFAULT_TASK_CONTRACT_PATH, TaskContract, read_config, read_task_contract,
    resolve_task_contract_path,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct CheckContextOptions {
    pub base_ref: Option<String>,
    pub contract_path: Option<String>,
    pub commands_run: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceSummary {
    pub has_review_notes: bool,
    pub full_text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedAreaMatch {
    pub label: String,
    pub path: String,
    pub minimum_risk_level: Option<String>,
    pub requires_review_notes: bool,
    pub action: String,
    pub files: Vec<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CheckContextSnapshot {
    pub repo_root: PathBuf,
    pub config: Value,
    pub policy: Policy,
    pub task_contract: Option<TaskContract>,
    pub contract_path: String,
    pub base_ref: Option<String>,
    pub diff_source: String,
    pub diff_fallback: bool,
    pub diff_fallback_reason: Option<String>,
    pub changed_files: Vec<String>,
    pub source_files: Vec<String>,
    pub test_files: Vec<String>,
    pub allowed_paths: Vec<Value>,
    pub task_allowed_paths: Vec<Value>,
    pub protected_paths: Vec<Value>,
    pub out_of_scope_files: Vec<String>,
    pub out_of_task_scope_files: Vec<String>,
    pub intended_files: Vec<Value>,
    pub out_of_intended_files: Vec<String>,
    pub allowed_change_types: Vec<String>,
    pub change_types: BTreeMap<String, String>,
    pub top_level_entries: Vec<String>,
    pub required_paths: Vec<String>,
    pub required_path_status: BTreeMap<String, bool>,
    pub required_commands: Vec<String>,
    pub missing_required_commands: Vec<String>,
    pub evidence_paths: Vec<String>,
    pub missing_evidence_paths: Vec<String>,
    pub evidence_summary: EvidenceSummary,
    pub protected_path_matches: Vec<String>,
    pub config_protected_area_matches: Vec<ProtectedAreaMatch>,
    pub commands_run: Vec<String>,
    pub interface_like_files: Vec<String>,
    pub config_or_migration_files: Vec<String>,
    pub performance_sensitive_files: Vec<String>,
    pub critical_path_files: Vec<String>,
    pub task_nfr_requirements: Vec<String>,
    pub total_added_lines: u64,
}

pub fn build_check_context(
    repo_root: &Path,
    options: CheckContextOptions,
) -> Result<CheckContextSnapshot, String> {
    let config = read_config(repo_root)
        .map_err(|error| error.to_string())?
        .unwrap_or_else(|| Value::Object(Default::default()));
    let policy = build_policy(&config);
    let contract_path = options
        .contract_path
        .clone()
        .unwrap_or_else(|| DEFAULT_TASK_CONTRACT_PATH.to_string());
    let task_contract =
        read_task_contract(repo_root, Some(&contract_path)).map_err(|error| error.to_string())?;

    let diff_result = if let Some(base_ref) = options.base_ref.as_deref() {
        list_changed_files_from_base_ref(repo_root, base_ref)
    } else {
        list_changed_files(repo_root)
    };

    if let Some(error) = diff_result.error {
        return Err(error);
    }
    let diff_fallback = diff_result.fallback;
    let diff_fallback_reason = diff_result.fallback_reason.clone();

    let ignored_files = HashSet::from([contract_path.clone()]);
    let changed_files = diff_result
        .files
        .into_iter()
        .filter(|file_path| !ignored_files.contains(file_path))
        .filter(|file_path| !is_guardrails_runtime_file(file_path))
        .collect::<Vec<_>>();

    let source_files = changed_files
        .iter()
        .filter(|file_path| is_source_file(file_path, &config))
        .cloned()
        .collect::<Vec<_>>();
    let test_files = changed_files
        .iter()
        .filter(|file_path| is_test_file(file_path, &config))
        .cloned()
        .collect::<Vec<_>>();

    let task_allowed_paths = task_contract
        .as_ref()
        .map(|contract| contract.allowed_paths.clone())
        .unwrap_or_default();
    let protected_paths = task_contract
        .as_ref()
        .map(|contract| contract.protected_paths.clone())
        .unwrap_or_default();
    let intended_files = task_contract
        .as_ref()
        .map(|contract| contract.intended_files.clone())
        .unwrap_or_default();
    let evidence_paths = task_contract
        .as_ref()
        .map(|contract| string_values(&contract.evidence_paths))
        .unwrap_or_default();
    let declared_evidence_files = evidence_paths
        .iter()
        .map(|evidence_path| normalize_repo_path(evidence_path))
        .collect::<HashSet<_>>();
    let scope_relevant_changed_files = changed_files
        .iter()
        .filter(|file_path| !declared_evidence_files.contains(*file_path))
        .cloned()
        .collect::<Vec<_>>();
    let allowed_change_types = task_contract
        .as_ref()
        .map(|contract| {
            contract
                .allowed_change_types
                .iter()
                .filter_map(Value::as_str)
                .map(crate::diff::normalize_change_type)
                .filter(|value| !value.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let allowed_paths = policy.allowed_paths.clone();
    let out_of_scope_files = find_out_of_scope_files(
        &scope_relevant_changed_files,
        &string_values(&allowed_paths),
        repo_root,
    );
    let out_of_task_scope_files = find_out_of_scope_files(
        &scope_relevant_changed_files,
        &string_values(&task_allowed_paths),
        repo_root,
    );
    let out_of_intended_files = find_out_of_scope_files(
        &scope_relevant_changed_files,
        &string_values(&intended_files),
        repo_root,
    );

    let change_types = changed_files
        .iter()
        .map(|file_path| (file_path.clone(), classify_change_type(file_path, &config)))
        .collect::<BTreeMap<_, _>>();
    let top_level_entries = unique(
        changed_files
            .iter()
            .map(|file_path| get_top_level_entry(file_path))
            .collect(),
    );
    let required_paths = required_paths(&config);
    let required_path_status = required_paths
        .iter()
        .map(|relative_path| {
            (
                relative_path.clone(),
                repo_root.join(relative_path).exists(),
            )
        })
        .collect::<BTreeMap<_, _>>();
    let commands_run = resolve_commands_run(&options);
    let normalized_commands_run = commands_run
        .iter()
        .map(|command| normalize_command_evidence(command))
        .collect::<HashSet<_>>();
    let required_commands = task_contract
        .as_ref()
        .map(|contract| string_values(&contract.required_commands))
        .unwrap_or_default();
    let missing_required_commands = required_commands
        .iter()
        .filter(|command| !normalized_commands_run.contains(&normalize_command_evidence(command)))
        .cloned()
        .collect::<Vec<_>>();
    let missing_evidence_paths = evidence_paths
        .iter()
        .filter(|evidence_path| !repo_root.join(evidence_path).exists())
        .cloned()
        .collect::<Vec<_>>();
    let evidence_summary = summarize_evidence(repo_root, &evidence_paths);
    let protected_path_matches = string_values(&protected_paths)
        .into_iter()
        .filter(|scope| {
            changed_files
                .iter()
                .any(|file_path| is_path_within_allowed_scope(file_path, scope, repo_root))
        })
        .collect::<Vec<_>>();
    let config_protected_area_matches =
        find_protected_area_matches(&changed_files, &config, repo_root);
    let interface_like_files = changed_files
        .iter()
        .filter(|file_path| {
            change_types
                .get(*file_path)
                .is_some_and(|kind| kind == "interface")
        })
        .cloned()
        .collect::<Vec<_>>();
    let config_or_migration_files = changed_files
        .iter()
        .filter(|file_path| {
            change_types
                .get(*file_path)
                .is_some_and(|kind| kind == "config" || kind == "migration")
        })
        .cloned()
        .collect::<Vec<_>>();
    let performance_sensitive_files = files_within_config_scopes(
        &changed_files,
        array_string_field(&config, "performanceSensitiveAreas"),
        repo_root,
    );
    let critical_path_files = files_within_config_scopes(
        &changed_files,
        array_string_field(&config, "criticalPaths"),
        repo_root,
    );
    let task_nfr_requirements = task_contract
        .as_ref()
        .map(|contract| string_values(&contract.nfr_requirements))
        .unwrap_or_default();
    let total_added_lines = calculate_total_added_lines(repo_root, options.base_ref.as_deref());

    let diff_source = options
        .base_ref
        .as_ref()
        .map(|base_ref| format!("git diff {base_ref}...HEAD"))
        .unwrap_or_else(|| "working tree".to_string());

    Ok(CheckContextSnapshot {
        repo_root: repo_root.to_path_buf(),
        config,
        policy,
        task_contract,
        contract_path: normalize_contract_path(repo_root, &contract_path),
        base_ref: options.base_ref.clone(),
        diff_source,
        diff_fallback,
        diff_fallback_reason,
        changed_files,
        source_files,
        test_files,
        allowed_paths,
        task_allowed_paths,
        protected_paths,
        out_of_scope_files,
        out_of_task_scope_files,
        intended_files,
        out_of_intended_files,
        allowed_change_types,
        change_types,
        top_level_entries,
        required_paths,
        required_path_status,
        required_commands,
        missing_required_commands,
        evidence_paths,
        missing_evidence_paths,
        evidence_summary,
        protected_path_matches,
        config_protected_area_matches,
        commands_run,
        interface_like_files,
        config_or_migration_files,
        performance_sensitive_files,
        critical_path_files,
        task_nfr_requirements,
        total_added_lines,
    })
}

fn calculate_total_added_lines(repo_root: &Path, base_ref: Option<&str>) -> u64 {
    if let Some(base_ref) = base_ref {
        return git_numstat_added_lines(
            repo_root,
            ["diff", "--numstat", &format!("{base_ref}...HEAD")],
        );
    }

    git_numstat_added_lines(repo_root, ["diff", "--numstat"])
        + git_numstat_added_lines(repo_root, ["diff", "--cached", "--numstat"])
}

fn git_numstat_added_lines<const N: usize>(repo_root: &Path, args: [&str; N]) -> u64 {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .output();
    let Ok(output) = output else {
        return 0;
    };
    if !output.status.success() {
        return 0;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.split_whitespace().next())
        .filter_map(|added| added.parse::<u64>().ok())
        .sum()
}

fn files_within_config_scopes(
    changed_files: &[String],
    scopes: Vec<String>,
    repo_root: &Path,
) -> Vec<String> {
    changed_files
        .iter()
        .filter(|file_path| {
            scopes
                .iter()
                .any(|scope| is_path_within_allowed_scope(file_path, scope, repo_root))
        })
        .cloned()
        .collect()
}

fn array_string_field(value: &Value, key: &str) -> Vec<String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect()
}

fn summarize_evidence(repo_root: &Path, evidence_paths: &[String]) -> EvidenceSummary {
    let full_text = evidence_paths
        .iter()
        .filter_map(|evidence_path| std::fs::read_to_string(repo_root.join(evidence_path)).ok())
        .map(|content| {
            content
                .lines()
                .map(str::trim)
                .filter(|line| !line.is_empty())
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|content| !content.is_empty())
        .collect::<Vec<_>>()
        .join("\n");
    let lower = full_text.to_ascii_lowercase();

    EvidenceSummary {
        has_review_notes: lower.contains("residual risk")
            || lower.contains("review note")
            || lower.contains("review summary")
            || lower.contains("risk:"),
        full_text,
    }
}

fn find_protected_area_matches(
    changed_files: &[String],
    config: &Value,
    repo_root: &Path,
) -> Vec<ProtectedAreaMatch> {
    config
        .get("protectedAreas")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|area| parse_protected_area(area, changed_files, repo_root))
        .collect()
}

fn parse_protected_area(
    area: &Value,
    changed_files: &[String],
    repo_root: &Path,
) -> Option<ProtectedAreaMatch> {
    let path = area.as_str().map(ToString::to_string).or_else(|| {
        area.get("path")
            .and_then(Value::as_str)
            .map(ToString::to_string)
    })?;
    let files = changed_files
        .iter()
        .filter(|file_path| is_path_within_allowed_scope(file_path, &path, repo_root))
        .cloned()
        .collect::<Vec<_>>();
    if files.is_empty() {
        return None;
    }

    let label = area
        .get("label")
        .and_then(Value::as_str)
        .unwrap_or(&path)
        .to_string();
    let minimum_risk_level = area
        .get("minimumRiskLevel")
        .and_then(Value::as_str)
        .map(ToString::to_string);
    let requires_review_notes = area
        .get("requiresReviewNotes")
        .map(js_truthy)
        .unwrap_or(false);
    let action = area
        .get("action")
        .and_then(Value::as_str)
        .map(ToString::to_string)
        .unwrap_or_else(|| format!("Review changes in protected area {path}."));

    Some(ProtectedAreaMatch {
        label,
        path,
        minimum_risk_level,
        requires_review_notes,
        action,
        files,
    })
}

fn js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(number) => number.as_f64() != Some(0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn string_values(values: &[Value]) -> Vec<String> {
    values
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect()
}

fn unique(items: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    items
        .into_iter()
        .filter(|item| seen.insert(item.clone()))
        .collect()
}

fn normalize_contract_path(repo_root: &Path, contract_path: &str) -> String {
    let resolved = resolve_task_contract_path(repo_root, Some(contract_path));
    resolved
        .strip_prefix(repo_root)
        .unwrap_or(&resolved)
        .to_string_lossy()
        .replace('\\', "/")
        .trim_start_matches('/')
        .to_string()
}

fn is_guardrails_runtime_file(file_path: &str) -> bool {
    matches!(
        normalize_repo_path(file_path).as_str(),
        ".agent-guardrails/daemon-result.json"
            | ".agent-guardrails/daemon.log"
            | ".agent-guardrails/daemon.pid"
            | ".agent-guardrails/daemon-info.json"
    )
}

fn resolve_commands_run(options: &CheckContextOptions) -> Vec<String> {
    if !options.commands_run.is_empty() {
        return options.commands_run.clone();
    }

    std::env::var("AGENT_GUARDRAILS_COMMANDS_RUN")
        .ok()
        .map(|value| parse_string_list(&value))
        .unwrap_or_default()
}

fn parse_string_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn normalize_command_evidence(command: &str) -> String {
    let normalized = command.split_whitespace().collect::<Vec<_>>().join(" ");
    let lower = normalized.to_ascii_lowercase();
    for tool in ["npx", "npm", "pnpm", "yarn", "node", "bun"] {
        let needle = format!("{tool}.cmd ");
        if lower.starts_with(&needle) {
            return format!("{}{}", tool, &normalized[tool.len() + 4..]);
        }
    }

    normalized
}
