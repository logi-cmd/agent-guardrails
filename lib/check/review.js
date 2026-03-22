export function buildReview(findings) {
  const buckets = {
    scopeIssues: [],
    validationIssues: [],
    consistencyConcerns: [],
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
      riskConcerns: buckets.riskConcerns.length
    }
  };
}
