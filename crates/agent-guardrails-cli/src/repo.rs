use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::BTreeMap;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};

pub const DEFAULT_TASK_CONTRACT_PATH: &str = ".agent-guardrails/task-contract.json";

#[derive(Debug)]
pub struct RepoInputError {
    message: String,
}

impl RepoInputError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for RepoInputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.message.fmt(formatter)
    }
}

impl std::error::Error for RepoInputError {}

pub type RepoInputResult<T> = Result<T, RepoInputError>;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskContract {
    pub schema_version: i64,
    pub task: String,
    pub preset: String,
    pub created_at: Option<Value>,
    pub allowed_paths: Vec<Value>,
    pub required_commands: Vec<Value>,
    pub evidence_paths: Vec<Value>,
    pub intended_files: Vec<Value>,
    pub protected_paths: Vec<Value>,
    pub allowed_change_types: Vec<Value>,
    pub risk_level: Option<Value>,
    pub requires_review_notes: bool,
    pub validation_profile: String,
    pub security_requirements: Vec<Value>,
    pub dependency_requirements: Vec<Value>,
    pub performance_requirements: Vec<Value>,
    pub understanding_requirements: Vec<Value>,
    pub continuity_requirements: Vec<Value>,
    pub acknowledged_skips: Vec<Value>,
    pub pattern_summary: String,
    pub smallest_viable_change: String,
    pub assumptions: Vec<Value>,
    pub acceptance_criteria: Vec<Value>,
    pub non_goals: Vec<Value>,
    pub expected_behavior_changes: Vec<Value>,
    pub user_visible_effects: Vec<Value>,
    pub intended_symbols: Vec<Value>,
    pub expected_public_surface_changes: Vec<Value>,
    pub expected_boundary_exceptions: Vec<Value>,
    pub expected_test_targets: Vec<Value>,
    pub production_profile: String,
    pub nfr_requirements: Vec<Value>,
    pub expected_load_sensitive_paths: Vec<Value>,
    pub expected_concurrency_impact: String,
    pub observability_requirements: Vec<Value>,
    pub rollback_notes: String,
    pub risk_justification: String,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

pub fn read_json_object(path: &Path) -> RepoInputResult<Value> {
    let raw = fs::read_to_string(path).map_err(|cause| {
        RepoInputError::new(format!(
            "agent-guardrails: Failed to read JSON at {}: {}",
            path.display(),
            cause
        ))
    })?;
    let text = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    let parsed: Value = serde_json::from_str(text).map_err(|cause| {
        RepoInputError::new(format!(
            "agent-guardrails: Failed to parse JSON at {}: {}",
            path.display(),
            cause
        ))
    })?;

    if !parsed.is_object() {
        return Err(RepoInputError::new(format!(
            "agent-guardrails: JSON at {} must be a JSON object, got {}.",
            path.display(),
            json_type_name(&parsed)
        )));
    }

    Ok(parsed)
}

pub fn read_config(repo_root: &Path) -> RepoInputResult<Option<Value>> {
    let config_path = repo_root.join(".agent-guardrails").join("config.json");
    if !config_path.exists() {
        return Ok(None);
    }

    read_json_object(&config_path).map(Some).map_err(|error| {
        RepoInputError::new(format!(
            "agent-guardrails: Failed to parse config at {}: {}",
            config_path.display(),
            strip_prefix_message(&error.to_string())
        ))
    })
}

pub fn resolve_task_contract_path(repo_root: &Path, custom_path: Option<&str>) -> PathBuf {
    repo_root.join(custom_path.unwrap_or(DEFAULT_TASK_CONTRACT_PATH))
}

pub fn read_task_contract(
    repo_root: &Path,
    custom_path: Option<&str>,
) -> RepoInputResult<Option<TaskContract>> {
    let contract_path = resolve_task_contract_path(repo_root, custom_path);
    if !contract_path.exists() {
        return Ok(None);
    }

    let value = read_json_object(&contract_path).map_err(|error| {
        RepoInputError::new(format!(
            "agent-guardrails: Failed to parse task contract at {}: {}",
            contract_path.display(),
            strip_prefix_message(&error.to_string())
        ))
    })?;

    let object = value
        .as_object()
        .expect("read_json_object guarantees object");
    Ok(Some(TaskContract::from_object(object, &contract_path)?))
}

impl TaskContract {
    fn from_object(object: &Map<String, Value>, contract_path: &Path) -> RepoInputResult<Self> {
        let schema_version = object
            .get("schemaVersion")
            .and_then(Value::as_i64)
            .unwrap_or(1);

        let known = known_task_contract_fields();
        let extra = object
            .iter()
            .filter(|(key, _)| !known.contains(&key.as_str()))
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect();

        Ok(Self {
            schema_version,
            task: ensure_string_or_empty(object.get("task"), "task", contract_path)?,
            preset: ensure_string_or_empty(object.get("preset"), "preset", contract_path)?,
            created_at: object.get("createdAt").cloned(),
            allowed_paths: ensure_array(object.get("allowedPaths"), "allowedPaths", contract_path)?,
            required_commands: ensure_array(
                object.get("requiredCommands"),
                "requiredCommands",
                contract_path,
            )?,
            evidence_paths: ensure_array(
                object.get("evidencePaths"),
                "evidencePaths",
                contract_path,
            )?,
            intended_files: ensure_array(
                object.get("intendedFiles"),
                "intendedFiles",
                contract_path,
            )?,
            protected_paths: ensure_array(
                object.get("protectedPaths"),
                "protectedPaths",
                contract_path,
            )?,
            allowed_change_types: ensure_array(
                object.get("allowedChangeTypes"),
                "allowedChangeTypes",
                contract_path,
            )?,
            risk_level: object.get("riskLevel").cloned(),
            requires_review_notes: object
                .get("requiresReviewNotes")
                .map(js_truthy)
                .unwrap_or(false),
            validation_profile: ensure_string_or_empty(
                object.get("validationProfile"),
                "validationProfile",
                contract_path,
            )?
            .if_empty("standard"),
            security_requirements: ensure_array(
                object.get("securityRequirements"),
                "securityRequirements",
                contract_path,
            )?,
            dependency_requirements: ensure_array(
                object.get("dependencyRequirements"),
                "dependencyRequirements",
                contract_path,
            )?,
            performance_requirements: ensure_array(
                object.get("performanceRequirements"),
                "performanceRequirements",
                contract_path,
            )?,
            understanding_requirements: ensure_array(
                object.get("understandingRequirements"),
                "understandingRequirements",
                contract_path,
            )?,
            continuity_requirements: ensure_array(
                object.get("continuityRequirements"),
                "continuityRequirements",
                contract_path,
            )?,
            acknowledged_skips: ensure_array(
                object.get("acknowledgedSkips"),
                "acknowledgedSkips",
                contract_path,
            )?,
            pattern_summary: ensure_string_or_empty(
                object.get("patternSummary"),
                "patternSummary",
                contract_path,
            )?,
            smallest_viable_change: ensure_string_or_empty(
                object.get("smallestViableChange"),
                "smallestViableChange",
                contract_path,
            )?,
            assumptions: ensure_array(object.get("assumptions"), "assumptions", contract_path)?,
            acceptance_criteria: ensure_array(
                object.get("acceptanceCriteria"),
                "acceptanceCriteria",
                contract_path,
            )?,
            non_goals: ensure_array(object.get("nonGoals"), "nonGoals", contract_path)?,
            expected_behavior_changes: ensure_array(
                object.get("expectedBehaviorChanges"),
                "expectedBehaviorChanges",
                contract_path,
            )?,
            user_visible_effects: ensure_array(
                object.get("userVisibleEffects"),
                "userVisibleEffects",
                contract_path,
            )?,
            intended_symbols: ensure_array(
                object.get("intendedSymbols"),
                "intendedSymbols",
                contract_path,
            )?,
            expected_public_surface_changes: ensure_array(
                object.get("expectedPublicSurfaceChanges"),
                "expectedPublicSurfaceChanges",
                contract_path,
            )?,
            expected_boundary_exceptions: ensure_array(
                object.get("expectedBoundaryExceptions"),
                "expectedBoundaryExceptions",
                contract_path,
            )?,
            expected_test_targets: ensure_array(
                object.get("expectedTestTargets"),
                "expectedTestTargets",
                contract_path,
            )?,
            production_profile: ensure_string_or_empty(
                object.get("productionProfile"),
                "productionProfile",
                contract_path,
            )?,
            nfr_requirements: ensure_array(
                object.get("nfrRequirements"),
                "nfrRequirements",
                contract_path,
            )?,
            expected_load_sensitive_paths: ensure_array(
                object.get("expectedLoadSensitivePaths"),
                "expectedLoadSensitivePaths",
                contract_path,
            )?,
            expected_concurrency_impact: ensure_string_or_empty(
                object.get("expectedConcurrencyImpact"),
                "expectedConcurrencyImpact",
                contract_path,
            )?,
            observability_requirements: ensure_array(
                object.get("observabilityRequirements"),
                "observabilityRequirements",
                contract_path,
            )?,
            rollback_notes: ensure_string_or_empty(
                object.get("rollbackNotes"),
                "rollbackNotes",
                contract_path,
            )?,
            risk_justification: ensure_string_or_empty(
                object.get("riskJustification"),
                "riskJustification",
                contract_path,
            )?,
            extra,
        })
    }
}

trait EmptyDefault {
    fn if_empty(self, default: &str) -> String;
}

impl EmptyDefault for String {
    fn if_empty(self, default: &str) -> String {
        if self.is_empty() {
            default.to_string()
        } else {
            self
        }
    }
}

fn ensure_array(
    value: Option<&Value>,
    field_name: &str,
    contract_path: &Path,
) -> RepoInputResult<Vec<Value>> {
    match value {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(items)) => Ok(items.clone()),
        Some(other) => Err(RepoInputError::new(format!(
            "agent-guardrails: Task contract field \"{}\" must be an array, got {} (in {}).",
            field_name,
            json_type_name(other),
            contract_path.display()
        ))),
    }
}

