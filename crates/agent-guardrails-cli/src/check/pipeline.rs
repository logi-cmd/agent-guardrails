use super::{CheckContextSnapshot, Finding};
use crate::diff::{is_path_within_allowed_scope, normalize_change_type};
use serde_json::Value;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FindingStore {
    pub findings: Vec<Finding>,
    pub failures: Vec<String>,
    pub warnings: Vec<String>,
}

impl FindingStore {
    pub fn add(&mut self, finding: Finding) {
        if finding.severity == "error" {
            self.failures.push(finding.message.clone());
        } else {
            self.warnings.push(finding.message.clone());
        }
        self.findings.push(finding);
    }
}

pub fn run_oss_detectors(context: &CheckContextSnapshot) -> FindingStore {
    let mut store = FindingStore::default();

    detect_required_files(context, &mut store);
    detect_diff_availability(context, &mut store);
    detect_consistency_budgets(context, &mut store);
    detect_continuity_mvp(context, &mut store);
    detect_scope_and_contract(context, &mut store);
    detect_validation_baseline(context, &mut store);
    detect_protected_areas(context, &mut store);
    detect_change_types_and_risk_surfaces(context, &mut store);
    detect_production_profile_and_nfr(context, &mut store);
    detect_state_management_complexity(context, &mut store);
    detect_performance_degradation(context, &mut store);
    detect_async_logic_risk(context, &mut store);
    detect_mutation_test_quality(context, &mut store);
    detect_hardcoded_secrets(context, &mut store);
    detect_unsafe_patterns(context, &mut store);
    detect_sensitive_file_change(context, &mut store);
    detect_big_bang_warning(context, &mut store);

    store
}

fn detect_required_files(context: &CheckContextSnapshot, store: &mut FindingStore) {
    for relative_path in &context.required_paths {
        if context
            .required_path_status
            .get(relative_path)
            .copied()
            .unwrap_or(false)
        {
            continue;
        }

        store.add(
            Finding::new(
                "error",
                "validation",
                "missing-required-file",
                format!("Required project file is missing: {relative_path}"),
            )
            .with_action(format!("Restore {relative_path} before shipping."))
            .with_files([relative_path]),
        );
    }
}

fn detect_diff_availability(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if context.diff_fallback {
        store.add(
            Finding::new(
                "warning",
                "diff",
                "base-ref-fallback",
                context.diff_fallback_reason.clone().unwrap_or_else(|| {
                    "Base ref was not available, so agent-guardrails fell back to the working-tree diff.".to_string()
                }),
            )
            .with_action("Fetch or push the base branch before relying on baseline comparison."),
        );
    }

    if context.changed_files.is_empty() {
        store.add(
            Finding::new(
                "warning",
                "validation",
                "no-changes-detected",
                "No changed files were detected.".to_string(),
            )
            .with_action("Run agent-guardrails after making the change."),
        );
    }
}

fn detect_consistency_budgets(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if context.changed_files.len() as f64 > context.policy.consistency.max_changed_files_per_task {
        store.add(
            Finding::new(
                "warning",
                "consistency",
                "changed-file-budget-exceeded",
                format!(
                    "Changed {} files, above the configured task budget of {}.",
                    context.changed_files.len(),
                    context.policy.consistency.max_changed_files_per_task
                ),
            )
            .with_action("Split the change into a smaller task.")
            .with_files(&context.changed_files)
            .with_skip_key("breadth"),
        );
    }

    if context.policy.consistency.warn_on_broad_changes
        && context.top_level_entries.len() as f64 > context.policy.consistency.max_top_level_entries
    {
        store.add(
            Finding::new(
                "warning",
                "consistency",
                "broad-top-level-change",
                format!(
                    "Changed {} top-level areas: {}.",
                    context.top_level_entries.len(),
                    context.top_level_entries.join(", ")
                ),
            )
            .with_action("Tighten the task boundary or split the work.")
            .with_files(&context.changed_files)
            .with_skip_key("breadth"),
        );
    }

    if !context.intended_files.is_empty()
        && context.policy.consistency.warn_on_broad_changes
        && context.changed_files.len()
            > usize::max(
                2,
                (context.intended_files.len() as f64
                    * context.policy.consistency.max_breadth_multiplier) as usize,
            )
    {
        store.add(
            Finding::new(
                "warning",
                "consistency",
                "task-breadth-suspicious",
                format!(
                    "Changed {} files for {} intended files.",
                    context.changed_files.len(),
                    context.intended_files.len()
                ),
            )
            .with_action("Check whether the task widened beyond the intended target.")
            .with_files(&context.changed_files)
            .with_skip_key("breadth"),
        );
    }

    if !context.out_of_scope_files.is_empty()
        && context.out_of_scope_files.len() as f64 <= context.policy.scope.violation_budget
    {
        store.add(
            Finding::new(
                "warning",
                "scope",
                "minor-scope-violation",
                format!(
                    "Some files are outside the configured scope: {}.",
                    context.out_of_scope_files.join(", ")
                ),
            )
            .with_action("Narrow the scope or acknowledge why these files belong in this task.")
            .with_files(&context.out_of_scope_files),
        );
    }
}

