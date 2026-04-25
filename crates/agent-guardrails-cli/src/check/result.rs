use super::context::{EvidenceSummary, ProtectedAreaMatch};
use super::{CheckContextSnapshot, Finding, FindingStore, Review, build_review};
use crate::repo::TaskContract;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckCounts {
    pub changed_files: usize,
    pub source_files: usize,
    pub test_files: usize,
    pub allowed_paths: usize,
    pub out_of_scope_files: usize,
    pub task_allowed_paths: usize,
    pub out_of_task_scope_files: usize,
    pub intended_files: usize,
    pub out_of_intended_files: usize,
    pub protected_path_matches: usize,
    pub protected_area_matches: usize,
    pub commands_run: usize,
    pub required_commands: usize,
    pub missing_required_commands: usize,
    pub evidence_paths: usize,
    pub missing_evidence_paths: usize,
    pub loaded_plugins: usize,
    pub missing_plugins: usize,
    pub findings: usize,
    pub warnings: usize,
    pub failures: usize,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckLimits {
    pub max_files_per_task: f64,
    pub max_top_level_entries: f64,
    pub require_tests_with_source_changes: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckResult {
    pub ok: bool,
    pub verdict: String,
    pub score: f64,
    pub score_verdict: String,
    pub go_live_decision: Option<Value>,
    pub go_live_report: Option<Value>,
    pub proof_plan: Option<Value>,
    pub proof_recipe: Option<Value>,
    pub proof_memory_context: Option<Value>,
    pub preset: String,
    pub diff_source: String,
    pub base_ref: Option<String>,
    pub plugins: Vec<Value>,
    pub counts: CheckCounts,
    pub limits: CheckLimits,
    pub required_paths: Vec<String>,
    pub contract_path: Option<String>,
    pub changed_files: Vec<String>,
    pub source_files: Vec<String>,
    pub test_files: Vec<String>,
    pub top_level_entries: Vec<String>,
    pub changed_file_types: Vec<String>,
    pub change_types: BTreeMap<String, String>,
    pub allowed_paths: Vec<Value>,
    pub out_of_scope_files: Vec<String>,
    pub task_contract: Option<TaskContract>,
    pub task_allowed_paths: Vec<Value>,
    pub out_of_task_scope_files: Vec<String>,
    pub intended_files: Vec<Value>,
    pub out_of_intended_files: Vec<String>,
    pub protected_path_matches: Vec<String>,
    pub protected_area_matches: Vec<ProtectedAreaMatch>,
    pub commands_run: Vec<String>,
    pub required_commands: Vec<String>,
    pub missing_required_commands: Vec<String>,
    pub evidence_paths: Vec<String>,
    pub missing_evidence_paths: Vec<String>,
    pub evidence_summary: EvidenceSummary,
    pub findings: Vec<Finding>,
    pub review: Review,
    pub continuity: Value,
    pub deploy_readiness: Value,
    pub post_deploy_maintenance: Value,
    pub finish_check: Value,
    pub runtime: Value,
    pub warnings: Vec<String>,
    pub failures: Vec<String>,
}

pub fn build_check_result_from_context(
    context: &CheckContextSnapshot,
    store: FindingStore,
) -> CheckResult {
    let weights = scoring_weights_map(context);
    let review = build_review(&store.findings, Some(&weights));
    let ok = store.failures.is_empty();
    let verdict = if ok && store.warnings.is_empty() {
        "All checks passed".to_string()
    } else if ok {
        "Warnings found".to_string()
    } else {
        "Validation incomplete".to_string()
    };

    CheckResult {
        ok,
        verdict,
        score: review.score,
        score_verdict: review.score_verdict.clone(),
        go_live_decision: None,
        go_live_report: None,
        proof_plan: None,
        proof_recipe: None,
        proof_memory_context: None,
        preset: context
            .config
            .get("preset")
            .and_then(Value::as_str)
            .unwrap_or("generic")
            .to_string(),
        diff_source: context.diff_source.clone(),
        base_ref: context.base_ref.clone(),
        plugins: Vec::new(),
        counts: CheckCounts {
            changed_files: context.changed_files.len(),
            source_files: context.source_files.len(),
            test_files: context.test_files.len(),
            allowed_paths: context.allowed_paths.len(),
            out_of_scope_files: context.out_of_scope_files.len(),
            task_allowed_paths: context.task_allowed_paths.len(),
            out_of_task_scope_files: context.out_of_task_scope_files.len(),
            intended_files: context.intended_files.len(),
            out_of_intended_files: context.out_of_intended_files.len(),
            protected_path_matches: context.protected_path_matches.len(),
            protected_area_matches: context.config_protected_area_matches.len(),
            commands_run: context.commands_run.len(),
            required_commands: context.required_commands.len(),
            missing_required_commands: context.missing_required_commands.len(),
            evidence_paths: context.evidence_paths.len(),
            missing_evidence_paths: context.missing_evidence_paths.len(),
            loaded_plugins: 0,
            missing_plugins: 0,
            findings: store.findings.len(),
            warnings: store.warnings.len(),
            failures: store.failures.len(),
        },
        limits: CheckLimits {
            max_files_per_task: context.policy.consistency.max_changed_files_per_task,
            max_top_level_entries: context.policy.consistency.max_top_level_entries,
            require_tests_with_source_changes: context
                .policy
                .correctness
                .require_tests_with_source_changes,
        },
        required_paths: context.required_paths.clone(),
        contract_path: context
            .task_contract
            .as_ref()
            .map(|_| context.contract_path.clone()),
        changed_files: context.changed_files.clone(),
        source_files: context.source_files.clone(),
        test_files: context.test_files.clone(),
        top_level_entries: context.top_level_entries.clone(),
        changed_file_types: unique_changed_file_types(context),
        change_types: context.change_types.clone(),
        allowed_paths: context.allowed_paths.clone(),
        out_of_scope_files: context.out_of_scope_files.clone(),
        task_contract: context.task_contract.clone(),
        task_allowed_paths: context.task_allowed_paths.clone(),
        out_of_task_scope_files: context.out_of_task_scope_files.clone(),
        intended_files: context.intended_files.clone(),
        out_of_intended_files: context.out_of_intended_files.clone(),
        protected_path_matches: context.protected_path_matches.clone(),
        protected_area_matches: context.config_protected_area_matches.clone(),
        commands_run: context.commands_run.clone(),
        required_commands: context.required_commands.clone(),
        missing_required_commands: context.missing_required_commands.clone(),
        evidence_paths: context.evidence_paths.clone(),
        missing_evidence_paths: context.missing_evidence_paths.clone(),
        evidence_summary: context.evidence_summary.clone(),
        findings: store.findings,
        review,
        continuity: Value::Null,
        deploy_readiness: Value::Null,
        post_deploy_maintenance: Value::Null,
        finish_check: Value::Null,
        runtime: Value::Null,
        warnings: store.warnings,
        failures: store.failures,
    }
}

fn scoring_weights_map(context: &CheckContextSnapshot) -> HashMap<String, f64> {
    HashMap::from([
        ("scope".to_string(), context.policy.scoring.weights.scope),
        (
            "validation".to_string(),
            context.policy.scoring.weights.validation,
        ),
        (
            "consistency".to_string(),
            context.policy.scoring.weights.consistency,
        ),
        (
            "continuity".to_string(),
            context.policy.scoring.weights.continuity,
        ),
        (
            "performance".to_string(),
            context.policy.scoring.weights.performance,
        ),
        ("risk".to_string(), context.policy.scoring.weights.risk),
    ])
}

fn unique_changed_file_types(context: &CheckContextSnapshot) -> Vec<String> {
    let mut seen = Vec::<String>::new();
    for file_path in &context.changed_files {
        let Some(change_type) = context.change_types.get(file_path) else {
            continue;
        };
        if !seen.iter().any(|item| item == change_type) {
            seen.push(change_type.clone());
        }
    }
    seen
}
