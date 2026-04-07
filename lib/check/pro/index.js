/**
 * Pro module stub — transparent hook layer for @agent-guardrails/pro.
 *
 * When the Pro package is installed, its exports are used to enrich
 * check output (per-category score breakdown, smart next actions,
 * context quality validation, etc.).
 *
 * When the Pro package is NOT installed, every function silently
 * returns its OSS-default: the review object is returned unchanged,
 * no extra actions are produced, and no breakdown is rendered.
 *
 * This file ships in the OSS package.  It contains zero Pro logic —
 * it is purely a thin loader that tries `dynamic import()` once and
 * caches the result for the process lifetime.
 */

let _proModule = null;
let _loadAttempted = false;

async function loadPro() {
  if (_loadAttempted) return _proModule;
  _loadAttempted = true;
  try {
    _proModule = await import("@agent-guardrails/pro");
  } catch {
    _proModule = null;
  }
  return _proModule;
}

/**
 * Enrich the review object with Pro-level analysis.
 * @param {object} review — output of buildReview()
 * @param {object} context — check execution context
 * @returns {Promise<object>} enriched review (or unchanged if Pro absent)
 */
export async function tryEnrichReview(review, context) {
  const pro = await loadPro();
  if (pro?.enrichReview) {
    return pro.enrichReview(review, context);
  }
  return review;
}

/**
 * Return Pro-specific next-action strings.
 * @param {object} result — full check result
 * @param {object} context — check execution context
 * @returns {Promise<string[]>} extra next actions (empty if Pro absent)
 */
export async function getProNextActions(result, context) {
  const pro = await loadPro();
  if (pro?.getProNextActions) {
    return pro.getProNextActions(result, context);
  }
  return [];
}

/**
 * Format per-category score breakdown for CLI output.
 * @param {object} review — (possibly enriched) review object
 * @param {Function} t — i18n translator
 * @param {string} locale — current locale
 * @returns {Promise<string|null>} formatted string, or null if nothing to show
 */
export async function formatProCategoryBreakdown(review, t, locale) {
  const pro = await loadPro();
  if (pro?.formatProCategoryBreakdown) {
    return pro.formatProCategoryBreakdown(review, t, locale);
  }
  return null;
}