fn detect_continuity_mvp(context: &CheckContextSnapshot, store: &mut FindingStore) {
    let intended_files = context
        .intended_files
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect::<Vec<_>>();

    if !intended_files.is_empty() {
        let intended_file_set = intended_files
            .iter()
            .map(String::as_str)
            .collect::<HashSet<_>>();

        let implementation_like_extras = context
            .changed_files
            .iter()
            .filter(|file_path| !intended_file_set.contains(file_path.as_str()))
            .filter(|file_path| {
                context
                    .change_types
                    .get(*file_path)
                    .is_some_and(|kind| kind == "implementation" || kind == "interface")
            })
            .cloned()
            .collect::<Vec<_>>();

        if !implementation_like_extras.is_empty() {
            store.add(
                Finding::new(
                    "warning",
                    "consistency",
                    "continuity-breadth-warning",
                    format!(
                        "Implementation-like files changed outside intendedFiles: {}.",
                        implementation_like_extras.join(", ")
                    ),
                )
                .with_action("Keep the maintenance surface tight or update intendedFiles.")
                .with_files(implementation_like_extras.clone()),
            );
        }

        let mut intended_scopes = BTreeMap::<String, Vec<String>>::new();
        for file_path in &intended_files {
            let Some(scope) = parent_scope(file_path) else {
                continue;
            };
            intended_scopes
                .entry(scope)
                .or_default()
                .push(file_path.clone());
        }

        for file_path in &implementation_like_extras {
            let Some(scope) = parent_scope(file_path) else {
                continue;
            };
            let Some(reuse_targets) = intended_scopes.get(&scope) else {
                continue;
            };
            if !looks_like_parallel_abstraction(file_path) {
                continue;
            }

            let mut files = vec![file_path.clone()];
            files.extend(reuse_targets.clone());
            store.add(
                Finding::new(
                    "warning",
                    "consistency",
                    "continuity-parallel-abstraction",
                    format!("Parallel abstraction likely: {file_path}."),
                )
                .with_action(format!(
                    "Prefer extending these existing files first: {}.",
                    reuse_targets.join(", ")
                ))
                .with_files(files),
            );
        }
    }

    if context.task_contract.as_ref().is_some_and(|contract| {
        !contract.continuity_requirements.is_empty()
            && (!context.config_protected_area_matches.is_empty()
                || !context.protected_path_matches.is_empty())
    }) {
        let mut files = context
            .config_protected_area_matches
            .iter()
            .flat_map(|area| area.files.clone())
            .collect::<Vec<_>>();
        files.extend(
            context
                .changed_files
                .iter()
                .filter(|file_path| {
                    context.protected_path_matches.iter().any(|scope| {
                        is_path_within_allowed_scope(file_path, scope, &context.repo_root)
                    })
                })
                .cloned(),
        );
        let files = unique_strings(&files);
        store.add(
            Finding::new(
                "warning",
                "risk",
                "continuity-sensitive-structure-change",
                "Continuity requirements overlap with protected structure changes.".to_string(),
            )
            .with_action("Preserve the existing structure or document the continuity break.")
            .with_files(files),
        );
    }
}

fn detect_scope_and_contract(context: &CheckContextSnapshot, store: &mut FindingStore) {
    let scope_severity = context.policy.scope.violation_severity.as_str();

    if !context.allowed_paths.is_empty() && !context.out_of_scope_files.is_empty() {
        store.add(
            Finding::new(
                scope_severity,
                "scope",
                "repo-allowed-path-violation",
                format!(
                    "Files are outside the repository allowed paths: {}.",
                    context.out_of_scope_files.join(", ")
                ),
            )
            .with_action("Keep this task inside the repository allowed paths.")
            .with_files(&context.out_of_scope_files)
            .with_skip_key("scope"),
        );
    }

    if !context.task_allowed_paths.is_empty() && !context.out_of_task_scope_files.is_empty() {
        store.add(
            Finding::new(
                scope_severity,
                "scope",
                "task-path-violation",
                format!(
                    "Files are outside the task allowed paths: {}.",
                    context.out_of_task_scope_files.join(", ")
                ),
            )
            .with_action("Revise the task contract or keep the change inside the task path.")
            .with_files(&context.out_of_task_scope_files)
            .with_skip_key("scope"),
        );
    }

    if !context.intended_files.is_empty() && !context.out_of_intended_files.is_empty() {
        store.add(
            Finding::new(
                scope_severity,
                "scope",
                "intended-file-violation",
                format!(
                    "Files are outside the intended file list: {}.",
                    context.out_of_intended_files.join(", ")
                ),
            )
            .with_action("Update intendedFiles or narrow the change.")
            .with_files(&context.out_of_intended_files)
            .with_skip_key("scope"),
        );
    }

    if !context.protected_path_matches.is_empty() {
        let protected_files = context
            .changed_files
            .iter()
            .filter(|file_path| {
                context
                    .protected_path_matches
                    .iter()
                    .any(|scope| is_path_within_allowed_scope(file_path, scope, &context.repo_root))
            })
            .cloned()
            .collect::<Vec<_>>();

        store.add(
            Finding::new(
                "warning",
                "risk",
                "task-protected-paths-touched",
                format!(
                    "Task protected paths touched: {}.",
                    context.protected_path_matches.join(", ")
                ),
            )
            .with_action("Keep evidence explicit for protected paths.")
            .with_files(protected_files),
        );
    }
}

