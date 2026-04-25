import { getCheckSections } from "../utils.js";

export function requiredPaths(config) {
  const configured = config?.checks?.requiredPaths;
  if (Array.isArray(configured)) {
    return configured.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim());
  }

  return [
    "AGENTS.md",
    "docs/PROJECT_STATE.md",
    "docs/PR_CHECKLIST.md",
    ".agent-guardrails/config.json"
  ].filter(Boolean);
}

export function buildPolicy(config) {
  const sections = getCheckSections(config);
  const checks = config.checks ?? {};
  const scoringConfig = config.scoring ?? {};
  const scoringWeights = scoringConfig.weights ?? {};

  const scoringWeightsResolved = {
    scope: scoringWeights.scope ?? 30,
    validation: scoringWeights.validation ?? 25,
    consistency: scoringWeights.consistency ?? 15,
    continuity: scoringWeights.continuity ?? 10,
    performance: scoringWeights.performance ?? 10,
    risk: scoringWeights.risk ?? 10
  };

  const weightSum = Object.values(scoringWeightsResolved).reduce((sum, w) => sum + w, 0);
  if (weightSum !== 100) {
    const factor = 100 / weightSum;
    for (const key of Object.keys(scoringWeightsResolved)) {
      scoringWeightsResolved[key] = Math.round(scoringWeightsResolved[key] * factor * 10) / 10;
    }
  }

  return {
    allowedPaths: checks.allowedPaths ?? [],
    consistency: {
      maxChangedFilesPerTask: sections.consistency.maxChangedFilesPerTask ?? checks.maxChangedFilesPerTask ?? 20,
      maxTopLevelEntries: sections.consistency.maxTopLevelEntries ?? 3,
      maxBreadthMultiplier: sections.consistency.maxBreadthMultiplier ?? 2,
      warnOnBroadChanges: sections.consistency.warnOnBroadChanges ?? true
    },
    correctness: {
      requireTestsWithSourceChanges: sections.correctness.requireTestsWithSourceChanges
        ?? checks.requireTestsWithSourceChanges
        ?? false,
      requireCommandsReported: sections.correctness.requireCommandsReported ?? true,
      requireEvidenceFiles: sections.correctness.requireEvidenceFiles ?? true
    },
    risk: {
      requireReviewNotesForProtectedAreas: sections.risk.requireReviewNotesForProtectedAreas ?? true,
      warnOnInterfaceChangesWithoutContract: sections.risk.warnOnInterfaceChangesWithoutContract ?? true,
      warnOnConfigOrMigrationChanges: sections.risk.warnOnConfigOrMigrationChanges ?? true
    },
    security: {
      enabled: sections.security.enabled ?? true,
      hardcodedSecrets: sections.security.hardcodedSecrets ?? true,
      unsafePatterns: sections.security.unsafePatterns ?? true,
      sensitiveFiles: sections.security.sensitiveFiles ?? true
    },
    scope: {
      violationSeverity: checks.scope?.violationSeverity ?? "error",
      violationBudget: checks.scope?.violationBudget ?? 5
    },
    review: {
      includeEvidenceSummary: sections.review.includeEvidenceSummary ?? true
    },
    scoring: {
      enabled: scoringConfig.enabled ?? true,
      weights: scoringWeightsResolved
    }
  };
}
