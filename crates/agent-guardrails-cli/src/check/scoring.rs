use super::Finding;
use std::collections::HashMap;

pub fn compute_composite_score(
    findings: &[Finding],
    weights: Option<&HashMap<String, f64>>,
) -> f64 {
    if findings.is_empty() {
        return 100.0;
    }

    let effective_weights = weights.filter(|value| !value.is_empty());
    let mut total_weighted_deduction = 0.0;
    let mut total_weight = 0.0;

    for finding in findings {
        let base_penalty = severity_penalty(&finding.severity);
        let category = mapped_category(&finding.category);

        if let Some(weights) = effective_weights {
            if let Some(weight) = weights.get(category) {
                let normalized_weight = weight / 100.0;
                total_weighted_deduction += base_penalty * normalized_weight;
                total_weight += normalized_weight;
                continue;
            }
        }

        total_weighted_deduction += base_penalty;
        total_weight += 1.0;
    }

    if total_weight > 0.0 {
        total_weighted_deduction *= findings.len() as f64 / total_weight;
    }

    round_one_decimal((100.0 - total_weighted_deduction).clamp(0.0, 100.0))
}

pub fn get_score_verdict(score: f64, has_errors: bool) -> &'static str {
    if has_errors {
        return "blocked";
    }
    if score >= 90.0 {
        return "safe-to-deploy";
    }
    if score >= 70.0 {
        return "pass-with-concerns";
    }
    if score >= 40.0 {
        return "needs-attention";
    }
    "high-risk"
}

fn severity_penalty(severity: &str) -> f64 {
    match severity {
        "error" => 15.0,
        "warning" => 5.0,
        _ => 0.0,
    }
}

fn mapped_category(category: &str) -> &str {
    match category {
        "scope" => "scope",
        "validation" => "validation",
        "consistency" => "consistency",
        "continuity" => "continuity",
        "performance" => "performance",
        "risk" => "risk",
        other => other,
    }
}

fn round_one_decimal(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}