fn detect_validation_baseline(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if context.policy.correctness.require_commands_reported
        && !context.missing_required_commands.is_empty()
    {
        store.add(
            Finding::new(
                if has_skip_acknowledgement(context, "commands") {
                    "warning"
                } else {
                    "error"
                },
                "validation",
                "missing-required-commands",
                format!(
                    "Missing required commands: {}.",
                    context.missing_required_commands.join(", ")
                ),
            )
            .with_action("Run and report the missing commands.")
            .with_skip_key("commands"),
        );
    }

    if context.policy.correctness.require_evidence_files
        && !context.missing_evidence_paths.is_empty()
    {
        store.add(
            Finding::new(
                if has_skip_acknowledgement(context, "evidence") {
                    "warning"
                } else {
                    "error"
                },
                "validation",
                "missing-evidence-files",
                format!(
                    "Missing evidence files: {}.",
                    context.missing_evidence_paths.join(", ")
                ),
            )
            .with_action("Create the evidence file or update the task contract.")
            .with_files(&context.missing_evidence_paths)
            .with_skip_key("evidence"),
        );
    }

    if context.policy.correctness.require_tests_with_source_changes
        && !context.source_files.is_empty()
        && context.test_files.is_empty()
    {
        store.add(
            Finding::new(
                if has_skip_acknowledgement(context, "tests") {
                    "warning"
                } else {
                    "error"
                },
                "validation",
                "source-without-tests",
                "Source files changed without matching test changes.".to_string(),
            )
            .with_action("Add or update tests for the changed source files.")
            .with_files(&context.source_files)
            .with_skip_key("tests"),
        );
    }
}

fn detect_protected_areas(context: &CheckContextSnapshot, store: &mut FindingStore) {
    for area in &context.config_protected_area_matches {
        let current_risk_level = context
            .task_contract
            .as_ref()
            .and_then(|contract| contract.risk_level.as_ref())
            .and_then(Value::as_str)
            .unwrap_or_default();
        let minimum_risk_level = area.minimum_risk_level.as_deref().unwrap_or_default();

        if severity_rank(minimum_risk_level) > 0
            && severity_rank(current_risk_level) < severity_rank(minimum_risk_level)
        {
            store.add(
                Finding::new(
                    "error",
                    "risk",
                    "protected-area-risk-level-too-low",
                    format!("Risk level is too low for protected area {}.", area.label),
                )
                .with_action(format!("Raise riskLevel to {minimum_risk_level}."))
                .with_files(&area.files),
            );
        } else {
            store.add(
                Finding::new(
                    "warning",
                    "risk",
                    "protected-area-touched",
                    format!("Protected area touched: {}.", area.label),
                )
                .with_action(&area.action)
                .with_files(&area.files),
            );
        }

        let requires_review_notes = area.requires_review_notes
            || context.policy.risk.require_review_notes_for_protected_areas;
        if requires_review_notes && !context.evidence_summary.has_review_notes {
            store.add(
                Finding::new(
                    "error",
                    "risk",
                    "protected-area-missing-review-notes",
                    format!("Protected area {} is missing review notes.", area.label),
                )
                .with_action("Add review notes before shipping.")
                .with_files(&area.files),
            );
        }
    }

    if context
        .task_contract
        .as_ref()
        .is_some_and(|contract| contract.requires_review_notes)
        && !context.evidence_summary.has_review_notes
    {
        store.add(
            Finding::new(
                "error",
                "risk",
                "task-missing-review-notes",
                "Task requires review notes, but evidence does not include them.".to_string(),
            )
            .with_action("Update evidence with review notes and residual risk.")
            .with_files(&context.evidence_paths),
        );
    }
}

