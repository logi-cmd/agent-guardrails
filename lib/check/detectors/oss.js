import { createFinding } from "../finding.js";
import { normalizeChangeType, toBoolean, getParentScope } from "../../utils.js";
import { runMutationTests } from "../mutation-tester.js";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

function severityRank(level) {
  return { low: 1, medium: 2, high: 3, critical: 4 }[String(level || "").toLowerCase()] ?? 0;
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
          severity: "warning",
          category: "consistency",
          code: "changed-file-budget-exceeded",
          message: t("findings.changedFileBudgetExceeded", {
            count: context.changedFiles.length,
            budget: context.policy.consistency.maxChangedFilesPerTask
          }),
          action: t("actions.splitSmallerTask"),
          files: context.changedFiles,
          skipKey: "breadth"
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
          files: context.changedFiles,
          skipKey: "breadth"
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
          files: context.changedFiles,
          skipKey: "breadth"
        }));
      }

      // Graduated scope threshold: gentle guidance when no explicit scope is configured
      if (context.outOfScopeFiles.length > 0) {
        const scopeViolationBudget = context.policy.scope?.violationBudget ?? 5;
        if (context.outOfScopeFiles.length <= scopeViolationBudget) {
          addFinding(createFinding({
            severity: "warning",
            category: "scope",
            code: "minor-scope-violation",
            message: t("findings.minorScopeViolation", {
              files: context.outOfScopeFiles.join(", "),
              budget: scopeViolationBudget
            }),
            action: t("actions.narrowScopeOrAcknowledge"),
            files: context.outOfScopeFiles
          }));
        }
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
      const scopeSeverity = context.policy.scope?.violationSeverity ?? "error";

      if (context.allowedPaths.length > 0 && context.outOfScopeFiles.length > 0) {
        addFinding(createFinding({
          severity: (scopeSeverity === "warning" && context.hasSkipAcknowledgement("scope"))
            ? "warning"
            : scopeSeverity,
          category: "scope",
          code: "repo-allowed-path-violation",
          message: t("findings.repoAllowedPathViolation", { files: context.outOfScopeFiles.join(", ") }),
          action: t("actions.keepRepoAllowedPaths"),
          files: context.outOfScopeFiles,
          skipKey: "scope"
        }));
      }

      if (context.taskAllowedPaths.length > 0 && context.outOfTaskScopeFiles.length > 0) {
        addFinding(createFinding({
          severity: (scopeSeverity === "warning" && context.hasSkipAcknowledgement("scope"))
            ? "warning"
            : scopeSeverity,
          category: "scope",
          code: "task-path-violation",
          message: t("findings.taskPathViolation", { files: context.outOfTaskScopeFiles.join(", ") }),
          action: t("actions.reviseTaskContract"),
          files: context.outOfTaskScopeFiles,
          skipKey: "scope"
        }));
      }

      if (context.intendedFiles.length > 0 && context.outOfIntendedFiles.length > 0) {
        addFinding(createFinding({
          severity: (scopeSeverity === "warning" && context.hasSkipAcknowledgement("scope"))
            ? "warning"
            : scopeSeverity,
          category: "scope",
          code: "intended-file-violation",
          message: t("findings.intendedFileViolation", { files: context.outOfIntendedFiles.join(", ") }),
          action: t("actions.updateIntendedFiles"),
          files: context.outOfIntendedFiles,
          skipKey: "scope"
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
          action: t("actions.runMissingCommands"),
          skipKey: "commands"
        }));
      }

      if (context.policy.correctness.requireEvidenceFiles && context.missingEvidencePaths.length > 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("evidence") ? "warning" : "error",
          category: "validation",
          code: "missing-evidence-files",
          message: t("findings.missingEvidenceFiles", { files: context.missingEvidencePaths.join(", ") }),
          action: t("actions.createEvidence"),
          files: context.missingEvidencePaths,
          skipKey: "evidence"
        }));
      }

      if (context.policy.correctness.requireTestsWithSourceChanges && context.sourceFiles.length > 0 && context.testFiles.length === 0) {
        addFinding(createFinding({
          severity: context.hasSkipAcknowledgement("tests") ? "warning" : "error",
          category: "validation",
          code: "source-without-tests",
          message: t("findings.sourceWithoutTests"),
          action: t("actions.addOrUpdateTests"),
          files: context.sourceFiles,
          skipKey: "tests"
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
  },
  {
    name: "secrets-safety",
    run({ context, addFinding, t }) {
      const { repoRoot, changedFiles } = context;
      if (!changedFiles || changedFiles.length === 0) return;

      const patterns = [
        { regex: /(?:api[_-]?key|apikey)\s*[=:]\s*["'][^"']{8,}["']/i, label: "API key" },
        { regex: /(?:password|passwd|pwd)\s*[=:]\s*["'][^"']{6,}["']/i, label: "Password" },
        { regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i, label: "Bearer token" },
        { regex: /-----BEGIN(?:\s+(?:RSA|EC|DSA|OPENSSH|PRIVATE))?[\s-]*PRIVATE KEY-----/, label: "Private key" },
        { regex: /(?:secret|token)\s*[=:]\s*["'][A-Za-z0-9\-._~+/]{16,}["']/i, label: "Secret/token" }
      ];

      const testLike = /\.(test|spec)\.(js|ts|mjs|cjs|jsx|tsx)$|__tests__|fixtures|mock/i;

      for (const filePath of changedFiles) {
        if (testLike.test(filePath)) continue;
        let content;
        try {
          content = execFileSync(
            "git",
            ["diff", "--cached", "--", filePath],
            { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
          );
          if (!content.trim()) {
            content = execFileSync(
              "git",
              ["diff", "--", filePath],
              { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
            );
          }
        } catch {
          continue;
        }
        const addedLines = content.split("\n").filter((line) => /^\+/.test(line) && !/^\+\+\+/.test(line));
        const found = new Set();
        for (const { regex, label } of patterns) {
          for (const line of addedLines) {
            if (regex.test(line) && !found.has(label)) {
              found.add(label);
              addFinding(createFinding({
                severity: "warning",
                category: "risk",
                code: "secrets-safety",
                message: t("findings.secretsSafetyDetected", { file: filePath, type: label }),
                action: t("actions.moveSecretToEnv"),
                files: [filePath]
              }));
            }
          }
        }
      }
    }
  },
  {
    name: "state-management-complexity",
    run({ context, addFinding, t }) {
      const changedRaw = context.changedFiles || [];

      const changed = changedRaw.map((item) => {
        if (typeof item === "string") {
          return { path: item, type: "unknown" };
        }
        return { path: item.path, type: item.type || "modified" };
      });

      const groups = {};
      changed.forEach((f) => {
        const dir = getParentScope(f.path);
        if (!dir) return;
        if (!groups[dir]) groups[dir] = [];
        groups[dir].push(f.path);
      });
      Object.keys(groups).forEach((dir) => {
        const uniqueFiles = Array.from(new Set(groups[dir]));
        if (uniqueFiles.length >= 3) {
          addFinding(createFinding({
            code: "state-mgmt-complexity-multi-file",
            severity: "warning",
            category: "continuity",
            message: t("findings.state-mgmt-complexity-multi-file"),
            action: t("precision.state_mgmt"),
            files: uniqueFiles
          }));
        }
      });

      const stateKeywords = ["state", "store", "reducer", "usecontext", "hook", "hooks"];
      changed.forEach((f) => {
        const p = (f.path || "").toLowerCase();
        const hasKeyword = stateKeywords.some((k) => p.includes(k));
        if ((f.type === "modified" || f.type === "added" || f.type === "unknown") && hasKeyword) {
          addFinding(createFinding({
            code: "state-mgmt-complexity-state-file",
            severity: "warning",
            category: "continuity",
            message: t("findings.state-mgmt-complexity-state-file", { path: f.path }),
            action: t("precision.state_mgmt"),
            files: [f.path]
          }));
        }
      });

      changed.forEach((f) => {
        const p = (f.path || "").toLowerCase();
        if (f.type === 'added' && (p.includes("state") || p.includes("store") || p.includes("reducer"))) {
          addFinding(createFinding({
            code: "state-mgmt-complexity-new-state",
            severity: "warning",
            category: "continuity",
            message: t("findings.state-mgmt-complexity-new-state", { path: f.path }),
            action: t("precision.state_mgmt"),
            files: [f.path]
          }));
        }
      });
    }
  },
  {
    name: "async-logic-risk",
    run({ context, addFinding, t }) {
      const jsFiles = (context.changedFiles || []).filter((item) => {
        const p = typeof item === "string" ? item : (item.path || "");
        return /\.jsx?$/.test(p) || /\.tsx?$/.test(p) || /\.mjs$/.test(p) || /\.cjs$/.test(p);
      });
      if (jsFiles.length === 0) return;

      for (const item of jsFiles) {
        const filePath = typeof item === "string" ? item : (item.path || "");
        let fileContent = "";
        try {
          fileContent = fs.readFileSync(filePath, "utf8");
        } catch {
          continue;
        }

        const thenMatches = fileContent.match(/\.\s*then\s*\(/g);
        if (thenMatches && thenMatches.length >= 3) {
          addFinding(createFinding({
            severity: "warning",
            category: "continuity",
            code: "async-risk-nested-then",
            message: t("findings.async-risk-nested-then", { count: thenMatches.length, path: filePath }),
            action: t("precision.continuity"),
            files: [filePath]
          }));
        }

        const forAwaitMatch = fileContent.match(/(?:for|while)\s*\([^)]*\)\s*\{[^}]*await\s+/g);
        const forEachAwaitMatch = fileContent.match(/\.forEach\s*\([^)]*\)\s*\{[^}]*await\s+/g);
        if ((forAwaitMatch || forEachAwaitMatch) && !fileContent.includes("Promise.all") && !fileContent.includes("Promise.allSettled")) {
          addFinding(createFinding({
            severity: "warning",
            category: "continuity",
            code: "async-risk-await-in-loop",
            message: t("findings.async-risk-await-in-loop", { path: filePath }),
            action: t("precision.continuity"),
            files: [filePath]
          }));
        }

        const emptyCatchMatches = fileContent.match(/\.catch\s*\(\s*\)\s*\)/g);
        if (emptyCatchMatches && emptyCatchMatches.length > 0) {
          addFinding(createFinding({
            severity: "warning",
            category: "continuity",
            code: "async-risk-empty-catch",
            message: t("findings.async-risk-empty-catch", { path: filePath }),
            action: t("precision.continuity"),
            files: [filePath]
          }));
        }
      }
    }
  },
  {
    name: "performance-degradation",
    run({ context, addFinding, t }) {
      const enabled = (context?.config?.checks?.performance?.enabled ?? true);
      const largeAssetBytes = context?.config?.checks?.performance?.largeAssetBytes ?? (256 * 1024);
      if (!enabled) return;
      const changes = Array.isArray(context?.changedFiles) ? context.changedFiles : [];
      if (changes.length === 0) return;
      let totalAddedLines = 0;
      for (const f of changes) {
        const filePath = (typeof f === "string") ? f : (f?.path ?? "");
        const addedLines = (typeof f === "object") ? (f?.addedLines ?? undefined) : undefined;
        const estOriginalLines = (typeof f === "object") ? (f?.estimatedOriginalLines ?? undefined) : undefined;
        if (typeof addedLines === "number") totalAddedLines += addedLines;
        if (typeof addedLines === "number" && typeof estOriginalLines === "number") {
          if (addedLines > 0.5 * estOriginalLines) {
            const scope = (typeof getParentScope === "function") ? getParentScope(filePath) : undefined;
            addFinding(createFinding({
              severity: "warning",
              category: "performance",
              code: "perf-degradation-file-growth",
              message: t("performance.perf-degradation-file-growth", { path: filePath }),
              action: t("precision.performance"),
              files: [filePath]
            }));
          }
        }
        const isNewAsset = (typeof f === "object") && (f?.type === "added" || f?.type === "new" || f?.status === "added");
        const absolutePath = filePath ? `${context.repoRoot}/${filePath}`.replaceAll("//", "/") : "";
        const assetIsLarge = absolutePath && fs.existsSync(absolutePath)
          ? fs.statSync(absolutePath).size >= largeAssetBytes
          : false;
        if (filePath && /\.(png|jpg|jpeg|mp4)$/i.test(filePath) && (isNewAsset || assetIsLarge)) {
          addFinding(createFinding({
            severity: "warning",
            category: "performance",
            code: "perf-degradation-large-asset",
            message: t("performance.perf-degradation-large-asset"),
            action: t("precision.performance"),
            files: [filePath]
          }));
        }
      }
      if (typeof totalAddedLines === "number" && totalAddedLines > 500) {
        addFinding(createFinding({
          severity: "warning",
          category: "performance",
          code: "perf-degradation-large-change",
          message: t("performance.perf-degradation-large-change"),
          action: t("precision.performance"),
          files: changes.map((item) => typeof item === "string" ? item : item?.path).filter(Boolean)
        }));
      }
    }
  },
  {
    name: "hardcoded-secrets",
    run({ context, addFinding, t }) {
      const securityPolicy = context.policy?.security;
      if (!securityPolicy || securityPolicy.enabled === false) return;
      if (securityPolicy.hardcodedSecrets === false) return;

      const { repoRoot, changedFiles } = context;
      if (!changedFiles || changedFiles.length === 0) return;

      const patterns = [
        { regex: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS Access Key" },
        { regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["'][A-Za-z0-9/+=]{40}["']/, label: "AWS Secret Key" },
        { regex: /(?:AZURE_CLIENT_SECRET|azure_client_secret)\s*[=:]\s*["'][^"']{8,}["']/i, label: "Azure Client Secret" },
        { regex: /\bAIza[0-9A-Za-z\-_]{35}\b/, label: "GCP API Key" },
        { regex: /\bsk-[A-Za-z0-9]{20}T3BlbkFJ[A-Za-z0-9]{20}\b/, label: "OpenAI API Key" },
        { regex: /\bsk-ant-[A-Za-z0-9\-_]{20,}\b/, label: "Anthropic API Key" },
        { regex: /(?:MISTRAL_API_KEY|mistral_api_key)\s*[=:]\s*["'][^"']{8,}["']/i, label: "Mistral API Key" },
        { regex: /(?:password|passwd|pwd)\s*[=:]\s*["'][^"']{6,}["']/i, label: "Generic Password" },
        { regex: /(?:api[_-]?key|apikey)\s*[=:]\s*["'][^"']{8,}["']/i, label: "Generic API Key" },
        { regex: /(?:secret|token)\s*[=:]\s*["'][A-Za-z0-9\-._~+/]{16,}["']/i, label: "Generic Secret/Token" }
      ];

      const testLike = /\.(test|spec)\.(js|ts|mjs|cjs|jsx|tsx)$|__tests__|fixtures|mock/i;

      for (const filePath of changedFiles) {
        if (testLike.test(filePath)) continue;
        let content;
        try {
          content = execFileSync(
            "git",
            ["diff", "--cached", "--", filePath],
            { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
          );
          if (!content.trim()) {
            content = execFileSync(
              "git",
              ["diff", "--", filePath],
              { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
            );
          }
        } catch {
          continue;
        }
        const addedLines = content.split("\n").filter((line) => /^\+/.test(line) && !/^\+\+\+/.test(line));
        const found = new Set();
        for (const { regex, label } of patterns) {
          for (const line of addedLines) {
            if (regex.test(line) && !found.has(label)) {
              found.add(label);
              addFinding(createFinding({
                severity: "warning",
                category: "risk",
                code: "hardcoded-secrets",
                message: t("findings.secretsSafetyDetected", { file: filePath, type: label }),
                action: t("actions.secretsToEnvOrManager"),
                files: [filePath]
              }));
            }
          }
        }
      }
    }
  },
  {
    name: "unsafe-patterns",
    run({ context, addFinding, t }) {
      const securityPolicy = context.policy?.security;
      if (!securityPolicy || securityPolicy.enabled === false) return;
      if (securityPolicy.unsafePatterns === false) return;

      const { repoRoot, changedFiles } = context;
      if (!changedFiles || changedFiles.length === 0) return;

      const patterns = [
        { regex: /\beval\s*\(/, label: "eval()" },
        { regex: /\.innerHTML\s*=/, label: "innerHTML" },
        { regex: /dangerouslySetInnerHTML/, label: "dangerouslySetInnerHTML" },
        { regex: /chmod\s+777/, label: "chmod 777" },
        { regex: /cors\s*\(\s*\{[^}]*origin\s*:\s*["']\*["']/i, label: "cors(*)" },
        { regex: /(?:execSync|execFileSync)\s*\(/, label: "exec()" },
        { regex: /(?:subprocess|child_process)\.exec/, label: "subprocess.exec" },
        { regex: /setTimeout\s*\([^,]+,\s*0\s*\)/, label: "setTimeout(..., 0)" }
      ];

      const codeFiles = changedFiles.filter((f) => /\.(js|ts|mjs|cjs|jsx|tsx|py|rb|sh)$/i.test(f));

      for (const filePath of codeFiles) {
        let content;
        try {
          content = execFileSync(
            "git",
            ["diff", "--cached", "--", filePath],
            { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
          );
          if (!content.trim()) {
            content = execFileSync(
              "git",
              ["diff", "--", filePath],
              { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
            );
          }
        } catch {
          continue;
        }
        const addedLines = content.split("\n").filter((line) => /^\+/.test(line) && !/^\+\+\+/.test(line));
        const found = [];

        for (const { regex, label } of patterns) {
          for (const line of addedLines) {
            if (regex.test(line) && !found.includes(label)) {
              found.push(label);
            }
          }
        }

        if (found.length > 0) {
          addFinding(createFinding({
            severity: "warning",
            category: "risk",
            code: "unsafe-patterns",
            message: t("findings.unsafePatternDetected", { file: filePath, patterns: found.join(", ") }),
            action: t("actions.useSaferAlternative"),
            files: [filePath]
          }));
        }
      }
    }
  },
  {
    name: "sensitive-file-change",
    run({ context, addFinding, t }) {
      const securityPolicy = context.policy?.security;
      if (!securityPolicy || securityPolicy.enabled === false) return;
      if (securityPolicy.sensitiveFiles === false) return;

      const { changedFiles } = context;
      if (!changedFiles || changedFiles.length === 0) return;

      const sensitivePatterns = [
        /^\.env($|\.)/i,
        /credentials/i,
        /\.htpasswd$/i,
        /\.pem$/i,
        /\.key$/i,
        /\.p12$/i,
        /\.pfx$/i,
        /\.jks$/i,
        /id_rsa/i,
        /id_ed25519/i,
        /id_ecdsa/i
      ];

      const sensitiveFiles = changedFiles.filter((filePath) =>
        sensitivePatterns.some((pattern) => pattern.test(filePath))
      );

      if (sensitiveFiles.length > 0) {
        addFinding(createFinding({
          severity: "warning",
          category: "risk",
          code: "sensitive-file-change",
          message: t("findings.sensitiveFileChanged", { files: sensitiveFiles.join(", ") }),
          action: t("actions.confirmNoRealCredentialsInGitignore"),
          files: sensitiveFiles
        }));
      }
    }
  },
  {
    name: "big-bang-warning",
    run({ context, addFinding, t }) {
      if (context.hasSkipAcknowledgement("big-bang")) return;

      const changedFiles = context.changedFiles || [];
      const topLevelEntries = context.topLevelEntries || [];

      if (changedFiles.length <= 15) return;
      if (topLevelEntries.length < 3) return;

      let totalAddedLines = 0;
      for (const f of changedFiles) {
        const addedLines = (typeof f === "object") ? (f?.addedLines ?? 0) : 0;
        if (typeof addedLines === "number") totalAddedLines += addedLines;
      }
      if (totalAddedLines <= 300) return;

      addFinding(createFinding({
        severity: "warning",
        category: "consistency",
        code: "big-bang-change",
        message: t("findings.bigBangChange", {
          files: changedFiles.length,
          dirs: topLevelEntries.length,
          lines: totalAddedLines
        }),
        action: t("actions.splitBigBang"),
        files: changedFiles,
        skipKey: "big-bang"
      }));
    }
  },
  {
    name: "mutation-test-quality",
    async run({ context, addFinding, t }) {
      const mutationConfig = context?.config?.checks?.mutation ?? {};
      if (!mutationConfig.enabled) return;

      const sourceFiles = context.sourceFiles ?? [];
      if (sourceFiles.length === 0) return;

      const testCommand = mutationConfig.testCommand ?? null;

      if (!testCommand) return;

      try {
        const result = await runMutationTests({
          repoRoot: context.repoRoot,
          changedFiles: sourceFiles,
          testCommand,
          timeoutMs: mutationConfig.timeoutMs ?? 15000,
          maxMutations: mutationConfig.maxMutations ?? 20
        });

        if (result.baselineOk === false) {
          addFinding(createFinding({
            severity: "warning",
            category: "validation",
            code: "mutation-test-error",
            message: t("findings.mutation-test-error"),
            action: t("actions.reviewMutationConfig")
          }));
          return;
        }

        if (result.total === 0) return;

        const threshold = mutationConfig.survivalThreshold ?? 50;
        const survived = result.mutations.filter((m) => !m.killed && !m.error);

        if (survived.length > 0 && result.score < threshold) {
          const sampleFiles = [...new Set(survived.slice(0, 3).map((m) => `${m.file}:${m.line}`))].join(", ");
          addFinding(createFinding({
            severity: "warning",
            category: "validation",
            code: "mutation-survivors-detected",
            message: t("findings.mutation-survivors-detected", {
              survived: survived.length,
              total: result.total,
              score: result.score,
              sample: sampleFiles
            }),
            action: t("actions.reviewMutationSurvivors"),
            files: [...new Set(survived.map((m) => m.file))]
          }));
        }
      } catch {
        addFinding(createFinding({
          severity: "warning",
          category: "validation",
          code: "mutation-test-error",
          message: t("findings.mutation-test-error"),
          action: t("actions.reviewMutationConfig")
        }));
      }
    }
  }
];
