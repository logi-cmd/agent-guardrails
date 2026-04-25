use agent_guardrails_cli::policy::{build_policy, required_paths};
use serde_json::json;

#[test]
fn required_paths_match_current_js_policy() {
    assert_eq!(
        required_paths(&json!({})),
        vec![
            "AGENTS.md",
            "docs/PROJECT_STATE.md",
            "docs/PR_CHECKLIST.md",
            ".agent-guardrails/config.json"
        ]
    );
}

#[test]
fn required_paths_can_be_overridden_for_public_repos() {
    assert_eq!(
        required_paths(&json!({
            "checks": {
                "requiredPaths": [".agent-guardrails/config.json", "  README.md  ", ""]
            }
        })),
        vec![".agent-guardrails/config.json", "README.md"]
    );
}

#[test]
fn default_policy_matches_current_js_defaults() {
    let policy = build_policy(&json!({}));

    assert!(policy.allowed_paths.is_empty());
    assert_eq!(policy.consistency.max_changed_files_per_task, 20.0);
    assert_eq!(policy.consistency.max_top_level_entries, 3.0);
    assert_eq!(policy.consistency.max_breadth_multiplier, 2.0);
    assert!(policy.consistency.warn_on_broad_changes);
    assert!(!policy.correctness.require_tests_with_source_changes);
    assert!(policy.correctness.require_commands_reported);
    assert!(policy.correctness.require_evidence_files);
    assert!(policy.risk.require_review_notes_for_protected_areas);
    assert!(policy.risk.warn_on_interface_changes_without_contract);
    assert!(policy.risk.warn_on_config_or_migration_changes);
    assert!(policy.security.enabled);
    assert!(policy.security.hardcoded_secrets);
    assert!(policy.security.unsafe_patterns);
    assert!(policy.security.sensitive_files);
    assert_eq!(policy.scope.violation_severity, "error");
    assert_eq!(policy.scope.violation_budget, 5.0);
    assert!(policy.review.include_evidence_summary);
    assert!(policy.scoring.enabled);
    assert_eq!(policy.scoring.weights.scope, 30.0);
    assert_eq!(policy.scoring.weights.validation, 25.0);
    assert_eq!(policy.scoring.weights.consistency, 15.0);
    assert_eq!(policy.scoring.weights.continuity, 10.0);
    assert_eq!(policy.scoring.weights.performance, 10.0);
    assert_eq!(policy.scoring.weights.risk, 10.0);
}

#[test]
fn nested_check_sections_override_defaults() {
    let policy = build_policy(&json!({
        "checks": {
            "allowedPaths": ["src/", "tests/"],
            "maxChangedFilesPerTask": 99,
            "consistency": {
                "maxChangedFilesPerTask": 7,
                "maxTopLevelEntries": 2,
                "maxBreadthMultiplier": 4,
                "warnOnBroadChanges": false
            },
            "correctness": {
                "requireTestsWithSourceChanges": true,
                "requireCommandsReported": false,
                "requireEvidenceFiles": false
            },
            "risk": {
                "requireReviewNotesForProtectedAreas": false,
                "warnOnInterfaceChangesWithoutContract": false,
                "warnOnConfigOrMigrationChanges": false
            },
            "security": {
                "enabled": false,
                "hardcodedSecrets": false,
                "unsafePatterns": false,
                "sensitiveFiles": false
            },
            "scope": {
                "violationSeverity": "warning",
                "violationBudget": 2
            }
        },
        "review": {
            "includeEvidenceSummary": false
        },
        "scoring": {
            "enabled": false
        }
    }));

    assert_eq!(policy.allowed_paths, vec![json!("src/"), json!("tests/")]);
    assert_eq!(policy.consistency.max_changed_files_per_task, 7.0);
    assert_eq!(policy.consistency.max_top_level_entries, 2.0);
    assert_eq!(policy.consistency.max_breadth_multiplier, 4.0);
    assert!(!policy.consistency.warn_on_broad_changes);
    assert!(policy.correctness.require_tests_with_source_changes);
    assert!(!policy.correctness.require_commands_reported);
    assert!(!policy.correctness.require_evidence_files);
    assert!(!policy.risk.require_review_notes_for_protected_areas);
    assert!(!policy.risk.warn_on_interface_changes_without_contract);
    assert!(!policy.risk.warn_on_config_or_migration_changes);
    assert!(!policy.security.enabled);
    assert!(!policy.security.hardcoded_secrets);
    assert!(!policy.security.unsafe_patterns);
    assert!(!policy.security.sensitive_files);
    assert_eq!(policy.scope.violation_severity, "warning");
    assert_eq!(policy.scope.violation_budget, 2.0);
    assert!(!policy.review.include_evidence_summary);
    assert!(!policy.scoring.enabled);
}

#[test]
fn legacy_flat_check_fields_remain_supported() {
    let policy = build_policy(&json!({
        "checks": {
            "maxChangedFilesPerTask": 8,
            "requireTestsWithSourceChanges": true
        }
    }));

    assert_eq!(policy.consistency.max_changed_files_per_task, 8.0);
    assert!(policy.correctness.require_tests_with_source_changes);
}

#[test]
fn nested_fields_take_precedence_over_legacy_flat_fields() {
    let policy = build_policy(&json!({
        "checks": {
            "maxChangedFilesPerTask": 99,
            "requireTestsWithSourceChanges": false,
            "consistency": { "maxChangedFilesPerTask": 6 },
            "correctness": { "requireTestsWithSourceChanges": true }
        }
    }));

    assert_eq!(policy.consistency.max_changed_files_per_task, 6.0);
    assert!(policy.correctness.require_tests_with_source_changes);
}

#[test]
fn scoring_weights_default_missing_values_and_normalize_sum() {
    let policy = build_policy(&json!({
        "scoring": {
            "weights": {
                "scope": 10,
                "validation": 10,
                "consistency": 10,
                "continuity": 10,
                "performance": 10,
                "risk": 10
            }
        }
    }));

    assert_eq!(policy.scoring.weights.scope, 16.7);
    assert_eq!(policy.scoring.weights.validation, 16.7);
    assert_eq!(policy.scoring.weights.consistency, 16.7);
    assert_eq!(policy.scoring.weights.continuity, 16.7);
    assert_eq!(policy.scoring.weights.performance, 16.7);
    assert_eq!(policy.scoring.weights.risk, 16.7);
}

#[test]
fn partial_scoring_weights_use_defaults_before_normalization() {
    let policy = build_policy(&json!({
        "scoring": {
            "weights": {
                "scope": 60
            }
        }
    }));

    assert_eq!(policy.scoring.weights.scope, 46.2);
    assert_eq!(policy.scoring.weights.validation, 19.2);
    assert_eq!(policy.scoring.weights.consistency, 11.5);
    assert_eq!(policy.scoring.weights.continuity, 7.7);
    assert_eq!(policy.scoring.weights.performance, 7.7);
    assert_eq!(policy.scoring.weights.risk, 7.7);
}