fn detect_change_types_and_risk_surfaces(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if !context.allowed_change_types.is_empty() {
        let normalized_allowed = context
            .allowed_change_types
            .iter()
            .flat_map(|item| {
                if item == "implementation-only" {
                    vec!["implementation", "tests", "docs"]
                } else if item == "interface-changing" {
                    vec!["implementation", "interface", "tests", "docs"]
                } else {
                    vec![item.as_str()]
                }
            })
            .map(normalize_change_type)
            .collect::<Vec<_>>();
        let disallowed_files = context
            .changed_files
            .iter()
            .filter(|file_path| {
                context
                    .change_types
                    .get(*file_path)
                    .is_none_or(|kind| !normalized_allowed.iter().any(|allowed| allowed == kind))
            })
            .cloned()
            .collect::<Vec<_>>();

        if !disallowed_files.is_empty() {
            store.add(
                Finding::new(
                    "error",
                    "scope",
                    "change-type-violation",
                    format!(
                        "Changed files do not match allowed change types {}: {}.",
                        context.allowed_change_types.join(", "),
                        disallowed_files.join(", ")
                    ),
                )
                .with_action("Tighten the implementation change type or revise the task contract.")
                .with_files(disallowed_files),
            );
        }
    } else if context
        .policy
        .risk
        .warn_on_interface_changes_without_contract
        && !context.interface_like_files.is_empty()
    {
        store.add(
            Finding::new(
                "warning",
                "risk",
                "interface-change-without-contract",
                format!(
                    "Interface-like files changed without an explicit contract: {}.",
                    context.interface_like_files.join(", ")
                ),
            )
            .with_action("Declare whether this is implementation-only or interface-changing work.")
            .with_files(&context.interface_like_files),
        );
    }

    if context.policy.risk.warn_on_config_or_migration_changes
        && !context.config_or_migration_files.is_empty()
    {
        store.add(
            Finding::new(
                "warning",
                "risk",
                "config-or-migration-change",
                format!(
                    "Configuration or migration files changed: {}.",
                    context.config_or_migration_files.join(", ")
                ),
            )
            .with_action("Confirm rollout, rollback, and environment impact.")
            .with_files(&context.config_or_migration_files),
        );
    }
}

fn detect_production_profile_and_nfr(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if context
        .task_contract
        .as_ref()
        .is_some_and(|contract| !contract.production_profile.is_empty())
        && context.task_nfr_requirements.is_empty()
    {
        store.add(
            Finding::new(
                "warning",
                "risk",
                "production-profile-missing-nfr",
                "Production profile is set, but no NFR requirements are declared.".to_string(),
            )
            .with_action("Declare relevant non-functional requirements."),
        );
    }

    if !context.critical_path_files.is_empty()
        && context
            .task_contract
            .as_ref()
            .is_none_or(|contract| contract.rollback_notes.is_empty())
    {
        store.add(
            Finding::new(
                "warning",
                "risk",
                "critical-path-without-rollback",
                format!(
                    "Critical path files changed without rollback notes: {}.",
                    context.critical_path_files.join(", ")
                ),
            )
            .with_action("Add rollback notes before release.")
            .with_files(&context.critical_path_files),
        );
    }

    if !context.performance_sensitive_files.is_empty() {
        store.add(
            Finding::new(
                "warning",
                "risk",
                "performance-sensitive-area-touched",
                format!(
                    "Performance-sensitive files changed: {}.",
                    context.performance_sensitive_files.join(", ")
                ),
            )
            .with_action("Validate the hot path or explain why no performance risk exists.")
            .with_files(&context.performance_sensitive_files),
        );
    }

    let evidence_text = context.evidence_summary.full_text.to_ascii_lowercase();
    if context
        .task_contract
        .as_ref()
        .is_some_and(|contract| !contract.observability_requirements.is_empty())
        && !contains_any(
            &evidence_text,
            &[
                "observability",
                "monitoring",
                "metric",
                "metrics",
                "logging",
                "log",
                "logs",
                "tracing",
                "trace",
            ],
        )
    {
        store.add(
            Finding::new(
                "warning",
                "validation",
                "observability-requirements-unaddressed",
                "Observability requirements are not addressed in evidence.".to_string(),
            )
            .with_action("Mention observability validation in the evidence."),
        );
    }

    if context.task_nfr_requirements.iter().any(|item| {
        matches!(
            item.to_ascii_lowercase().as_str(),
            "performance" | "concurrency" | "reliability"
        )
    }) && !contains_any(
        &evidence_text,
        &[
            "performance",
            "latency",
            "throughput",
            "load",
            "concurrency",
            "stress",
            "benchmark",
            "reliability",
        ],
    ) {
        store.add(
            Finding::new(
                "warning",
                "validation",
                "concurrency-requirements-unaddressed",
                "Performance, concurrency, or reliability requirements are not addressed in evidence.".to_string(),
            )
            .with_action("Mention performance or reliability validation in the evidence."),
        );
    }
}

