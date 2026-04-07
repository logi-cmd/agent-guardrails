/**
 * Pro tier orchestrator.
 *
 * Central entry point that ties together all Pro modules.
 * All calls are gated by isProTier() so OSS behavior is unchanged
 * when no license key is configured.
 */

import { isProTier as checkTier, getTierLabel } from "./tier.js";
import { computeCategoryScores, formatCategoryBar } from "./scoring.js";
import { getChangeRecommendations } from "./recommendations.js";
import { validateContextQuality } from "./context-quality.js";

export { isProTier, getTierLabel } from "./tier.js";

/**
 * Enrich the review result with Pro data.
 *
 * Returns the review as-is when Pro is not active.
 *
 * @param {object} review - result of buildReview()
 * @param {object} config - parsed config.json
 * @param {object} context - check context (repoRoot, changedFiles, etc.)
 * @returns {object} review with optional `.pro` field
 */
export function enrichReview(review, config, context) {
  if (!checkTier(config)) {
    return review;
  }

  const categoryScores = computeCategoryScores(
    review.summary,
    review.scopeIssues
      ?.concat(review.validationIssues ?? [])
      .concat(review.consistencyConcerns ?? [])
      .concat(review.continuityConcerns ?? [])
      .concat(review.performanceConcerns ?? [])
      .concat(review.riskConcerns ?? []) ?? [],
    context?.policy?.scoring?.weights
  );

  const recommendations = getChangeRecommendations(context, review);
  const contextQuality = validateContextQuality(context);

  return {
    ...review,
    pro: {
      categoryScores,
      recommendations,
      contextQuality
    }
  };
}

/**
 * Get Pro next-action hints to append to the runtime nextActions list.
 *
 * Returns an empty array when Pro is not active.
 *
 * @param {object} enrichedReview - the review (possibly enriched by enrichReview)
 * @param {object} context - check context
 * @returns {string[]}
 */
export function getProNextActions(enrichedReview, context) {
  if (!checkTier(context?.config)) {
    return [];
  }

  const actions = [];
  const pro = enrichedReview?.pro;

  if (!pro) {
    return [];
  }

  // Auto file budget hint
  if (pro.recommendations?.autoFileBudget?.hint) {
    actions.push(pro.recommendations.autoFileBudget.hint);
  }

  // Split suggestion if Big Bang detected
  if (pro.recommendations?.splitSuggestion?.summary) {
    actions.push(pro.recommendations.splitSuggestion.summary);
  }

  // Context quality hint if low
  if (pro.contextQuality && pro.contextQuality.score < 60 && pro.contextQuality.recommendations?.length > 0) {
    actions.push(`Context quality is low (${pro.contextQuality.score}/100). ${pro.contextQuality.recommendations[0]}`);
  }

  return actions;
}

/**
 * Format Pro category breakdown for text output.
 *
 * @param {object} categoryScores - { scope: 95, validation: 80, ... }
 * @param {string} locale
 * @returns {string[]} lines to print
 */
export function formatProCategoryBreakdown(categoryScores, locale = "en") {
  const labels = {
    scope: locale === "zh-CN" ? "范围" : "Scope",
    validation: locale === "zh-CN" ? "验证" : "Validation",
    consistency: locale === "zh-CN" ? "一致性" : "Consistency",
    continuity: locale === "zh-CN" ? "连续性" : "Continuity",
    performance: locale === "zh-CN" ? "性能" : "Performance",
    risk: locale === "zh-CN" ? "风险" : "Risk"
  };

  const lines = [];
  for (const [cat, score] of Object.entries(categoryScores ?? {})) {
    lines.push(formatCategoryBar(labels[cat] || cat, score));
  }
  return lines;
}
