/**
 * Pro scoring — per-category score breakdown.
 *
 * The OSS computeCompositeScore() produces a single total.
 * Pro adds per-category scores so reviewers can see which
 * dimension pulled the composite down.
 */

const SEVERITY_PENALTY = { error: 15, warning: 5 };

const CATEGORY_KEYS = [
  "scope",
  "validation",
  "consistency",
  "continuity",
  "performance",
  "risk"
];

/**
 * Compute a 0-100 score per category.
 *
 * @param {object} summary - review.summary with counts per category
 * @param {Array}  findings - the raw findings array
 * @param {object} [weights] - optional category weights
 * @returns {Record<string,number>} e.g. { scope: 95, validation: 80, ... }
 */
export function computeCategoryScores(summary, findings, weights) {
  const result = {};

  // Build a findings-per-category map
  const byCategory = {};
  for (const cat of CATEGORY_KEYS) {
    byCategory[cat] = [];
  }

  for (const finding of findings ?? []) {
    const cat = finding.category;
    if (byCategory[cat]) {
      byCategory[cat].push(finding);
    }
  }

  for (const cat of CATEGORY_KEYS) {
    const catFindings = byCategory[cat];
    if (!catFindings || catFindings.length === 0) {
      result[cat] = 100;
      continue;
    }

    const weight = weights?.[cat] ?? 100;
    const w = weight / 100;

    let deduction = 0;
    for (const finding of catFindings) {
      deduction += (SEVERITY_PENALTY[finding.severity] ?? 0) * w;
    }

    // Normalize by finding count vs total weight units
    const totalWeightUnits = catFindings.length;
    if (totalWeightUnits > 0) {
      deduction = deduction * (catFindings.length / totalWeightUnits);
    }

    result[cat] = Math.max(0, Math.min(100, Math.round((100 - deduction) * 10) / 10));
  }

  return result;
}

/**
 * Format a per-category score bar for CLI output.
 *
 * @param {string} label
 * @param {number} score 0-100
 * @returns {string}
 */
export function formatCategoryBar(label, score) {
  const filled = Math.round(score / 10);
  const empty = 10 - filled;
  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `  ${label}: ${bar} ${score}/100`;
}
