import { createFinding } from "../finding.js";
import { normalizeChangeType } from "../../utils.js";

function toBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value == null) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function severityRank(level) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[String(level || "").toLowerCase()] ?? 0;
}

function getParentScope(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return "";
  }

  return normalized.slice(0, index + 1);
}

function looksLikeParallelAbstraction(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/").toLowerCase();
  const baseName = normalized.split("/").at(-1) ?? "";
  return /(helper|service|hook|util|utils|manager|controller|store|client|adapter)/.test(baseName);
}

export const ossDetectors = [
  {
    name: "required-files",
    run({ context, addFinding, t }) {
      for (const relativePath of context.requiredPaths) {
        if (!context.requiredPathStatus[relativePath]) {
          addFinding(createFinding({
            severity: "error",
            category: "validation",
            code: "missing-required-file",
            message: t("findings.missingRequiredFile", { path: relativePath }),
            action: t("actions.restoreRequiredFile", { path: relativePath }),
            files: [relativePath]
          }));
        }
      }
    }
  },
  {
    name: "diff-availability",
    run({ context, addFinding, t }) {
      if (context.diffResult.error) {
        addFinding(createFinding({
          severity: "error",
          category: "validation",
          code: "diff-unavailable",
          message: t("findings.diffUnavailable", { details: context.diffResult.error }),
          action: t("actions.runInsideGit")
        }));
      }

      if (context.changedFiles.length === 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "validation",
          code: "no-changes-detected",
          message: context.baseRef
            ? t("findings.noChangesBaseRef", { baseRef: context.baseRef })
            : t("findings.noChangesWorkingTree"),
          action: t("actions.runAfterChanges")
        }));
      }
    }
  },
  {
    name: "consistency-budgets",
    run({ context, addFinding, t }) {
      if (context.changedFiles.length > context.policy.consistency.maxChangedFilesPerTask) {
        addFinding(createFinding({
          severity: "error",
          category: "consistency",
          code: "changed-file-budget-exceeded",
          message: t("findings.changedFileBudgetExceeded", {
            count: context.changedFiles.length,
            budget: context.policy.consistency.maxChangedFilesPerTask
          }),
          action: t("actions.splitSmallerTask"),
          files: context.changedFiles
        }));
      }

      if (
        context.policy.consistency.warnOnBroadChanges &&
        context.topLevelEntries.length > context.policy.consistency.maxTopLevelEntries
      ) {
        addFinding(createFinding({
          severity: "warning",
          category: "consistency",
          code: "broad-top-level-change",
          message: t("findings.broadTopLevelChange", {
            count: context.topLevelEntries.length,
            areas: context.topLevelEntries.join(", "),
            budget: context.policy.consistency.maxTopLevelEntries
          }),
          action: t("actions.tightenScopeByBoundary"),
          files: context.changedFiles
        }));
      }

      if (
        context.intendedFiles.length > 0 &&
        context.policy.consistency.warnOnBroadChanges &&
        context.changedFiles.length > Math.max(2, context.intendedFiles.length * context.policy.consistency.maxBreadthMultiplier)
      ) {
        addFinding(createFinding({
          severity: "warning",
          category: "consistency",
          code: "task-breadth-suspicious",
          message: t("findings.taskBreadthSuspicious", {
            count: context.changedFiles.length,
            intendedCount: context.intendedFiles.length
          }),
          action: t("actions.checkBroadening"),
          files: context.changedFiles
        }));
      }
    }
  },
  {
    name: "continuity-mvp",
    run({ context, addFinding, t }) {
      const intendedFiles = context.intendedFiles ?? [];
      const implementationLikeExtras = context.changedFiles.filter((filePath) => {
        if (intendedFiles.includes(filePath)) {
          return false;
        }

        return ["implementation", "interface"].includes(context.changeTypes[filePath]);
      });

      if (intendedFiles.length > 0 && implementationLikeExtras.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "consistency",
          code: "continuity-breadth-warning",
          message: t("findings.continuityBreadthWarning", { files: implementationLikeExtras.join(", ") }),
          action: t("actions.keepMaintenanceSurfaceTight"),
          files: implementationLikeExtras
        }));
      }

      const intendedScopes = new Map();
      for (const filePath of intendedFiles) {
        const scope = getParentScope(filePath);
        if (!scope) {
          continue;
        }

        const current = intendedScopes.get(scope) ?? [];
        current.push(filePath);
        intendedScopes.set(scope, current);
      }

      for (const filePath of implementationLikeExtras) {
        const scope = getParentScope(filePath);
        if (!scope || !intendedScopes.has(scope) || !looksLikeParallelAbstraction(filePath)) {
          continue;
        }

        addFinding(createFinding({
          severity: "warning",
          category: "consistency",
          code: "continuity-parallel-abstraction",
          message: t("findings.parallelAbstractionLikely", { file: filePath }),
          action: t("actions.extendExistingTarget", {
            value: intendedScopes.get(scope).join(", ")
          }),
          files: [filePath, ...intendedScopes.get(scope)]
        }));
      }

      if (
        (context.taskContract?.continuityRequirements ?? []).length > 0 &&
        (context.configProtectedAreaMatches.length > 0 || context.protectedPathMatches.length > 0)
      ) {
        const files = [
          ...context.configProtectedAreaMatches.flatMap((match) => match.files ?? []),
          ...context.changedFiles.filter((filePath) =>
            context.protectedPathMatches.some((scope) => context.isPathWithinAllowedScope(filePath, scope))
          )
        ];

        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "continuity-sensitive-structure-change",
          message: t("findings.continuitySensitiveStructureChange"),
          action: t("actions.preserveExistingStructure"),
          files
        }));
      }
    }
  },
  {
    name: "scope-and-contract",
    run({ context, addFinding, t }) {
      if (context.allowedPaths.length > 0 && context.outOfScopeFiles.length > 0) {
        addFinding(createFinding({
          severity: "error",
          category: "scope",
          code: "repo-allowed-path-violation",
          message: t("findings.repoAllowedPathViolation", { files: context.outOfScopeFiles.join(", ") }),
          action: t("actions.keepRepoAllowedPaths"),
          files: context.outOfScopeFiles
        }));
      }

      if (context.taskAllowedPaths.length > 0 && context.outOfTaskScopeFiles.length > 0) {
        addFinding(createFinding({
          severity: "error",
          category: "scope",
          code: "task-path-violation",
          message: t("findings.taskPathViolation", { files: context.outOfTaskScopeFiles.join(", ") }),
          action: t("actions.reviseTaskContract"),
          files: context.outOfTaskScopeFiles
        }));
      }

      if (context.intendedFiles.length > 0 && context.outOfIntendedFiles.length > 0) {
        addFinding(createFinding({
          severity: "error",
          category: "scope",
          code: "intended-file-violation",
          message: t("findings.intendedFileViolation", { files: context.outOfIntendedFiles.join(", ") }),
          action: t("actions.updateIntendedFiles"),
          files: context.outOfIntendedFiles
        }));
      }

      if (context.protectedPathMatches.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "task-protected-paths-touched",
          message: t("findings.taskProtectedPathsTouched", { paths: context.protectedPathMatches.join(", ") }),
          action: t("actions.keepEvidenceExplicit"),
          files: context.changedFiles.filter((filePath) =>
            context.protectedPathMatches.some((scope) => context.isPathWithinAllowedScope(filePath, scope))
          )
        }));
      }
    }
  },
  {
    name: "validation-baseline",
    run({ context, addFinding, t }) {
      if (context.policy.correctness.requireCommandsReported && context.missingRequiredCommands.length > 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("commands") ? "warning" : "error",
          category: "validation",
          code: "missing-required-commands",
          message: t("findings.missingRequiredCommands", { commands: context.missingRequiredCommands.join(", ") }),
          action: t("actions.runMissingCommands")
        }));
      }

      if (context.policy.correctness.requireEvidenceFiles && context.missingEvidencePaths.length > 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("evidence") ? "warning" : "error",
          category: "validation",
          code: "missing-evidence-files",
          message: t("findings.missingEvidenceFiles", { files: context.missingEvidencePaths.join(", ") }),
          action: t("actions.createEvidence"),
          files: context.missingEvidencePaths
        }));
      }

      if (context.policy.correctness.requireTestsWithSourceChanges && context.sourceFiles.length > 0 && context.testFiles.length === 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("tests") ? "warning" : "error",
          category: "validation",
          code: "source-without-tests",
          message: t("findings.sourceWithoutTests"),
          action: t("actions.addOrUpdateTests"),
          files: context.sourceFiles
        }));
      }
    }
  },
  {
    name: "protected-areas",
    run({ context, addFinding, t }) {
      for (const area of context.configProtectedAreaMatches) {
        const currentRiskLevel = severityRank(context.taskContract?.riskLevel);
        const minimumRiskLevel = severityRank(area.minimumRiskLevel);
        const requiresReviewNotes = area.requiresReviewNotes || context.policy.risk.requireReviewNotesForProtectedAreas;

        if (minimumRiskLevel > 0 && currentRiskLevel < minimumRiskLevel) {
          addFinding(createFinding({
            severity: "error",
            category: "risk",
            code: "protected-area-risk-level-too-low",
            message: t("findings.protectedAreaRiskLevelTooLow", { label: area.label }),
            action: t("actions.raiseRiskLevel", { level: area.minimumRiskLevel }),
            files: area.files
          }));
        } else {
          addFinding(createFinding({
            severity: "warning",
            category: "risk",
            code: "protected-area-touched",
            message: t("findings.protectedAreaTouched", { label: area.label }),
            action: area.action,
            files: area.files
          }));
        }

        if (requiresReviewNotes && !context.evidenceSummary.hasReviewNotes) {
          addFinding(createFinding({
            severity: "error",
            category: "risk",
            code: "protected-area-missing-review-notes",
            message: t("findings.protectedAreaMissingReviewNotes", { label: area.label }),
            action: t("actions.addReviewNotesBeforeShipping"),
            files: area.files
          }));
        }
      }

      if (context.taskContract?.requiresReviewNotes && !context.evidenceSummary.hasReviewNotes) {
        addFinding(createFinding({
          severity: "error",
          category: "risk",
          code: "task-missing-review-notes",
          message: t("findings.taskMissingReviewNotes"),
          action: t("actions.updateEvidenceReviewNotes"),
          files: context.evidencePaths
        }));
      }
    }
  },
  {
    name: "change-types-and-risk-surfaces",
    run({ context, addFinding, t }) {
      if (context.allowedChangeTypes.length > 0) {
        const allowedSet = new Set(context.allowedChangeTypes);
        const normalizedAllowed = new Set(context.allowedChangeTypes.flatMap((item) => {
          if (item === "implementation-only") {
            return ["implementation", "tests", "docs"];
          }

          if (item === "interface-changing") {
            return ["implementation", "interface", "tests", "docs"];
          }

          return [normalizeChangeType(item)];
        }));

        const disallowedFiles = context.changedFiles.filter((filePath) => !normalizedAllowed.has(context.changeTypes[filePath]));
        if (disallowedFiles.length > 0) {
          addFinding(createFinding({
            severity: "error",
            category: "scope",
            code: "change-type-violation",
            message: t("findings.changeTypeViolation", {
              types: [...allowedSet].join(", "),
              files: disallowedFiles.join(", ")
            }),
          action: t("actions.tightenImplementationChangeTypes"),
            files: disallowedFiles
          }));
        }
      } else if (context.policy.risk.warnOnInterfaceChangesWithoutContract && context.interfaceLikeFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "interface-change-without-contract",
          message: t("findings.interfaceChangeWithoutContract", { files: context.interfaceLikeFiles.join(", ") }),
          action: t("actions.declareImplementationOrInterface"),
          files: context.interfaceLikeFiles
        }));
      }

      if (context.policy.risk.warnOnConfigOrMigrationChanges && context.configOrMigrationFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "config-or-migration-change",
          message: t("findings.configOrMigrationChange", { files: context.configOrMigrationFiles.join(", ") }),
          action: t("actions.confirmRolloutImpact"),
          files: context.configOrMigrationFiles
        }));
      }
    }
  },
  {
    name: "production-profile-and-nfr",
    run({ context, addFinding, t }) {
      const taskNfrRequirements = context.taskNfrRequirements;

      if (context.taskContract?.productionProfile && taskNfrRequirements.length === 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "production-profile-missing-nfr",
          message: t("findings.productionProfileMissingNfr"),
          action: t("actions.declareNfr")
        }));
      }

      if (context.criticalPathFiles.length > 0 && !context.taskContract?.rollbackNotes) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "critical-path-without-rollback",
          message: t("findings.criticalPathTouchedWithoutRollback", { files: context.criticalPathFiles.join(", ") }),
          action: t("actions.addRollbackNotes"),
          files: context.criticalPathFiles
        }));
      }

      if (context.performanceSensitiveFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "performance-sensitive-area-touched",
          message: t("findings.performanceSensitiveAreaTouched", { files: context.performanceSensitiveFiles.join(", ") }),
          action: t("actions.validateHotPath"),
          files: context.performanceSensitiveFiles
        }));
      }

      if (
        (context.taskContract?.observabilityRequirements ?? []).length > 0 &&
        !/observability|monitoring|metric|metrics|logging|log|logs|tracing|trace/.test(context.evidenceText)
      ) {
        addFinding(createFinding({
          severity: "warning",
          category: "validation",
          code: "observability-requirements-unaddressed",
          message: t("findings.observabilityRequirementsUnaddressed"),
          action: t("actions.mentionObservability")
        }));
      }

      if (
        taskNfrRequirements.some((item) => ["performance", "concurrency", "reliability"].includes(item.toLowerCase())) &&
        !/performance|latency|throughput|load|concurrency|stress|benchmark|reliability/.test(context.evidenceText)
      ) {
        addFinding(createFinding({
          severity: "warning",
          category: "validation",
          code: "concurrency-requirements-unaddressed",
          message: t("findings.concurrencyRequirementsUnaddressed"),
          action: t("actions.mentionPerfValidation")
        }));
      }
    }
  }
];
