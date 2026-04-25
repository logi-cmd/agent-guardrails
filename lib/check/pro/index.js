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

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PRO_PACKAGE_NAME = "@agent-guardrails/pro";
const _proModuleByRoot = new Map();
let _lastLoadedProModule = null;

async function loadPro(repoRoot = null) {
  if (!repoRoot && _lastLoadedProModule) {
    return _lastLoadedProModule;
  }

  const cacheKey = repoRoot ? path.resolve(repoRoot) : "__oss_package__";
  if (_proModuleByRoot.has(cacheKey)) {
    return _proModuleByRoot.get(cacheKey);
  }

  const requireRoots = [];
  if (repoRoot) {
    requireRoots.push(path.join(repoRoot, "package.json"));
  }
  requireRoots.push(import.meta.url);

  for (const requireRoot of requireRoots) {
    try {
      const require = createRequire(requireRoot);
      const resolved = require.resolve(PRO_PACKAGE_NAME);
      const pro = await import(pathToFileURL(resolved).href);
      _proModuleByRoot.set(cacheKey, pro);
      _lastLoadedProModule = pro;
      return pro;
    } catch {
      // Try the next resolution root. Missing Pro must degrade silently.
    }
  }

  _proModuleByRoot.set(cacheKey, null);
  return null;
}

/**
 * Enrich the review object with Pro-level analysis.
 * @param {object} review — output of buildReview()
 * @param {object} context — check execution context
 * @returns {Promise<object>} enriched review (or unchanged if Pro absent)
 */
export async function tryEnrichReview(review, context) {
  const pro = await loadPro(context?.repoRoot);
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
  const pro = await loadPro(context?.repoRoot);
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
