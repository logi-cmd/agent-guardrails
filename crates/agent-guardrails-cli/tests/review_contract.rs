use agent_guardrails_cli::check::{Finding, build_review, suppress_review_findings};
use std::collections::HashMap;

#[test]
fn build_review_buckets_findings_and_computes_score() {
    let weights = HashMap::from([
        ("scope".to_string(), 30.0),
        ("validation".to_string(), 25.0),
        ("consistency".to_string(), 15.0),
        ("continuity".to_string(), 10.0),
        ("performance".to_string(), 10.0),
        ("risk".to_string(), 10.0),
    ]);
    let findings = vec![
        Finding::new("error", "scope", "scope-violation", "Out of scope"),
        Finding::new(
            "warning",
            "validation",
            "missing-command",
            "Missing command",
        ),
        Finding::new("warning", "consistency", "too-many-files", "Too many files"),
        Finding::new("warning", "continuity", "new-pattern", "New pattern"),
        Finding::new("warning", "performance", "large-asset", "Large asset"),
        Finding::new("warning", "risk", "config-change", "Config change"),
    ];

    let review = build_review(&findings, Some(&weights));

    assert_eq!(review.scope_issues.len(), 1);
    assert_eq!(review.validation_issues.len(), 1);
    assert_eq!(review.consistency_concerns.len(), 1);
    assert_eq!(review.continuity_concerns.len(), 1);
    assert_eq!(review.performance_concerns.len(), 1);
    assert_eq!(review.risk_concerns.len(), 1);
    assert_eq!(review.summary.scope_issues, 1);
    assert_eq!(review.summary.validation_issues, 1);
    assert_eq!(review.score_verdict, "blocked");
    assert!(review.score < 100.0);
}

#[test]
fn suppress_review_findings_removes_known_noisy_followups() {
    let findings = vec![
        Finding::new("error", "scope", "task-scope-violation", "Out of scope")
            .with_files(["src/service.js"]),
        Finding::new(
            "warning",
            "continuity",
            "continuity-breadth-warning",
            "Broad change",
        )
        .with_files(["src/service.js"]),
        Finding::new(
            "warning",
            "continuity",
            "state-mgmt-complexity-multi-file",
            "Many state files",
        )
        .with_files(["src/store/a.js"]),
        Finding::new(
            "warning",
            "continuity",
            "state-mgmt-complexity-state-file",
            "State file",
        )
        .with_files(["src/store/b.js"]),
        Finding::new("warning", "risk", "config-change", "Config change"),
    ];

    let active = suppress_review_findings(&findings);
    let codes = active
        .iter()
        .map(|finding| finding.code.as_str())
        .collect::<Vec<_>>();

    assert_eq!(
        codes,
        vec![
            "task-scope-violation",
            "state-mgmt-complexity-multi-file",
            "config-change"
        ]
    );
}