fn ensure_string_or_empty(
    value: Option<&Value>,
    field_name: &str,
    contract_path: &Path,
) -> RepoInputResult<String> {
    match value {
        None | Some(Value::Null) => Ok(String::new()),
        Some(Value::String(text)) => Ok(text.clone()),
        Some(other) => Err(RepoInputError::new(format!(
            "agent-guardrails: Task contract field \"{}\" must be a string, got {} (in {}).",
            field_name,
            json_type_name(other),
            contract_path.display()
        ))),
    }
}

fn json_type_name(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
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

fn strip_prefix_message(message: &str) -> &str {
    message
        .strip_prefix("agent-guardrails: ")
        .unwrap_or(message)
}

fn known_task_contract_fields() -> &'static [&'static str] {
    &[
        "schemaVersion",
        "task",
        "preset",
        "createdAt",
        "allowedPaths",
        "requiredCommands",
        "evidencePaths",
        "intendedFiles",
        "protectedPaths",
        "allowedChangeTypes",
        "riskLevel",
        "requiresReviewNotes",
        "validationProfile",
        "securityRequirements",
        "dependencyRequirements",
        "performanceRequirements",
        "understandingRequirements",
        "continuityRequirements",
        "acknowledgedSkips",
        "patternSummary",
        "smallestViableChange",
        "assumptions",
        "acceptanceCriteria",
        "nonGoals",
        "expectedBehaviorChanges",
        "userVisibleEffects",
        "intendedSymbols",
        "expectedPublicSurfaceChanges",
        "expectedBoundaryExceptions",
        "expectedTestTargets",
        "productionProfile",
        "nfrRequirements",
        "expectedLoadSensitivePaths",
        "expectedConcurrencyImpact",
        "observabilityRequirements",
        "rollbackNotes",
        "riskJustification",
    ]
}
