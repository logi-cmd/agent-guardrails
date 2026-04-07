/**
 * Pro context-quality validation.
 *
 * Checks whether the AI likely had sufficient context before making changes
 * by inspecting the task contract and evidence file for key signals.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Validate context quality based on task contract and evidence.
 *
 * @param {object} context
 * @param {object} context.taskContract
 * @param {string} context.repoRoot
 * @param {Array}  context.changedFiles
 * @param {object} context.evidenceSummary
 * @returns {{ score: number, signals: object, recommendations: string[] }}
 */
export function validateContextQuality(context) {
  const taskContract = context?.taskContract;
  const changedFiles = context?.changedFiles ?? [];
  const repoRoot = context?.repoRoot ?? "";
  const evidenceSummary = context?.evidenceSummary;

  // --- Signal collection ---

  // 1. Does the contract have intendedFiles?
  const hasIntendedFiles = (taskContract?.intendedFiles?.length ?? 0) > 0;

  // 2. Framework pattern detection
  const frameworkDetected = detectFramework(changedFiles, repoRoot);

  // 3. Are there test files alongside source files?
  const testsPresent = changedFiles.some((filePath) => {
    const normalized = String(filePath).replaceAll("\\", "/");
    return normalized.includes(".test.") || normalized.includes(".spec.") || normalized.includes("/tests/") || normalized.includes("/__tests__/");
  });

  // 4. Does evidence file exist and contain actual content?
  const evidencePresent = (evidenceSummary?.entries?.length ?? 0) > 0
    && evidenceSummary.entries.some((entry) => entry.exists && (entry.fullText?.length ?? 0) > 20);

  // --- Scoring ---
  let score = 0;
  const recommendations = [];

  if (hasIntendedFiles) {
    score += 25;
  } else {
    recommendations.push("Declare intendedFiles in the task contract so the AI stays focused.");
  }

  if (frameworkDetected) {
    score += 20;
  } else {
    // No penalty for no framework, just no bonus
    score += 10;
  }

  if (testsPresent) {
    score += 25;
  } else {
    recommendations.push("Add or update tests alongside source changes to confirm the AI validated its work.");
  }

  if (evidencePresent) {
    score += 30;
  } else {
    recommendations.push("Create or update the evidence file with commands run and residual risk notes.");
  }

  return {
    score,
    signals: {
      hasIntendedFiles,
      frameworkDetected,
      testsPresent,
      evidencePresent
    },
    recommendations
  };
}

// --- internal helpers ---

const FRAMEWORK_PATTERNS = [
  { name: "Next.js", test: (files) => files.some((f) => f.startsWith("app/")) && files.some((f) => f.includes("components/")) },
  { name: "React", test: (files) => files.some((f) => f.includes("src/components/") || f.includes("components/")) && files.some((f) => f.endsWith(".jsx") || f.endsWith(".tsx")) },
  { name: "Vue", test: (files) => files.some((f) => f.endsWith(".vue")) },
  { name: "Svelte", test: (files) => files.some((f) => f.endsWith(".svelte")) },
  { name: "Express", test: (files, root) => files.some((f) => f.includes("routes/")) && fileExists(root, "package.json") },
  { name: "NestJS", test: (files) => files.some((f) => f.includes("src/modules/") || f.includes("src/controllers/")) },
  { name: "Django", test: (files) => files.some((f) => f.includes("models.py") || f.includes("views.py")) },
  { name: "Rails", test: (files) => files.some((f) => f.startsWith("app/controllers/") || f.startsWith("app/models/")) }
];

function detectFramework(changedFiles, repoRoot) {
  const normalized = changedFiles.map((f) => String(f).replaceAll("\\", "/"));

  for (const pattern of FRAMEWORK_PATTERNS) {
    if (pattern.test(normalized, repoRoot)) {
      return pattern.name;
    }
  }

  return null;
}

function fileExists(root, relativePath) {
  try {
    return fs.existsSync(path.join(root, relativePath));
  } catch {
    return false;
  }
}