fn detect_performance_degradation(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if !performance_check_enabled(context) {
        return;
    }

    let large_asset_bytes = context
        .config
        .get("checks")
        .and_then(|checks| checks.get("performance"))
        .and_then(|performance| performance.get("largeAssetBytes"))
        .and_then(Value::as_u64)
        .unwrap_or(256 * 1024);
    let large_assets = context
        .changed_files
        .iter()
        .filter(|file_path| is_large_asset_path(file_path))
        .filter(|file_path| {
            context
                .repo_root
                .join(file_path)
                .metadata()
                .is_ok_and(|metadata| metadata.len() >= large_asset_bytes)
        })
        .cloned()
        .collect::<Vec<_>>();

    for file_path in large_assets {
        store.add(
            Finding::new(
                "warning",
                "performance",
                "perf-degradation-large-asset",
                "Large asset was added or changed.".to_string(),
            )
            .with_action("Confirm the asset is optimized and necessary.")
            .with_files([file_path]),
        );
    }

    if context.total_added_lines > 500 {
        store.add(
            Finding::new(
                "warning",
                "performance",
                "perf-degradation-large-change",
                "Large line-count increase detected.".to_string(),
            )
            .with_action("Check whether the change should be split or benchmarked.")
            .with_files(&context.changed_files),
        );
    }
}

fn detect_big_bang_warning(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if has_skip_acknowledgement(context, "big-bang") {
        return;
    }
    if context.changed_files.len() <= 15 {
        return;
    }
    if context.top_level_entries.len() < 3 {
        return;
    }
    if context.total_added_lines <= 300 {
        return;
    }

    store.add(
        Finding::new(
            "warning",
            "consistency",
            "big-bang-change",
            format!(
                "Large broad change detected: {} files across {} top-level areas with {} added lines.",
                context.changed_files.len(),
                context.top_level_entries.len(),
                context.total_added_lines
            ),
        )
        .with_action("Split the change or document why this broad change must ship together.")
        .with_files(&context.changed_files)
        .with_skip_key("big-bang"),
    );
}

fn detect_state_management_complexity(context: &CheckContextSnapshot, store: &mut FindingStore) {
    let mut groups = BTreeMap::<String, Vec<String>>::new();
    for file_path in &context.changed_files {
        let Some(parent) = parent_scope(file_path) else {
            continue;
        };
        groups.entry(parent).or_default().push(file_path.clone());
    }

    for files in groups.values() {
        let unique_files = unique_strings(files);
        if unique_files.len() >= 3 {
            store.add(
                Finding::new(
                    "warning",
                    "continuity",
                    "state-mgmt-complexity-multi-file",
                    "Several files changed in the same state-management area.".to_string(),
                )
                .with_action("Review whether the existing state pattern can be extended instead.")
                .with_files(unique_files),
            );
        }
    }

    let state_keywords = ["state", "store", "reducer", "usecontext", "hook", "hooks"];
    for file_path in &context.changed_files {
        let lower = file_path.to_ascii_lowercase();
        if state_keywords.iter().any(|keyword| lower.contains(keyword)) {
            store.add(
                Finding::new(
                    "warning",
                    "continuity",
                    "state-mgmt-complexity-state-file",
                    format!("State-management file changed: {file_path}."),
                )
                .with_action("Review the state-management pattern before merging.")
                .with_files([file_path]),
            );
        }
    }
}

fn detect_hardcoded_secrets(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if !context.policy.security.enabled || !context.policy.security.hardcoded_secrets {
        return;
    }

    for file_path in context
        .changed_files
        .iter()
        .filter(|file_path| !is_test_like(file_path))
    {
        let labels = secret_labels_in_added_lines(&context.repo_root, file_path);
        if labels.is_empty() {
            continue;
        }

        store.add(
            Finding::new(
                "warning",
                "risk",
                "hardcoded-secrets",
                format!(
                    "Potential hardcoded secrets detected in {file_path}: {}.",
                    labels.join(", ")
                ),
            )
            .with_action("Move secrets to environment variables or a secret manager.")
            .with_files([file_path]),
        );
    }
}

fn detect_async_logic_risk(context: &CheckContextSnapshot, store: &mut FindingStore) {
    for file_path in context
        .changed_files
        .iter()
        .filter(|file_path| is_javascript_like_file(file_path))
    {
        let path = context.repo_root.join(file_path);
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };

        let then_count = content.matches(".then(").count() + content.matches(".then (").count();
        if then_count >= 3 {
            store.add(
                Finding::new(
                    "warning",
                    "continuity",
                    "async-risk-nested-then",
                    format!("Nested promise chaining detected {then_count} times in {file_path}."),
                )
                .with_action("Review whether async/await or clearer composition would be safer.")
                .with_files([file_path]),
            );
        }

        let lower = content.to_ascii_lowercase();
        if (lower.contains("for (") || lower.contains("while (") || lower.contains(".foreach("))
            && lower.contains("await ")
            && !content.contains("Promise.all")
            && !content.contains("Promise.allSettled")
        {
            store.add(
                Finding::new(
                    "warning",
                    "continuity",
                    "async-risk-await-in-loop",
                    format!("Await inside a loop detected in {file_path}."),
                )
                .with_action("Confirm this sequence is intentional or use bounded parallelism.")
                .with_files([file_path]),
            );
        }

        if content.contains(".catch(()") || content.contains(".catch( ()") {
            store.add(
                Finding::new(
                    "warning",
                    "continuity",
                    "async-risk-empty-catch",
                    format!("Empty catch handler detected in {file_path}."),
                )
                .with_action("Handle or report the error explicitly.")
                .with_files([file_path]),
            );
        }
    }
}

