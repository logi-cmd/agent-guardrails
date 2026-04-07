import { computeCompositeScore, getScoreVerdict } from "./scoring.js";

function parentScope(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return "";
  }

  return normalized.slice(0, index + 1);
}

function overlaps(files, blockedFiles) {
  return (files ?? []).some((filePath) => blockedFiles.has(filePath));
}

export function suppressReviewFindings(findings) {
  const blockedScopeFiles = new Set(
    findings
      .filter((finding) => finding.category === "scope" && finding.severity === "error")
      .flatMap((finding) => finding.files ?? [])
  );

  const noisyStateScopes = new Set(
    findings
      .filter((finding) => finding.code === "state-mgmt-complexity-multi-file")
      .flatMap((finding) => (finding.files ?? []).map((filePath) => parentScope(filePath)).filter(Boolean))
  );

  return findings.filter((finding) => {
    if (
      finding.code === "state-mgmt-complexity-state-file" &&
      (finding.files ?? []).some((filePath) => noisyStateScopes.has(parentScope(filePath)))
    ) {
      return false;
    }

    if (finding.code === "continuity-breadth-warning" && overlaps(finding.files, blockedScopeFiles)) {
      return false;
    }

    return true;
  });
}

export function buildReview(findings, weights) {
  const activeFindings = suppressReviewFindings(findings);
  const buckets = {
    scopeIssues: [],
    validationIssues: [],
    consistencyConcerns: [],
    continuityConcerns: [],
    performanceConcerns: [],
    riskConcerns: []
  };

  for (const finding of activeFindings) {
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

  const hasErrors = activeFindings.some(f => f.severity === "error");
  const score = computeCompositeScore(activeFindings, weights);
  const scoreVerdict = getScoreVerdict(score, hasErrors);

  return {
    ...buckets,
    score,
    scoreVerdict,
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
