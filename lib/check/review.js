export function buildReview(findings) {
  const buckets = {
    scopeIssues: [],
    validationIssues: [],
    consistencyConcerns: [],
    continuityConcerns: [],
    performanceConcerns: [],
    riskConcerns: []
  };

  for (const finding of findings) {
    if (finding.category === "scope") {
      buckets.scopeIssues.push(finding);
      continue;
    }

    if (finding.category === "validation") {
      buckets.validationIssues.push(finding);
      continue;
    }

    if (finding.category === "consistency") {
      buckets.consistencyConcerns.push(finding);
      continue;
    }

    if (finding.category === "continuity") {
      buckets.continuityConcerns.push(finding);
      continue;
    }

    if (finding.category === "performance") {
      buckets.performanceConcerns.push(finding);
      continue;
    }

    if (finding.category === "risk") {
      buckets.riskConcerns.push(finding);
    }
  }

  return {
    ...buckets,
    summary: {
      scopeIssues: buckets.scopeIssues.length,
      validationIssues: buckets.validationIssues.length,
      consistencyConcerns: buckets.consistencyConcerns.length,
      continuityConcerns: buckets.continuityConcerns.length,
      performanceConcerns: buckets.performanceConcerns.length,
      riskConcerns: buckets.riskConcerns.length
    }
  };
}