fn detect_mutation_test_quality(context: &CheckContextSnapshot, store: &mut FindingStore) {
    let mutation_config = context
        .config
        .get("checks")
        .and_then(|checks| checks.get("mutation"))
        .unwrap_or(&Value::Null);
    if !mutation_config
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return;
    }
    if context.source_files.is_empty() {
        return;
    }

    let Some(test_command) = mutation_config.get("testCommand").and_then(Value::as_str) else {
        return;
    };
    if !run_shell_command_ok(&context.repo_root, test_command) {
        store.add(
            Finding::new(
                "warning",
                "validation",
                "mutation-test-error",
                "Mutation test baseline command failed.".to_string(),
            )
            .with_action("Review mutation test configuration and baseline test command."),
        );
        return;
    }

    let max_mutations = mutation_config
        .get("maxMutations")
        .and_then(Value::as_u64)
        .unwrap_or(20) as usize;
    let threshold = mutation_config
        .get("survivalThreshold")
        .and_then(Value::as_f64)
        .unwrap_or(50.0);
    let mutations = generate_mutations(context, max_mutations);
    if mutations.is_empty() {
        return;
    }

    let mut killed = 0usize;
    let mut survived_files = Vec::<String>::new();
    for mutation in &mutations {
        if run_single_mutation(context, mutation, test_command) {
            killed += 1;
        } else if !survived_files
            .iter()
            .any(|file_path| file_path == &mutation.file_path)
        {
            survived_files.push(mutation.file_path.clone());
        }
    }

    let score = ((killed as f64 / mutations.len() as f64) * 100.0).round();
    if !survived_files.is_empty() && score < threshold {
        store.add(
            Finding::new(
                "warning",
                "validation",
                "mutation-survivors-detected",
                format!(
                    "{} mutation(s) survived out of {} (score {}).",
                    mutations.len() - killed,
                    mutations.len(),
                    score
                ),
            )
            .with_action("Review survived mutations and strengthen the relevant tests.")
            .with_files(survived_files),
        );
    }
}

fn detect_unsafe_patterns(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if !context.policy.security.enabled || !context.policy.security.unsafe_patterns {
        return;
    }

    for file_path in context
        .changed_files
        .iter()
        .filter(|file_path| is_code_file(file_path))
    {
        let labels = unsafe_labels_in_added_lines(&context.repo_root, file_path);
        if labels.is_empty() {
            continue;
        }

        store.add(
            Finding::new(
                "warning",
                "risk",
                "unsafe-patterns",
                format!(
                    "Unsafe code patterns detected in {file_path}: {}.",
                    labels.join(", ")
                ),
            )
            .with_action("Use a safer alternative before merging.")
            .with_files([file_path]),
        );
    }
}

fn detect_sensitive_file_change(context: &CheckContextSnapshot, store: &mut FindingStore) {
    if !context.policy.security.enabled || !context.policy.security.sensitive_files {
        return;
    }

    let sensitive_files = context
        .changed_files
        .iter()
        .filter(|file_path| looks_sensitive_file(file_path))
        .cloned()
        .collect::<Vec<_>>();

    if sensitive_files.is_empty() {
        return;
    }

    store.add(
        Finding::new(
            "warning",
            "risk",
            "sensitive-file-change",
            format!("Sensitive files changed: {}.", sensitive_files.join(", ")),
        )
        .with_action("Confirm no real credentials are committed and update .gitignore if needed.")
        .with_files(sensitive_files),
    );
}

fn looks_sensitive_file(file_path: &str) -> bool {
    let normalized = file_path.replace('\\', "/").to_ascii_lowercase();
    let file_name = normalized.rsplit('/').next().unwrap_or(normalized.as_str());
    file_name == ".env"
        || file_name.starts_with(".env.")
        || normalized.contains("credentials")
        || file_name.ends_with(".htpasswd")
        || file_name.ends_with(".pem")
        || file_name.ends_with(".key")
        || file_name.ends_with(".p12")
        || file_name.ends_with(".pfx")
        || file_name.ends_with(".jks")
        || normalized.contains("id_rsa")
        || normalized.contains("id_ed25519")
        || normalized.contains("id_ecdsa")
}

