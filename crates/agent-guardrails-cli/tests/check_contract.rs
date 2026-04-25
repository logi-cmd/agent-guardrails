use agent_guardrails_cli::check::{
    CheckCounts, CheckResult, Finding, compute_composite_score, get_score_verdict,
};
use serde_json::json;
use std::collections::HashMap;

#[test]
fn scoring_matches_current_js_contract() {
    let weights = HashMap::from([
        ("scope".to_string(), 30.0),
        ("validation".to_string(), 25.0),
        ("consistency".to_string(), 15.0),
        ("continuity".to_string(), 10.0),
        ("performance".to_string(), 10.0),
        ("risk".to_string(), 10.0),
    ]);

    assert_eq!(compute_composite_score(&[], Some(&weights)), 100.0);
    assert_eq!(
        compute_composite_score(&[Finding::minimal("warning", "scope")], Some(&weights)),
        95.0
    );
    assert_eq!(
        compute_composite_score(&[Finding::minimal("error", "scope")], Some(&weights)),
        85.0
    );
    assert_eq!(
        compute_composite_score(&[Finding::minimal("info", "scope")], Some(&weights)),
        100.0
    );

    let zero_weights = HashMap::from([
        ("scope".to_string(), 0.0),
        ("validation".to_string(), 0.0),
        ("consistency".to_string(), 0.0),
        ("continuity".to_string(), 0.0),
        ("performance".to_string(), 0.0),
        ("risk".to_string(), 0.0),
    ]);
    assert_eq!(
        compute_composite_score(&[Finding::minimal("warning", "scope")], Some(&zero_weights)),
        100.0
    );

    let mixed = [
        Finding::minimal("error", "validation"),
        Finding::minimal("warning", "scope"),
        Finding::minimal("warning", "risk"),
        Finding::minimal("warning", "continuity"),
    ];
    assert_eq!(compute_composite_score(&mixed, Some(&weights)), 66.7);
}

#[test]
fn verdict_mapping_matches_current_js_contract() {
    assert_eq!(get_score_verdict(100.0, false), "safe-to-deploy");
    assert_eq!(get_score_verdict(90.0, false), "safe-to-deploy");
    assert_eq!(get_score_verdict(85.0, false), "pass-with-concerns");
    assert_eq!(get_score_verdict(70.0, false), "pass-with-concerns");
    assert_eq!(get_score_verdict(50.0, false), "needs-attention");
    assert_eq!(get_score_verdict(39.0, false), "high-risk");
    assert_eq!(get_score_verdict(95.0, true), "blocked");
}

#[test]
fn finding_serialization_uses_existing_json_field_names() {
    let finding = Finding::new(
        "warning",
        "validation",
        "missing-command",
        "Required command was not reported.",
    )
    .with_action("Run npm test and report it.")
    .with_files([
        "src\\service.js",
        "src/service.js",
        "tests\\service.test.js",
    ])
    .with_skip_key("validation:missing-command");

    let value = serde_json::to_value(finding).expect("serialize finding");

    assert_eq!(
        value,
        json!({
            "severity": "warning",
            "category": "validation",
            "code": "missing-command",
            "message": "Required command was not reported.",
            "action": "Run npm test and report it.",
            "files": ["src/service.js", "tests/service.test.js"],
            "skipKey": "validation:missing-command"
        })
    );
}

#[test]
fn check_result_serializes_top_level_pro_compatible_fields() {
    let result = CheckResult {
        ok: false,
        verdict: "Validation incomplete".to_string(),
        score: 85.0,
        score_verdict: "blocked".to_string(),
        go_live_decision: Some(json!({ "verdict": "hold", "riskTier": "high" })),
        go_live_report: None,
        proof_plan: Some(json!({ "state": "blocked" })),
        proof_recipe: Some(json!({ "command": "npm test" })),
        proof_memory_context: None,
        preset: "generic".to_string(),
        diff_source: "working tree".to_string(),
        base_ref: None,
        changed_file_types: vec!["implementation".to_string()],
        counts: CheckCounts {
            changed_files: 2,
            findings: 1,
            warnings: 1,
            failures: 1,
            ..CheckCounts::default()
        },
        findings: vec![Finding::new(
            "error",
            "validation",
            "missing-tests",
            "Missing tests.",
        )],
        warnings: vec!["A warning".to_string()],
        failures: vec!["A failure".to_string()],
        ..CheckResult::default()
    };

    let value = serde_json::to_value(result).expect("serialize result");

    assert_eq!(value["ok"], false);
    assert_eq!(value["scoreVerdict"], "blocked");
    assert_eq!(value["goLiveDecision"]["verdict"], "hold");
    assert_eq!(value["goLiveReport"], serde_json::Value::Null);
    assert_eq!(value["proofPlan"]["state"], "blocked");
    assert_eq!(value["proofRecipe"]["command"], "npm test");
    assert_eq!(value["proofMemoryContext"], serde_json::Value::Null);
    assert_eq!(value["changedFileTypes"], json!(["implementation"]));
    assert_eq!(value["counts"]["changedFiles"], 2);
    assert_eq!(value["counts"]["findings"], 1);
    assert_eq!(value["findings"][0]["code"], "missing-tests");
}
