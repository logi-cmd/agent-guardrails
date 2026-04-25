use super::{Finding, compute_composite_score, get_score_verdict};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Review {
    pub scope_issues: Vec<Finding>,
    pub validation_issues: Vec<Finding>,
    pub consistency_concerns: Vec<Finding>,
    pub continuity_concerns: Vec<Finding>,
    pub performance_concerns: Vec<Finding>,
    pub risk_concerns: Vec<Finding>,
    pub score: f64,
    pub score_verdict: String,
    pub summary: ReviewSummary,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSummary {
    pub scope_issues: usize,
    pub validation_issues: usize,
    pub consistency_concerns: usize,
    pub continuity_concerns: usize,
    pub performance_concerns: usize,
    pub risk_concerns: usize,
}

pub fn suppress_review_findings(findings: &[Finding]) -> Vec<Finding> {
    let blocked_scope_files = findings
        .iter()
        .filter(|finding| finding.category == "scope" && finding.severity == "error")
        .flat_map(|finding| finding.files.iter().cloned())
        .collect::<HashSet<_>>();

    let noisy_state_scopes = findings
        .iter()
        .filter(|finding| finding.code == "state-mgmt-complexity-multi-file")
        .flat_map(|finding| {
            finding
                .files
                .iter()
                .map(|file_path| parent_scope(file_path))
        })
        .filter(|scope| !scope.is_empty())
        .collect::<HashSet<_>>();

    findings
        .iter()
        .filter(|finding| {
            if finding.code == "state-mgmt-complexity-state-file"
                && finding
                    .files
                    .iter()
                    .any(|file_path| noisy_state_scopes.contains(&parent_scope(file_path)))
            {
                return false;
            }

            if finding.code == "continuity-breadth-warning"
                && finding
                    .files
                    .iter()
                    .any(|file_path| blocked_scope_files.contains(file_path))
            {
                return false;
            }

            true
        })
        .cloned()
        .collect()
}

pub fn build_review(findings: &[Finding], weights: Option<&HashMap<String, f64>>) -> Review {
    let active_findings = suppress_review_findings(findings);
    let mut review = Review {
        scope_issues: Vec::new(),
        validation_issues: Vec::new(),
        consistency_concerns: Vec::new(),
        continuity_concerns: Vec::new(),
        performance_concerns: Vec::new(),
        risk_concerns: Vec::new(),
        score: 100.0,
        score_verdict: "safe-to-deploy".to_string(),
        summary: ReviewSummary {
            scope_issues: 0,
            validation_issues: 0,
            consistency_concerns: 0,
            continuity_concerns: 0,
            performance_concerns: 0,
            risk_concerns: 0,
        },
    };

    for finding in &active_findings {
        match finding.category.as_str() {
            "scope" => review.scope_issues.push(finding.clone()),
            "validation" => review.validation_issues.push(finding.clone()),
            "consistency" => review.consistency_concerns.push(finding.clone()),
            "continuity" => review.continuity_concerns.push(finding.clone()),
            "performance" => review.performance_concerns.push(finding.clone()),
            "risk" => review.risk_concerns.push(finding.clone()),
            _ => {}
        }
    }

    let has_errors = active_findings
        .iter()
        .any(|finding| finding.severity == "error");
    review.score = compute_composite_score(&active_findings, weights);
    review.score_verdict = get_score_verdict(review.score, has_errors).to_string();
    review.summary = ReviewSummary {
        scope_issues: review.scope_issues.len(),
        validation_issues: review.validation_issues.len(),
        consistency_concerns: review.consistency_concerns.len(),
        continuity_concerns: review.continuity_concerns.len(),
        performance_concerns: review.performance_concerns.len(),
        risk_concerns: review.risk_concerns.len(),
    };

    review
}

fn parent_scope(file_path: &str) -> String {
    let normalized = file_path.replace('\\', "/");
    let Some(index) = normalized.rfind('/') else {
        return String::new();
    };
    normalized[..=index].to_string()
}