fn is_code_file(file_path: &str) -> bool {
    let lower = file_path.to_ascii_lowercase();
    [
        ".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx", ".py", ".rb", ".sh",
    ]
    .iter()
    .any(|extension| lower.ends_with(extension))
}

#[derive(Clone, Debug)]
struct MutationCandidate {
    file_path: String,
    line_number: usize,
    mutated_line: String,
}

fn generate_mutations(
    context: &CheckContextSnapshot,
    max_mutations: usize,
) -> Vec<MutationCandidate> {
    let mut mutations = Vec::new();
    for file_path in &context.source_files {
        if !is_mutation_supported_file(file_path) {
            continue;
        }
        let Ok(content) = fs::read_to_string(context.repo_root.join(file_path)) else {
            continue;
        };
        for (index, line) in content.lines().enumerate() {
            if mutations.len() >= max_mutations {
                return mutations;
            }
            if !is_mutatable_source_line(line) {
                continue;
            }
            if let Some(mutated_line) = mutate_line(line) {
                mutations.push(MutationCandidate {
                    file_path: file_path.clone(),
                    line_number: index,
                    mutated_line,
                });
            }
        }
    }

    mutations
}

fn run_single_mutation(
    context: &CheckContextSnapshot,
    mutation: &MutationCandidate,
    test_command: &str,
) -> bool {
    let absolute_path = context.repo_root.join(&mutation.file_path);
    let Ok(original_content) = fs::read_to_string(&absolute_path) else {
        return false;
    };

    let mut lines = original_content
        .lines()
        .map(ToString::to_string)
        .collect::<Vec<_>>();
    if mutation.line_number >= lines.len() {
        return false;
    }
    lines[mutation.line_number] = mutation.mutated_line.clone();
    let mutated_content = format!("{}\n", lines.join("\n"));

    let write_result = fs::write(&absolute_path, mutated_content);
    if write_result.is_err() {
        return false;
    }

    let killed = !run_shell_command_ok(&context.repo_root, test_command);
    let _ = fs::write(&absolute_path, original_content);
    killed
}

fn mutate_line(line: &str) -> Option<String> {
    if line.contains("true") {
        return Some(line.replacen("true", "false", 1));
    }
    if line.contains("false") {
        return Some(line.replacen("false", "true", 1));
    }
    for (from, to) in [
        ("===", "!=="),
        ("!==", "==="),
        (">=", "<="),
        ("<=", ">="),
        ("&&", "||"),
        ("||", "&&"),
    ] {
        if line.contains(from) {
            return Some(line.replacen(from, to, 1));
        }
    }
    let trimmed = line.trim_start();
    if trimmed.starts_with("return ") && !trimmed.starts_with("return 0") {
        let indent_len = line.len() - trimmed.len();
        return Some(format!("{}return 0;", &line[..indent_len]));
    }

    None
}

