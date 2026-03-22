import { getCheckSections } from "../utils.js";

export function requiredPaths(config) {
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

  return {
    allowedPaths: checks.allowedPaths ?? [],
    consistency: {
      maxChangedFilesPerTask: sections.consistency.maxChangedFilesPerTask ?? checks.maxChangedFilesPerTask ?? 12,
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
    review: {
      includeEvidenceSummary: sections.review.includeEvidenceSummary ?? true
    }
  };
}
