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
            action: `Restore ${relativePath} before relying on guardrail checks.`,
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
          action: "Run inside a git repository or pass --base-ref <ref>."
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
          action: "Run the check after staging or modifying the task files."
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
          action: "Split the task into a smaller slice or tighten the task contract.",
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
          action: "Tighten the task scope or split the work by module boundary.",
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
          action: "Check whether the task is broadening or the intended file list is incomplete.",
          files: context.changedFiles
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
          action: "Keep the change inside repo-level allowed paths or update the repo policy intentionally.",
          files: context.outOfScopeFiles
        }));
      }

      if (context.taskAllowedPaths.length > 0 && context.outOfTaskScopeFiles.length > 0) {
        addFinding(createFinding({
          severity: "error",
          category: "scope",
          code: "task-path-violation",
          message: t("findings.taskPathViolation", { files: context.outOfTaskScopeFiles.join(", ") }),
          action: "Revise the task contract or move the out-of-scope edits into a separate task.",
          files: context.outOfTaskScopeFiles
        }));
      }

      if (context.intendedFiles.length > 0 && context.outOfIntendedFiles.length > 0) {
        addFinding(createFinding({
          severity: "error",
          category: "scope",
          code: "intended-file-violation",
          message: t("findings.intendedFileViolation", { files: context.outOfIntendedFiles.join(", ") }),
          action: "Update the intended file list before editing or revert the unexpected file changes.",
          files: context.outOfIntendedFiles
        }));
      }

      if (context.protectedPathMatches.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "task-protected-paths-touched",
          message: t("findings.taskProtectedPathsTouched", { paths: context.protectedPathMatches.join(", ") }),
          action: "Keep the evidence note explicit about the risk surface and reviewer focus.",
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
          action: "Run the missing commands and pass them via --commands-run, or acknowledge the skip explicitly in the task contract."
        }));
      }

      if (context.policy.correctness.requireEvidenceFiles && context.missingEvidencePaths.length > 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("evidence") ? "warning" : "error",
          category: "validation",
          code: "missing-evidence-files",
          message: t("findings.missingEvidenceFiles", { files: context.missingEvidencePaths.join(", ") }),
          action: "Create the evidence note or acknowledge the evidence skip explicitly in the task contract.",
          files: context.missingEvidencePaths
        }));
      }

      if (context.policy.correctness.requireTestsWithSourceChanges && context.sourceFiles.length > 0 && context.testFiles.length === 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("tests") ? "warning" : "error",
          category: "validation",
          code: "source-without-tests",
          message: t("findings.sourceWithoutTests"),
          action: "Add or update tests, or acknowledge the skip explicitly if the change truly does not need test edits.",
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
            action: `Raise the task risk level to at least "${area.minimumRiskLevel}" and keep the task narrowly scoped.`,
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
            action: "Add residual risk or reviewer focus notes to the evidence file before shipping the change.",
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
          action: "Update the evidence note with reviewer focus and residual risk details.",
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
            action: "Tighten the implementation to the declared change types or update the contract before editing.",
            files: disallowedFiles
          }));
        }
      } else if (context.policy.risk.warnOnInterfaceChangesWithoutContract && context.interfaceLikeFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "interface-change-without-contract",
          message: t("findings.interfaceChangeWithoutContract", { files: context.interfaceLikeFiles.join(", ") }),
          action: "Declare whether the task is implementation-only or interface-changing before merging.",
          files: context.interfaceLikeFiles
        }));
      }

      if (context.policy.risk.warnOnConfigOrMigrationChanges && context.configOrMigrationFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "config-or-migration-change",
          message: t("findings.configOrMigrationChange", { files: context.configOrMigrationFiles.join(", ") }),
          action: "Confirm rollout, backward-compatibility, and operator impact in the review notes.",
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
          action: "Declare the non-functional requirements that matter for this production profile."
        }));
      }

      if (context.criticalPathFiles.length > 0 && !context.taskContract?.rollbackNotes) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "critical-path-without-rollback",
          message: t("findings.criticalPathTouchedWithoutRollback", { files: context.criticalPathFiles.join(", ") }),
          action: "Add rollback notes before merging changes that touch critical runtime paths.",
          files: context.criticalPathFiles
        }));
      }

      if (context.performanceSensitiveFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "performance-sensitive-area-touched",
          message: t("findings.performanceSensitiveAreaTouched", { files: context.performanceSensitiveFiles.join(", ") }),
          action: "Call out performance-sensitive changes in the evidence note and validate the hot path explicitly.",
          files: context.performanceSensitiveFiles
        }));
      }

      if (
        (context.taskContract?.observabilityRequirements ?? []).length > 0 &&
        !/observability|metric|metrics|logging|tracing|trace/.test(context.evidenceText)
      ) {
        addFinding(createFinding({
          severity: "warning",
          category: "validation",
          code: "observability-requirements-unaddressed",
          message: t("findings.observabilityRequirementsUnaddressed"),
          action: "Mention metrics, logging, tracing, or monitoring changes in the evidence note."
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
          action: "Call out how concurrency, load, performance, or reliability was validated."
        }));
      }
    }
  }
];
