/**
 * Pro recommendations — auto maxChangedFiles & smart split suggestions.
 */

import { execSync } from "node:child_process";

/**
 * Recommend a file budget based on repo size.
 *
 * @param {object} context
 * @param {string} context.repoRoot
 * @returns {{ recommendedMaxFiles: number, reasoning: string, hint: string }}
 */
export function getAutoFileBudget(context) {
  const totalFiles = estimateRepoFileCount(context);
  let recommendedMaxFiles;
  let reasoning;

  if (totalFiles < 50) {
    recommendedMaxFiles = 10;
    reasoning = `Small repo (${totalFiles} tracked files) — 10 files per task keeps changes focused`;
  } else if (totalFiles < 200) {
    recommendedMaxFiles = 15;
    reasoning = `Medium repo (${totalFiles} tracked files) — 15 files per task balances flexibility and reviewability`;
  } else if (totalFiles < 500) {
    recommendedMaxFiles = 20;
    reasoning = `Large repo (${totalFiles} tracked files) — 20 files per task is still reviewable`;
  } else {
    recommendedMaxFiles = 25;
    reasoning = `Very large repo (${totalFiles} tracked files) — 25 files per task maintains manageable review scope`;
  }

  const currentCount = context?.changedFiles?.length ?? 0;
  const hint = currentCount > recommendedMaxFiles
    ? `Consider reducing to ${recommendedMaxFiles} files. ${reasoning}.`
    : `File budget: ${recommendedMaxFiles}. ${reasoning}.`;

  return { recommendedMaxFiles, reasoning, hint };
}

/**
 * Analyze a Big Bang change and suggest how to split it.
 *
 * Triggered when: 15+ files, 3+ top-level dirs, or 300+ lines.
 *
 * @param {object} context
 * @param {object} review
 * @returns {null | { batches: Array, summary: string }}
 */
export function suggestSplit(context, review) {
  const changedFiles = context?.changedFiles ?? [];
  const fileCount = changedFiles.length;

  // Not a big change — nothing to suggest
  if (fileCount < 15) {
    return null;
  }

  // Group by top-level directory
  const groups = {};
  for (const filePath of changedFiles) {
    const normalized = String(filePath).replaceAll("\\", "/");
    const slashIndex = normalized.indexOf("/");
    const topDir = slashIndex === -1 ? "(root)" : normalized.slice(0, slashIndex);
    if (!groups[topDir]) {
      groups[topDir] = [];
    }
    groups[topDir].push(filePath);
  }

  const topDirs = Object.keys(groups);
  if (topDirs.length < 2) {
    // All in one directory — can't meaningfully split by dir
    return null;
  }

  // Build batches: group directories into 2-4 batches
  const batches = [];
  const batchSize = Math.ceil(topDirs.length / Math.min(4, topDirs.length));

  for (let i = 0; i < topDirs.length; i += batchSize) {
    const batchDirs = topDirs.slice(i, i + batchSize);
    const batchFiles = batchDirs.flatMap((dir) => groups[dir]);
    batches.push({
      name: `Batch ${batches.length + 1}: ${batchDirs.join(", ")}`,
      dirs: batchDirs,
      files: batchFiles,
      estimatedLines: batchFiles.length * 20 // rough estimate
    });
  }

  const summary = batches
    .map((b) => `${b.name} (${b.files.length} files)`)
    .join("; ");

  return {
    batches,
    summary: `Consider splitting into ${batches.length} batches: ${summary}`
  };
}

/**
 * Combined recommendations helper.
 *
 * @param {object} context
 * @param {object} review
 * @returns {{ autoFileBudget: object, splitSuggestion: object|null }}
 */
export function getChangeRecommendations(context, review) {
  return {
    autoFileBudget: getAutoFileBudget(context),
    splitSuggestion: suggestSplit(context, review)
  };
}

// --- internal helpers ---

function estimateRepoFileCount(context) {
  const repoRoot = context?.repoRoot;
  if (!repoRoot) {
    return 100; // fallback default
  }

  try {
    const output = execSync("git ls-files", {
      cwd: repoRoot,
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"]
    });
    const count = output.split("\n").filter(Boolean).length;
    return count || 100;
  } catch {
    return 100;
  }
}
