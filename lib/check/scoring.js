const CATEGORY_MAP = {
  scope: "scope",
  validation: "validation",
  consistency: "consistency",
  continuity: "continuity",
  performance: "performance",
  risk: "risk"
};

const SEVERITY_PENALTY = {
  error: 15,
  warning: 5
};

export function computeCompositeScore(findings, weights) {
  if (!findings || findings.length === 0) {
    return 100;
  }

  const effectiveWeights = (weights && typeof weights === "object" && Object.keys(weights).length > 0)
    ? weights
    : null;

  let totalWeightedDeduction = 0;
  let totalWeight = 0;

  for (const finding of findings) {
    const basePenalty = SEVERITY_PENALTY[finding.severity] ?? 0;
    const category = CATEGORY_MAP[finding.category] || finding.category;

    if (effectiveWeights && effectiveWeights[category] != null) {
      const w = effectiveWeights[category] / 100;
      totalWeightedDeduction += basePenalty * w;
      totalWeight += w;
    } else {
      totalWeightedDeduction += basePenalty;
      totalWeight += 1;
    }
  }

  if (totalWeight > 0) {
    totalWeightedDeduction = totalWeightedDeduction * (findings.length / totalWeight);
  }

  return Math.max(0, Math.min(100, Math.round((100 - totalWeightedDeduction) * 10) / 10));
}

export function getScoreVerdict(score, hasErrors) {
  if (hasErrors) {
    return "blocked";
  }
  if (score >= 90) {
    return "safe-to-deploy";
  }
  if (score >= 70) {
    return "pass-with-concerns";
  }
  if (score >= 40) {
    return "needs-attention";
  }
  return "high-risk";
}

export function validateScoringWeights(weights) {
  const sum = Object.values(weights).reduce((total, w) => total + w, 0);
  return sum === 100;
}

export function formatScoreBar(score, verdict, locale = "en") {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  const label = locale === "zh-CN" ? "信任评分" : "Trust Score";
  return `${label}: ${bar} ${score}/100 (${verdict})`;
}
