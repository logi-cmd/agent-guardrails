use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Policy {
    pub allowed_paths: Vec<Value>,
    pub consistency: ConsistencyPolicy,
    pub correctness: CorrectnessPolicy,
    pub risk: RiskPolicy,
    pub security: SecurityPolicy,
    pub scope: ScopePolicy,
    pub review: ReviewPolicy,
    pub scoring: ScoringPolicy,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsistencyPolicy {
    pub max_changed_files_per_task: f64,
    pub max_top_level_entries: f64,
    pub max_breadth_multiplier: f64,
    pub warn_on_broad_changes: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CorrectnessPolicy {
    pub require_tests_with_source_changes: bool,
    pub require_commands_reported: bool,
    pub require_evidence_files: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskPolicy {
    pub require_review_notes_for_protected_areas: bool,
    pub warn_on_interface_changes_without_contract: bool,
    pub warn_on_config_or_migration_changes: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityPolicy {
    pub enabled: bool,
    pub hardcoded_secrets: bool,
    pub unsafe_patterns: bool,
    pub sensitive_files: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopePolicy {
    pub violation_severity: String,
    pub violation_budget: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPolicy {
    pub include_evidence_summary: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringPolicy {
    pub enabled: bool,
    pub weights: ScoringWeights,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringWeights {
    pub scope: f64,
    pub validation: f64,
    pub consistency: f64,
    pub continuity: f64,
    pub performance: f64,
    pub risk: f64,
}

pub fn required_paths(config: &Value) -> Vec<String> {
    let configured = object_field(object_field(config, "checks"), "requiredPaths");
    if let Some(paths) = configured.as_array() {
        return paths
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|path| !path.is_empty())
            .map(ToString::to_string)
            .collect();
    }

    [
        "AGENTS.md",
        "docs/PROJECT_STATE.md",
        "docs/PR_CHECKLIST.md",
        ".agent-guardrails/config.json",
    ]
    .into_iter()
    .map(ToString::to_string)
    .collect()
}

pub fn build_policy(config: &Value) -> Policy {
    let checks = object_field(config, "checks");
    let consistency = object_field(checks, "consistency");
    let correctness = object_field(checks, "correctness");
    let risk = object_field(checks, "risk");
    let security = object_field(checks, "security");
    let scope = object_field(checks, "scope");
    let review = object_field(config, "review");
    let scoring = object_field(config, "scoring");
    let scoring_weights = object_field(scoring, "weights");

    Policy {
        allowed_paths: array_field(checks, "allowedPaths"),
        consistency: ConsistencyPolicy {
            max_changed_files_per_task: number_field(consistency, "maxChangedFilesPerTask")
                .or_else(|| number_field(checks, "maxChangedFilesPerTask"))
                .unwrap_or(20.0),
            max_top_level_entries: number_field(consistency, "maxTopLevelEntries").unwrap_or(3.0),
            max_breadth_multiplier: number_field(consistency, "maxBreadthMultiplier")
                .unwrap_or(2.0),
            warn_on_broad_changes: bool_field(consistency, "warnOnBroadChanges").unwrap_or(true),
        },
        correctness: CorrectnessPolicy {
            require_tests_with_source_changes: bool_field(
                correctness,
                "requireTestsWithSourceChanges",
            )
            .or_else(|| bool_field(checks, "requireTestsWithSourceChanges"))
            .unwrap_or(false),
            require_commands_reported: bool_field(correctness, "requireCommandsReported")
                .unwrap_or(true),
            require_evidence_files: bool_field(correctness, "requireEvidenceFiles").unwrap_or(true),
        },
        risk: RiskPolicy {
            require_review_notes_for_protected_areas: bool_field(
                risk,
                "requireReviewNotesForProtectedAreas",
            )
            .unwrap_or(true),
            warn_on_interface_changes_without_contract: bool_field(
                risk,
                "warnOnInterfaceChangesWithoutContract",
            )
            .unwrap_or(true),
            warn_on_config_or_migration_changes: bool_field(risk, "warnOnConfigOrMigrationChanges")
                .unwrap_or(true),
        },
        security: SecurityPolicy {
            enabled: bool_field(security, "enabled").unwrap_or(true),
            hardcoded_secrets: bool_field(security, "hardcodedSecrets").unwrap_or(true),
            unsafe_patterns: bool_field(security, "unsafePatterns").unwrap_or(true),
            sensitive_files: bool_field(security, "sensitiveFiles").unwrap_or(true),
        },
        scope: ScopePolicy {
            violation_severity: string_field(scope, "violationSeverity")
                .unwrap_or_else(|| "error".to_string()),
            violation_budget: number_field(scope, "violationBudget").unwrap_or(5.0),
        },
        review: ReviewPolicy {
            include_evidence_summary: bool_field(review, "includeEvidenceSummary").unwrap_or(true),
        },
        scoring: ScoringPolicy {
            enabled: bool_field(scoring, "enabled").unwrap_or(true),
            weights: resolve_scoring_weights(scoring_weights),
        },
    }
}

fn resolve_scoring_weights(weights: &Value) -> ScoringWeights {
    let mut resolved = ScoringWeights {
        scope: number_field(weights, "scope").unwrap_or(30.0),
        validation: number_field(weights, "validation").unwrap_or(25.0),
        consistency: number_field(weights, "consistency").unwrap_or(15.0),
        continuity: number_field(weights, "continuity").unwrap_or(10.0),
        performance: number_field(weights, "performance").unwrap_or(10.0),
        risk: number_field(weights, "risk").unwrap_or(10.0),
    };

    let sum = resolved.scope
        + resolved.validation
        + resolved.consistency
        + resolved.continuity
        + resolved.performance
        + resolved.risk;

    if sum != 100.0 && sum != 0.0 {
        let factor = 100.0 / sum;
        resolved.scope = round_one_decimal(resolved.scope * factor);
        resolved.validation = round_one_decimal(resolved.validation * factor);
        resolved.consistency = round_one_decimal(resolved.consistency * factor);
        resolved.continuity = round_one_decimal(resolved.continuity * factor);
        resolved.performance = round_one_decimal(resolved.performance * factor);
        resolved.risk = round_one_decimal(resolved.risk * factor);
    }

    resolved
}

fn object_field<'a>(value: &'a Value, key: &str) -> &'a Value {
    value
        .as_object()
        .and_then(|object| object.get(key))
        .unwrap_or(&Value::Null)
}

fn array_field(value: &Value, key: &str) -> Vec<Value> {
    object_field(value, key)
        .as_array()
        .cloned()
        .unwrap_or_default()
}

fn number_field(value: &Value, key: &str) -> Option<f64> {
    object_field(value, key).as_f64()
}

fn bool_field(value: &Value, key: &str) -> Option<bool> {
    object_field(value, key).as_bool()
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    object_field(value, key).as_str().map(ToString::to_string)
}

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