fn is_mutation_supported_file(file_path: &str) -> bool {
    let lower = file_path.to_ascii_lowercase();
    [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

fn is_mutatable_source_line(line: &str) -> bool {
    let trimmed = line.trim_start();
    !trimmed.is_empty()
        && !trimmed.starts_with("//")
        && !trimmed.starts_with('#')
        && !trimmed.starts_with("/*")
        && !trimmed.starts_with('*')
}

fn run_shell_command_ok(repo_root: &Path, command: &str) -> bool {
    let output = if cfg!(windows) {
        Command::new("cmd")
            .args(["/C", command])
            .current_dir(repo_root)
            .output()
    } else {
        Command::new("sh")
            .args(["-c", command])
            .current_dir(repo_root)
            .output()
    };

    output.is_ok_and(|output| output.status.success())
}

fn is_large_asset_path(file_path: &str) -> bool {
    let lower = file_path.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".mp4"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

fn performance_check_enabled(context: &CheckContextSnapshot) -> bool {
    context
        .config
        .get("checks")
        .and_then(|checks| checks.get("performance"))
        .and_then(|performance| performance.get("enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

fn contains_any(value: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| value.contains(needle))
}

fn is_javascript_like_file(file_path: &str) -> bool {
    let lower = file_path.to_ascii_lowercase();
    [".js", ".ts", ".mjs", ".cjs", ".jsx", ".tsx"]
        .iter()
        .any(|extension| lower.ends_with(extension))
}

fn is_test_like(file_path: &str) -> bool {
    let lower = file_path.to_ascii_lowercase();
    lower.contains("__tests__")
        || lower.contains("fixtures")
        || lower.contains("mock")
        || lower.contains(".test.")
        || lower.contains(".spec.")
}

fn secret_labels_in_added_lines(repo_root: &Path, file_path: &str) -> Vec<String> {
    let mut labels = Vec::new();
    for line in git_added_lines(repo_root, file_path) {
        let lower = line.to_ascii_lowercase();
        maybe_push_label(
            &mut labels,
            line.split(|character: char| !character.is_ascii_alphanumeric())
                .any(|token| token.starts_with("AKIA") && token.len() == 20),
            "AWS Access Key",
        );
        maybe_push_label(
            &mut labels,
            lower.contains("aws_secret_access_key"),
            "AWS Secret Key",
        );
        maybe_push_label(
            &mut labels,
            lower.contains("azure_client_secret"),
            "Azure Client Secret",
        );
        maybe_push_label(&mut labels, line.contains("AIza"), "GCP API Key");
        maybe_push_label(&mut labels, line.contains("sk-ant-"), "Anthropic API Key");
        maybe_push_label(
            &mut labels,
            has_secret_assignment(&lower, &["password", "passwd", "pwd"]),
            "Generic Password",
        );
        maybe_push_label(
            &mut labels,
            has_secret_assignment(&lower, &["api_key", "api-key", "apikey"]),
            "Generic API Key",
        );
        maybe_push_label(
            &mut labels,
            has_secret_assignment(&lower, &["secret", "token"]),
            "Generic Secret/Token",
        );
    }

    labels
}

fn has_secret_assignment(lower_line: &str, names: &[&str]) -> bool {
    names.iter().any(|name| lower_line.contains(name))
        && (lower_line.contains('=') || lower_line.contains(':'))
        && (lower_line.contains('"') || lower_line.contains('\''))
}

fn unsafe_labels_in_added_lines(repo_root: &Path, file_path: &str) -> Vec<String> {
    let mut labels = Vec::new();
    for line in git_added_lines(repo_root, file_path) {
        let lower = line.to_ascii_lowercase();
        maybe_push_label(&mut labels, line.contains("eval("), "eval()");
        maybe_push_label(
            &mut labels,
            lower.contains(".innerhtml") && line.contains('='),
            "innerHTML",
        );
        maybe_push_label(
            &mut labels,
            line.contains("dangerouslySetInnerHTML"),
            "dangerouslySetInnerHTML",
        );
        maybe_push_label(&mut labels, lower.contains("chmod 777"), "chmod 777");
        maybe_push_label(
            &mut labels,
            line.contains("execSync(") || line.contains("execFileSync("),
            "exec()",
        );
        maybe_push_label(
            &mut labels,
            line.contains("child_process.exec") || line.contains("subprocess.exec"),
            "subprocess.exec",
        );
        maybe_push_label(
            &mut labels,
            lower.contains("settimeout") && lower.contains(", 0"),
            "setTimeout(..., 0)",
        );
    }

    labels
}

fn maybe_push_label(labels: &mut Vec<String>, condition: bool, label: &str) {
    if condition && !labels.iter().any(|existing| existing == label) {
        labels.push(label.to_string());
    }
}

fn git_added_lines(repo_root: &Path, file_path: &str) -> Vec<String> {
    let mut diff = git_diff(repo_root, ["diff", "--cached", "--", file_path]);
    if diff.trim().is_empty() {
        diff = git_diff(repo_root, ["diff", "--", file_path]);
    }

    diff.lines()
        .filter(|line| line.starts_with('+') && !line.starts_with("+++"))
        .map(|line| line.trim_start_matches('+').to_string())
        .collect()
}

fn git_diff<const N: usize>(repo_root: &Path, args: [&str; N]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(repo_root)
        .output();

    let Ok(output) = output else {
        return String::new();
    };
    if !output.status.success() {
        return String::new();
    }

    String::from_utf8_lossy(&output.stdout).to_string()
}

fn has_skip_acknowledgement(context: &CheckContextSnapshot, key: &str) -> bool {
    context.task_contract.as_ref().is_some_and(|contract| {
        value_strings(&contract.acknowledged_skips)
            .iter()
            .any(|item| item == key)
    })
}

fn severity_rank(level: &str) -> u8 {
    match level.to_ascii_lowercase().as_str() {
        "low" => 1,
        "medium" => 2,
        "high" => 3,
        "critical" => 4,
        _ => 0,
    }
}

fn parent_scope(file_path: &str) -> Option<String> {
    let normalized = file_path.replace('\\', "/");
    normalized
        .rsplit_once('/')
        .map(|(parent, _)| parent.to_string())
        .filter(|parent| !parent.is_empty())
}

fn looks_like_parallel_abstraction(file_path: &str) -> bool {
    let normalized = file_path.replace('\\', "/").to_ascii_lowercase();
    let base_name = normalized.rsplit('/').next().unwrap_or(normalized.as_str());
    [
        "helper",
        "service",
        "hook",
        "util",
        "utils",
        "manager",
        "controller",
        "store",
        "client",
        "adapter",
    ]
    .iter()
    .any(|keyword| base_name.contains(keyword))
}

fn unique_strings(values: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .iter()
        .filter(|value| seen.insert((*value).clone()))
        .cloned()
        .collect()
}

fn value_strings(values: &[Value]) -> Vec<String> {
    values
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect()
}
