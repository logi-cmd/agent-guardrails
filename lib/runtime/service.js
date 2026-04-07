import crypto from "node:crypto";
import path from "node:path";
import { suggestTaskContractDefaults } from "../automation/plan-defaults.js";
import { buildPolicy } from "../check/policy.js";
import { createTranslator } from "../i18n.js";
import {
  getProtectedAreas,
  getParentScope,
  normalizeChangeType,
  normalizeRepoPath,
  parseCommaSeparatedList,
  parseStringList,
  readConfig,
  unique
} from "../utils.js";

// Generate precision prompts for key findings
// This helper filters warning findings, groups by category, and returns
// up to 3 prompts in the appropriate locale.
export function generatePrecisionPrompts({ findings = [], taskContract = {}, locale = "en" }) {
  const warnings = (findings || []).filter((f) => f?.severity === "warning");
  if (!warnings.length) return [];

  // Group by category (max one prompt per category)
  const seen = new Set();
  const selected = [];
  for (const f of warnings) {
    const category = (f?.category || "default").replace(/-/g, "_");
    if (!seen.has(category) && selected.length < 3) {
      seen.add(category);
      selected.push(f);
    }
  }

  if (!selected.length) return [];

  // Build translator for the given locale
  const { t } = createTranslator(locale);
  // Produce a string prompt per selected finding, based on its category
  const prompts = selected.map((f) => {
    const categoryKey = String((f?.category || "default").replace(/-/g, "_"));
    // Use i18n templates under the precision namespace when available
    const key = `precision.${categoryKey}`;
    let translated = t ? t(key, { code: f?.code ?? "" }) : String(f?.code ?? "");
    // Fallback: if translation is not available, provide hard-coded templates by locale
    if (!translated || translated === key) {
      const isZh = locale && String(locale).startsWith("zh");
      switch (categoryKey) {
        case "state_mgmt":
          translated = isZh
            ? "这次改动涉及状态管理文件，请确认同步逻辑是否正确？（是/否）"
            : "This change involves state management files. Confirm synchronization logic is correct? (yes/no)";
          break;
        case "continuity":
          translated = isZh
            ? "检测到异步逻辑风险模式，请确认已正确处理并发？（是/否）"
            : "Async logic risk pattern detected. Confirm concurrency is handled correctly? (yes/no)";
          break;
        case "performance":
          translated = isZh
            ? "检测到文件大幅增长，请确认是否需要拆分？（是/否）"
            : "Significant file growth detected. Consider splitting? (yes/no)";
          break;
        default:
          translated = isZh
            ? `检测到 ${f.code} 风险，请确认已处理？（是/否）`
            : `Risk ${f.code} detected. Confirm addressed? (yes/no)`;
      }
    }
    return translated;
  });

  return prompts;
}

function parseBooleanFlag(value) {
  if (value === true) {
    return true;
  }

  if (value === false || value == null) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function compareRiskLevel(left, right) {
  const order = ["low", "standard", "medium", "high", "critical"];
  return order.indexOf(left) - order.indexOf(right);
}

function maxRiskLevel(values) {
  return values.reduce((current, candidate) => {
    if (!candidate) {
      return current;
    }

    if (!current) {
      return candidate;
    }

    return compareRiskLevel(candidate, current) > 0 ? candidate : current;
  }, "");
}

function parseRuntimeFileList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(path.delimiter)
    .map((item) => normalizeRepoPath(item.trim()))
    .filter(Boolean);
}

function isRoughIntentTask(task) {
  const normalized = String(task || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const patterns = [
    /rough idea/,
    /smallest safe/,
    /smallest change/,
    /not sure/,
    /help me move/,
    /move this project forward/,
    /find the smallest/,
    /start with the smallest/,
    /help me figure out/,
    /未想清楚/,
    /还没想清楚/,
    /先找最小/,
    /最小能改/,
    /帮我推进这个项目/,
    /先帮我看看/,
    /粗想法/
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

function describePrimaryScope(intendedFiles, allowedPaths) {
  const preferredFile = intendedFiles.find((item) => !/tests?\//i.test(item)) ?? intendedFiles[0];
  if (preferredFile) {
    return preferredFile;
  }

  return allowedPaths[0] ?? "the existing repo target";
}

function buildRoughIntentSuggestions({
  task,
  intendedFiles,
  allowedPaths,
  requiredCommands,
  evidencePaths,
  t
}) {
  if (!isRoughIntentTask(task)) {
    return null;
  }

  const primaryScope = describePrimaryScope(intendedFiles, allowedPaths);
  const fallbackScope = primaryScope || "the existing repo target";
  const commandText = requiredCommands.length > 0 ? requiredCommands.join(", ") : "the required commands";
  const evidenceText = evidencePaths[0] ?? ".agent-guardrails/evidence/current-task.md";
  const defaultDone = [
    t("runtime.roughIntentDefaultDoneScope", { value: allowedPaths.join(", ") || fallbackScope }),
    t("runtime.roughIntentDefaultDoneCommands", { value: commandText }),
    t("runtime.roughIntentDefaultDoneEvidence", { value: evidenceText })
  ];

  const suggestions = [
    {
      id: "refine-existing-target",
      title: t("runtime.roughIntentTitleRefine"),
      task: t("runtime.roughIntentTaskRefine", { scope: fallbackScope }),
      smallestScope: unique([...allowedPaths, ...intendedFiles]).slice(0, 4),
      defaultDone,
      recommended: true
    },
    {
      id: "add-bounded-validation",
      title: t("runtime.roughIntentTitleValidation"),
      task: t("runtime.roughIntentTaskValidation", { scope: fallbackScope }),
      smallestScope: unique([...allowedPaths, ...intendedFiles]).slice(0, 4),
      defaultDone,
      recommended: false
    },
    {
      id: "tighten-test-coverage",
      title: t("runtime.roughIntentTitleTestCoverage"),
      task: t("runtime.roughIntentTaskTestCoverage", { scope: fallbackScope }),
      smallestScope: unique([...allowedPaths, ...intendedFiles]).slice(0, 4),
      defaultDone,
      recommended: false
    }
  ];

  return {
    detected: true,
    reason: t("runtime.roughIntentReason"),
    suggestions,
    recommendedTask: suggestions[0].task,
    firstNextAction: t("runtime.roughIntentFirstNextAction", { value: suggestions[0].task })
  };
}

function deriveSuggestedFiles(flags, selectedFiles, changedFiles) {
  const explicitIntendedFiles = parseCommaSeparatedList(flags["intended-files"]);
  if (explicitIntendedFiles.length > 0) {
    return explicitIntendedFiles;
  }

  const discovered = [...selectedFiles, ...changedFiles]
    .map((filePath) => normalizeRepoPath(filePath))
    .filter(Boolean);

  return unique(discovered);
}

function deriveAllowedPaths(explicitAllowedPaths, suggestedFiles, fallbackAllowedPaths) {
  if (explicitAllowedPaths.length > 0) {
    return explicitAllowedPaths;
  }

  if (suggestedFiles.length > 0) {
    return unique(suggestedFiles.map((filePath) => getParentScope(filePath)).filter(Boolean));
  }

  return fallbackAllowedPaths;
}

function getRuntimeFileContext({ selectedFiles = [], changedFiles = [] } = {}) {
  const envSelectedFiles = parseRuntimeFileList(process.env.AGENT_GUARDRAILS_SELECTED_FILES);
  const envChangedFiles = parseRuntimeFileList(process.env.AGENT_GUARDRAILS_CHANGED_FILES);

  return {
    selectedFiles: unique([...envSelectedFiles, ...selectedFiles].map((item) => normalizeRepoPath(item)).filter(Boolean)),
    changedFiles: unique([...envChangedFiles, ...changedFiles].map((item) => normalizeRepoPath(item)).filter(Boolean))
  };
}

function findProtectedMatches(config, files, repoRoot) {
  const areas = getProtectedAreas(config);

  return areas
    .map((area) => {
      const normalizedArea = typeof area === "string" ? { path: area } : area;
      if (!normalizedArea?.path) {
        return null;
      }

      const normalizedPath = normalizeRepoPath(normalizedArea.path);
      const matchedFiles = files.filter((filePath) => {
        const normalizedFile = normalizeRepoPath(filePath);
        return normalizedFile === normalizedPath || normalizedFile.startsWith(`${normalizedPath.replace(/\/+$/, "")}/`);
      });

      if (matchedFiles.length === 0) {
        return null;
      }

      return {
        path: normalizedPath,
        label: normalizedArea.label ?? normalizedPath,
        minimumRiskLevel: normalizedArea.minimumRiskLevel ?? "medium",
        requiresReviewNotes: Boolean(normalizedArea.requiresReviewNotes),
        files: matchedFiles
      };
    })
    .filter(Boolean);
}

function joinRiskLabels(labels, localeCode, { naturalLanguage = false } = {}) {
  const uniqueLabels = unique(labels);
  if (localeCode === "zh-CN") {
    return uniqueLabels.join("、");
  }

  if (!naturalLanguage) {
    return uniqueLabels.join(", ");
  }

  if (uniqueLabels.length <= 1) {
    return uniqueLabels.join("");
  }

  if (uniqueLabels.length === 2) {
    return `${uniqueLabels[0]} and ${uniqueLabels[1]}`;
  }

  return `${uniqueLabels.slice(0, -1).join(", ")}, and ${uniqueLabels.at(-1)}`;
}

function buildRiskDimensionReminder(riskDimensions, t, localeCode = "en", options = {}) {
  const labels = [];

  if ((riskDimensions?.securityRequirements ?? []).length > 0) {
    labels.push(t("runtime.riskLabelSecurity"));
  }
  if ((riskDimensions?.dependencyRequirements ?? []).length > 0) {
    labels.push(t("runtime.riskLabelDependency"));
  }
  if ((riskDimensions?.performanceRequirements ?? []).length > 0) {
    labels.push(t("runtime.riskLabelPerformance"));
  }
  if ((riskDimensions?.understandingRequirements ?? []).length > 0) {
    labels.push(t("runtime.riskLabelUnderstanding"));
  }
  if ((riskDimensions?.continuityRequirements ?? []).length > 0) {
    labels.push(t("runtime.riskLabelContinuity"));
  }

  if (labels.length === 0) {
    return "";
  }

  return t("runtime.riskDimensionReminder", {
    value: joinRiskLabels(labels, localeCode, options)
  });
}

function buildFinishCheckHints({ requiredCommands, evidencePaths, riskDimensions, t, localeCode }) {
  const hints = [];

  if (requiredCommands.length > 0) {
    hints.push(t("runtime.finishReportCommands", { value: requiredCommands.join(", ") }));
  }

  if (evidencePaths.length > 0) {
    hints.push(t("runtime.finishKeepEvidence", { value: evidencePaths.join(", ") }));
  }

  const riskDimensionReminder = buildRiskDimensionReminder(riskDimensions, t, localeCode, { naturalLanguage: true });
  if (riskDimensionReminder) {
    hints.push(riskDimensionReminder);
  }
  hints.push(t("runtime.finishRunCheck"));
  return hints;
}

function buildSessionMetadata({
  repoRoot,
  task,
  selectedFiles,
  changedFiles,
  autoFilledFields,
  contractSource,
  protectedMatches,
  nextActions,
  requiredCommands,
  evidencePaths,
  riskDimensions,
  t,
  localeCode
}) {
  const createdAt = new Date().toISOString();
  const finishCheckHints = buildFinishCheckHints({ requiredCommands, evidencePaths, riskDimensions, t, localeCode });
  const riskDimensionReminder = buildRiskDimensionReminder(riskDimensions, t, localeCode);

  return {
    version: 1,
    sessionId: crypto.randomUUID(),
    createdAt,
    repoRoot,
    taskRequest: task,
    contractSource,
    selectedFiles,
    changedFiles,
    autoFilledFields,
    requiredCommandsSuggested: requiredCommands,
    evidencePathSuggested: evidencePaths[0] ?? "",
    riskDimensions,
    finishCheckHints,
    riskSignals: protectedMatches.map((match) => ({
      type: "protected-area",
      label: match.label,
      minimumRiskLevel: match.minimumRiskLevel,
      files: match.files
    })),
    archaeologyNotes: [],
    nextActions: unique([...nextActions, riskDimensionReminder].filter(Boolean))
  };
}

function buildNextActions({ requiredCommands, evidencePaths, riskLevel, requiresReviewNotes, riskDimensions, t, localeCode }) {
  const actions = [];

  actions.push(t("runtime.nextActionImplement"));

  if (requiredCommands.length > 0) {
    actions.push(t("runtime.nextActionRunCommands", { value: requiredCommands.join(", ") }));
  }

  if (evidencePaths.length > 0) {
    actions.push(t("runtime.nextActionUpdateEvidence", { value: evidencePaths.join(", ") }));
  }

  if (requiresReviewNotes || ["high", "critical"].includes(riskLevel)) {
    actions.push(t("runtime.nextActionCaptureReviewNotes"));
  }

  const riskDimensionReminder = buildRiskDimensionReminder(riskDimensions, t, localeCode);
  if (riskDimensionReminder) {
    actions.push(riskDimensionReminder);
  }
  actions.push(t("runtime.nextActionRunCheck"));
  return actions;
}

function buildContinuityHints({ taskContract, review, t }) {
  const hints = [];

  if ((taskContract?.intendedFiles ?? []).length > 0) {
    hints.push(t("runtime.continuityPreferIntendedFiles"));
  }

  if (review.summary.consistencyConcerns > 0) {
    hints.push(t("runtime.continuityAlignPatterns"));
  }

  if ((taskContract?.session?.riskSignals ?? []).length > 0) {
    hints.push(t("runtime.continuityProtectStructure"));
  }

  if ((taskContract?.continuityRequirements ?? []).length > 0) {
    hints.push(t("runtime.continuityReusePatterns"));
  }

  return unique(hints);
}

function buildReuseTargets(taskContract = {}) {
  const targets = [];

  for (const filePath of taskContract.intendedFiles ?? []) {
    targets.push({
      type: "file",
      value: normalizeRepoPath(filePath)
    });
  }

  if (targets.length === 0) {
    for (const scope of taskContract.allowedPaths ?? []) {
      targets.push({
        type: "scope",
        value: normalizeRepoPath(scope)
      });
    }
  }

  const seen = new Set();
  return targets.filter((target) => {
    const key = `${target.type}:${target.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function getContinuityFindingFiles(findings, code) {
  return unique(
    findings
      .filter((finding) => finding.code === code)
      .flatMap((finding) => finding.files ?? [])
      .map((filePath) => normalizeRepoPath(filePath))
  );
}

export function buildContinuitySummary({
  taskContract = null,
  changedFiles = [],
  findings = [],
  review = { summary: {} },
  protectedAreaMatches = [],
  t,
  locale = null
} = {}) {
  const translator = t ?? createTranslator(locale ?? "en").t;
  const reuseTargets = buildReuseTargets(taskContract ?? {});
  const intendedFiles = (taskContract?.intendedFiles ?? []).map((filePath) => normalizeRepoPath(filePath));
  const broadenedFiles = intendedFiles.length > 0
    ? changedFiles
      .map((filePath) => normalizeRepoPath(filePath))
      .filter((filePath) => !intendedFiles.includes(filePath))
    : [];
  const parallelFiles = getContinuityFindingFiles(findings, "continuity-parallel-abstraction")
    .filter((filePath) => !intendedFiles.includes(filePath));
  const newSurfaceFiles = unique([...broadenedFiles, ...parallelFiles]);
  const continuityBreaks = [];
  const futureMaintenanceRisks = [];
  const nextActions = [];

  if (broadenedFiles.length > 0) {
    continuityBreaks.push({
      code: "broadened-beyond-intended",
      message: translator("runtime.continuityBreakBroadened", { value: broadenedFiles.join(", ") }),
      files: broadenedFiles
    });
    futureMaintenanceRisks.push(translator("runtime.futureMaintenanceRiskBroadened", { value: broadenedFiles.join(", ") }));
    nextActions.push(translator("runtime.continuityActionNarrowSurface", { value: broadenedFiles.join(", ") }));
  }

  if (parallelFiles.length > 0) {
    continuityBreaks.push({
      code: "parallel-abstraction-likely",
      message: translator("runtime.continuityBreakParallelAbstraction", { value: parallelFiles.join(", ") }),
      files: parallelFiles
    });
    futureMaintenanceRisks.push(translator("runtime.futureMaintenanceRiskParallelAbstraction", { value: parallelFiles.join(", ") }));
    nextActions.push(translator("runtime.continuityActionMergeParallel", { value: parallelFiles.join(", ") }));
  }

  const protectedStructureFiles = unique([
    ...protectedAreaMatches.flatMap((match) => match.files ?? []),
    ...getContinuityFindingFiles(findings, "continuity-sensitive-structure-change")
  ].map((filePath) => normalizeRepoPath(filePath)));

  if (protectedStructureFiles.length > 0) {
    continuityBreaks.push({
      code: "protected-structure-changed",
      message: translator("runtime.continuityBreakProtectedStructure"),
      files: protectedStructureFiles
    });
    futureMaintenanceRisks.push(translator("runtime.futureMaintenanceRiskProtectedStructure"));
    nextActions.push(translator("runtime.continuityActionPreserveStructure"));
  }

  if (reuseTargets.length > 0) {
    nextActions.push(
      translator("runtime.continuityActionReuseTargets", {
        value: reuseTargets.map((target) => target.value).join(", ")
      })
    );
  }

  if (review.summary?.consistencyConcerns > 0 && futureMaintenanceRisks.length === 0) {
    futureMaintenanceRisks.push(translator("runtime.futureMaintenanceRiskConsistency"));
  }

  return {
    reuseTargets,
    newSurfaceFiles,
    continuityBreaks,
    futureMaintenanceRisks: unique(futureMaintenanceRisks),
    nextActions: unique(nextActions),
    hints: buildContinuityHints({ taskContract, review, t: translator })
  };
}

function collectRiskDimensions(defaults, flags = {}) {
  const explicitSecurityRequirements = parseStringList(flags["security-requirements"]);
  const explicitDependencyRequirements = parseStringList(flags["dependency-requirements"]);
  const explicitPerformanceRequirements = parseStringList(flags["performance-requirements"]);
  const explicitUnderstandingRequirements = parseStringList(flags["understanding-requirements"]);
  const explicitContinuityRequirements = parseStringList(flags["continuity-requirements"]);

  const securityRequirements = explicitSecurityRequirements.length > 0
    ? explicitSecurityRequirements
    : defaults.securityRequirements ?? [];
  const dependencyRequirements = explicitDependencyRequirements.length > 0
    ? explicitDependencyRequirements
    : defaults.dependencyRequirements ?? [];
  const performanceRequirements = explicitPerformanceRequirements.length > 0
    ? explicitPerformanceRequirements
    : defaults.performanceRequirements ?? [];
  const understandingRequirements = explicitUnderstandingRequirements.length > 0
    ? explicitUnderstandingRequirements
    : defaults.understandingRequirements ?? [];
  const continuityRequirements = explicitContinuityRequirements.length > 0
    ? explicitContinuityRequirements
    : defaults.continuityRequirements ?? [];

  return {
    riskDimensions: {
      securityRequirements,
      dependencyRequirements,
      performanceRequirements,
      understandingRequirements,
      continuityRequirements
    },
    explicitSecurityRequirements,
    explicitDependencyRequirements,
    explicitPerformanceRequirements,
    explicitUnderstandingRequirements,
    explicitContinuityRequirements
  };
}

export function readRepoGuardrails(repoRoot, locale = null) {
  const config = readConfig(repoRoot);
  if (!config) {
    return null;
  }

  const policy = buildPolicy(config);
  const defaults = suggestTaskContractDefaults(config, locale);

  return {
    repoRoot,
    preset: config.preset,
    defaults,
    policy: {
      allowedPaths: policy.allowedPaths,
      maxChangedFilesPerTask: policy.consistency.maxChangedFilesPerTask,
      maxTopLevelEntries: policy.consistency.maxTopLevelEntries,
      requireTestsWithSourceChanges: Boolean(policy.correctness.requireTestsWithSourceChanges)
    },
    protectedAreas: getProtectedAreas(config),
    productionProfiles: config.productionProfiles ?? {},
    languagePlugins: config.languagePlugins ?? {}
  };
}

export function bootstrapTaskSession({
  repoRoot,
  flags = {},
  positional = [],
  selectedFiles = [],
  changedFiles = [],
  locale = null
}) {
  const { t, locale: resolvedLocale } = createTranslator(locale ?? "en");
  const config = readConfig(repoRoot);
  if (!config) {
    return null;
  }

  const task = flags.task || positional.join(" ");
  const defaults = suggestTaskContractDefaults(config, resolvedLocale);
  const runtimeFiles = getRuntimeFileContext({ selectedFiles, changedFiles });
  const explicitAllowedPaths = parseCommaSeparatedList(flags["allow-paths"] || flags.allow);
  const explicitRequiredCommands = parseStringList(flags["required-commands"] || flags.commands);
  const explicitEvidencePaths = parseCommaSeparatedList(flags["evidence-paths"] || flags.evidence);
  const riskDimensionSelection = collectRiskDimensions(defaults, flags);
  const intendedFiles = deriveSuggestedFiles(flags, runtimeFiles.selectedFiles, runtimeFiles.changedFiles);
  const allowedPaths = deriveAllowedPaths(explicitAllowedPaths, intendedFiles, defaults.allowedPaths);
  const requiredCommands = explicitRequiredCommands.length > 0 ? explicitRequiredCommands : defaults.requiredCommands;
  const evidencePaths = explicitEvidencePaths.length > 0 ? explicitEvidencePaths : defaults.evidencePaths;
  const protectedPaths = parseCommaSeparatedList(flags["protected-paths"]);
  const allowedChangeTypes = parseStringList(flags["allowed-change-types"])
    .map((item) => normalizeChangeType(item))
    .filter(Boolean);
  const validationProfile = flags["validation-profile"]
    ? String(flags["validation-profile"]).trim().toLowerCase()
    : "standard";
  const configuredRiskLevel = flags["risk-level"] ? String(flags["risk-level"]).trim().toLowerCase() : "";
  const selectedRepoFiles = unique([...runtimeFiles.selectedFiles, ...runtimeFiles.changedFiles]);
  const protectedMatches = findProtectedMatches(config, selectedRepoFiles.length > 0 ? selectedRepoFiles : intendedFiles, repoRoot);
  const protectedRiskLevel = maxRiskLevel(protectedMatches.map((match) => match.minimumRiskLevel));
  const riskLevel = maxRiskLevel([configuredRiskLevel || "standard", protectedRiskLevel || ""]);
  const requiresReviewNotes = parseBooleanFlag(flags["requires-review-notes"]) || protectedMatches.some((match) => match.requiresReviewNotes);

  const autoFilledFields = [];
  if (explicitAllowedPaths.length === 0 && allowedPaths.length > 0) {
    autoFilledFields.push("allowed paths");
  }
  if (explicitRequiredCommands.length === 0 && requiredCommands.length > 0) {
    autoFilledFields.push("required commands");
  }
  if (explicitEvidencePaths.length === 0 && evidencePaths.length > 0) {
    autoFilledFields.push("evidence paths");
  }
  if (riskDimensionSelection.explicitSecurityRequirements.length === 0 && riskDimensionSelection.riskDimensions.securityRequirements.length > 0) {
    autoFilledFields.push("security requirements");
  }
  if (riskDimensionSelection.explicitDependencyRequirements.length === 0 && riskDimensionSelection.riskDimensions.dependencyRequirements.length > 0) {
    autoFilledFields.push("dependency requirements");
  }
  if (riskDimensionSelection.explicitPerformanceRequirements.length === 0 && riskDimensionSelection.riskDimensions.performanceRequirements.length > 0) {
    autoFilledFields.push("performance requirements");
  }
  if (riskDimensionSelection.explicitUnderstandingRequirements.length === 0 && riskDimensionSelection.riskDimensions.understandingRequirements.length > 0) {
    autoFilledFields.push("understanding requirements");
  }
  if (riskDimensionSelection.explicitContinuityRequirements.length === 0 && riskDimensionSelection.riskDimensions.continuityRequirements.length > 0) {
    autoFilledFields.push("continuity requirements");
  }
  if (parseCommaSeparatedList(flags["intended-files"]).length === 0 && intendedFiles.length > 0) {
    autoFilledFields.push("intended files");
  }

  const contractSource = selectedRepoFiles.length > 0 ? "runtime-suggested" : autoFilledFields.length > 0 ? "preset-defaults" : "manual";
  const nextActions = buildNextActions({
    requiredCommands,
    evidencePaths,
    riskLevel,
    requiresReviewNotes,
    riskDimensions: riskDimensionSelection.riskDimensions,
    t,
    localeCode: resolvedLocale
  });
  const roughIntent = buildRoughIntentSuggestions({
    task,
    intendedFiles,
    allowedPaths,
    requiredCommands,
    evidencePaths,
    t
  });
  if (roughIntent?.firstNextAction) {
    nextActions.unshift(roughIntent.firstNextAction);
  }
  const session = buildSessionMetadata({
    repoRoot,
    task,
    selectedFiles: selectedRepoFiles,
    changedFiles: runtimeFiles.changedFiles,
    autoFilledFields,
    contractSource,
    protectedMatches,
    nextActions,
    requiredCommands,
    evidencePaths,
    riskDimensions: riskDimensionSelection.riskDimensions,
    t,
    localeCode: resolvedLocale
  });
  session.roughIntent = roughIntent;

  return {
    contract: {
      task,
      preset: config.preset,
      allowedPaths,
      intendedFiles,
      requiredCommands,
      evidencePaths,
      protectedPaths,
      allowedChangeTypes,
      riskLevel,
      requiresReviewNotes,
      validationProfile,
      ...riskDimensionSelection.riskDimensions,
      session,
      roughIntent
    },
    session,
    suggestions: {
      allowedPaths,
      intendedFiles,
      requiredCommands,
      evidencePaths,
      riskLevel,
      requiresReviewNotes,
      validationProfile,
      riskDimensions: riskDimensionSelection.riskDimensions,
      roughIntent
    }
  };
}

export function suggestTaskContract(options) {
  return bootstrapTaskSession(options);
}

export function prepareFinishCheck({ repoRoot, session = null, commandsRun = [], baseRef = "", locale = null }) {
  const { t, locale: resolvedLocale } = createTranslator(locale ?? "en");
  const normalizedCommandsRun = unique(commandsRun.map((item) => String(item).trim()).filter(Boolean));
  const finishCheckHints = session?.finishCheckHints ?? [];
  const evidencePaths = session?.evidencePathSuggested ? [session.evidencePathSuggested] : [];
  const requiredCommands = session?.requiredCommandsSuggested ?? [];
  const riskDimensionReminder = buildRiskDimensionReminder(session?.riskDimensions, t, resolvedLocale);
  const normalizedBaseRef = String(baseRef || "").trim();
  const suggestedBaseRef = normalizedBaseRef || "origin/main";
  const checkArgs = [
    "agent-guardrails check",
    "--review",
    `--base-ref ${suggestedBaseRef}`
  ];

  if (normalizedCommandsRun.length > 0) {
    checkArgs.push(`--commands-run "${normalizedCommandsRun.join(", ")}"`);
  }

  return {
    repoRoot,
    sessionId: session?.sessionId ?? "",
    baseRef: normalizedBaseRef,
    suggestedBaseRef,
    commandsRun: normalizedCommandsRun,
    requiredCommands,
    evidencePaths,
    finishCheckHints,
    recommendedCommand: checkArgs.join(" "),
    nextActions: unique([
      ...finishCheckHints,
      riskDimensionReminder,
      t("runtime.finishUseCommand", { value: checkArgs.join(" ") })
    ].filter(Boolean))
  };
}

function buildCostHints(result) {
  const totalFiles = (result.changedFiles || []).length;
  const sourceFiles = (result.sourceFiles || []).length;
  const hasErrors = result.findings.some((f) => f.severity === "error");
  const hasWarnings = result.findings.some((f) => f.severity === "warning");

  const lowEstimate = totalFiles * 50;
  const highEstimate = sourceFiles * 1500 + (totalFiles - sourceFiles) * 200;

  let sizeLevel;
  if (totalFiles <= 3) {
    sizeLevel = "Small";
  } else if (totalFiles <= 8) {
    sizeLevel = "Medium";
  } else if (totalFiles <= 15) {
    sizeLevel = "Large";
  } else {
    sizeLevel = "VeryLarge";
  }

  const entries = [];

  entries.push({
    key: `check.costSize${sizeLevel}`,
    vars: { totalFiles, sourceFiles }
  });

  entries.push({
    key: "check.costTokenEstimate",
    vars: { low: formatTokens(lowEstimate), high: formatTokens(highEstimate) }
  });

  if (totalFiles > 8) {
    entries.push({ key: "check.costLargeChangeWarning", vars: {} });
  }

  if (hasErrors || hasWarnings) {
    const errorCount = result.findings.filter((f) => f.severity === "error").length;
    const warningCount = result.findings.filter((f) => f.severity === "warning").length;
    entries.push({
      key: "check.costFixCostHint",
      vars: { errorCount, warningCount }
    });
  }

  return {
    sizeLevel,
    tokenEstimate: { low: lowEstimate, high: highEstimate },
    entries
  };
}

function formatTokens(count) {
  if (count >= 1000) return `${Math.round(count / 1000)}k`;
  return String(count);
}

const RECOVERY_MAP = {
  "path-scope-violation": "recovery.revertOrNarrowScope",
  "task-scope-violation": "recovery.revertOrNarrowScope",
  "repo-allowed-path-violation": "recovery.revertOrNarrowScope",
  "task-path-violation": "recovery.revertOrNarrowScope",
  "intended-file-violation": "recovery.revertOrNarrowScope",
  "missing-required-commands": "recovery.runOrSkipCommands",
  "missing-evidence": "recovery.writeEvidenceFile",
  "protected-area-touched": "recovery.revertOrAddReviewNotes",
  "secrets-safety": "recovery.moveSecretsToEnv",
  "change-type-violation": "recovery.revertOrWidenContract",
  "test-coverage-missing": "recovery.addTestsOrAcknowledge"
};

const RECOVERY_MAP_WARNINGS = {
  "changed-file-budget-exceeded": "recovery.reduceFilesOrRaiseBudget",
  "broad-top-level-change": "recovery.consolidateDirectories",
  "task-breadth-suspicious": "recovery.narrowBreadth",
  "secrets-safety": "recovery.moveSecretsToEnv",
  "unsafe-patterns": "recovery.reviewUnsafePattern",
  "sensitive-file-change": "recovery.reviewSensitiveFile",
  "perf-degradation-large-change": "recovery.splitLargeChange",
  "minor-scope-violation": "recovery.expandScopeOrAcknowledge",
  "continuity-breadth-warning": "recovery.narrowToCoreFiles",
  "config-or-migration-change": "recovery.reviewConfigChange"
};

function buildRecoveryGuidance(result, t) {
  const findings = result.findings || [];
  const errorFindings = findings.filter((f) => f.severity === "error");
  const warningFindings = findings.filter((f) => f.severity === "warning");

  const errorGuidance = [];
  const warningGuidance = [];
  const seenError = new Set();
  const seenWarning = new Set();

  for (const finding of errorFindings) {
    const key = RECOVERY_MAP[finding.code];
    if (key && !seenError.has(key)) {
      seenError.add(key);
      errorGuidance.push(t(key));
    }
  }

  for (const finding of warningFindings) {
    const key = RECOVERY_MAP_WARNINGS[finding.code];
    if (key && !seenWarning.has(key)) {
      seenWarning.add(key);
      warningGuidance.push(t(key));
    }
  }

  return { errorGuidance, warningGuidance };
}

export function summarizeReviewRisks(result, locale = null) {
  const { t, locale: resolvedLocale } = createTranslator(locale ?? "en");
  const nextActions = [];

  const recoveryGuidance = buildRecoveryGuidance(result, t);
  if (recoveryGuidance.errorGuidance.length > 0) {
    nextActions.push(...recoveryGuidance.errorGuidance);
  }
  if (recoveryGuidance.warningGuidance.length > 0) {
    nextActions.push(...recoveryGuidance.warningGuidance);
  }

  if (result.missingRequiredCommands.length > 0) {
    nextActions.push(t("runtime.reviewRunMissingCommands", { value: result.missingRequiredCommands.join(", ") }));
  }

  if (result.missingEvidencePaths.length > 0) {
    nextActions.push(t("runtime.reviewCreateEvidence", { value: result.missingEvidencePaths.join(", ") }));
  }

  if (result.review.summary.scopeIssues > 0) {
    nextActions.push(t("runtime.reviewNarrowScope"));
    nextActions.push(t("actions.expandScopeGuidance"));
  }

  if (result.review.summary.consistencyConcerns > 0) {
    nextActions.push(t("runtime.reviewResolveConsistency"));
  }

  const riskConcerns = result.review.riskConcerns ?? [];
  const riskWarningsThatDoNotBlockDeploy = new Set([
    "performance-sensitive-area-touched",
    "protected-area-touched",
    "continuity-sensitive-structure-change"
  ]);
  const blockingRiskConcerns = riskConcerns.filter((finding) => {
    if (finding.severity === "error") {
      return true;
    }

    return !riskWarningsThatDoNotBlockDeploy.has(finding.code);
  });

  if (blockingRiskConcerns.length > 0) {
    nextActions.push(t("runtime.reviewReduceRisk"));
  }

  const continuity = result.continuity ?? buildContinuitySummary({
    taskContract: result.taskContract,
    changedFiles: result.changedFiles ?? [],
    findings: result.findings ?? [],
    review: result.review,
    protectedAreaMatches: result.protectedAreaMatches ?? [],
    t
  });
  const riskDimensionReminder = buildRiskDimensionReminder(
    result.taskContract?.session?.riskDimensions ?? result.taskContract,
    t,
    resolvedLocale
  );

  if (riskDimensionReminder) {
    nextActions.push(riskDimensionReminder);
  }

  if (nextActions.length === 0) {
    nextActions.push(t("runtime.reviewPassed"));
  }

  const hasScopeIssues = (result.review.summary.scopeIssues ?? 0) > 0;
  const hasValidationIssues = (result.review.summary.validationIssues ?? 0) > 0;
  const hasBlockingRiskConcerns = blockingRiskConcerns.length > 0;
  const productionProfile = result.taskContract?.productionProfile ?? "";
  const nfrRequirements = result.taskContract?.nfrRequirements ?? [];
  const observabilityRequirements = result.taskContract?.observabilityRequirements ?? [];
  const rollbackNotes = String(result.taskContract?.rollbackNotes ?? "").trim();
  const expectedConcurrencyImpact = String(result.taskContract?.expectedConcurrencyImpact ?? "").trim();
  const loadSensitivePaths = result.taskContract?.loadSensitivePaths ?? [];
  const criticalPathFiles = result.criticalPathFiles ?? [];
  const observabilityCovered = !result.findings?.some((finding) => finding.code === "observability-requirements-unaddressed");
  const concurrencyCovered = !result.findings?.some((finding) => finding.code === "concurrency-requirements-unaddressed");
  const hasDeploySignals = Boolean(
    productionProfile ||
    nfrRequirements.length > 0 ||
    observabilityRequirements.length > 0 ||
    rollbackNotes
  );
  const deployReady = Boolean(
    result.ok &&
    productionProfile &&
    !hasScopeIssues &&
    !hasValidationIssues &&
    !hasBlockingRiskConcerns &&
    nfrRequirements.length > 0 &&
    (criticalPathFiles.length === 0 || rollbackNotes) &&
    observabilityCovered &&
    concurrencyCovered
  );

  let verdict = t("runtime.verdictSafeToReview");
  if (hasValidationIssues) {
    verdict = t("runtime.verdictValidationIncomplete");
  } else if (hasScopeIssues) {
    verdict = t("runtime.verdictNeedsContractUpdate");
  } else if (hasBlockingRiskConcerns) {
    verdict = t("runtime.verdictHighRiskChange");
  } else if (deployReady) {
    verdict = t("runtime.verdictSafeToDeploy");
  }

  const deployChecklist = [];
  if (productionProfile) {
    deployChecklist.push(t("runtime.deployChecklistProfile", { value: productionProfile }));
  }
  if (nfrRequirements.length > 0) {
    deployChecklist.push(t("runtime.deployChecklistNfr", { value: nfrRequirements.join(", ") }));
  }
  if (criticalPathFiles.length > 0) {
    deployChecklist.push(
      rollbackNotes
        ? t("runtime.deployChecklistRollbackReady", { value: rollbackNotes })
        : t("runtime.deployChecklistRollbackMissing", { value: criticalPathFiles.join(", ") })
    );
  }
  if (observabilityRequirements.length > 0) {
    deployChecklist.push(
      observabilityCovered
        ? t("runtime.deployChecklistObservabilityReady", { value: observabilityRequirements.join(", ") })
        : t("runtime.deployChecklistObservabilityMissing", { value: observabilityRequirements.join(", ") })
    );
  }
  if (expectedConcurrencyImpact || loadSensitivePaths.length > 0) {
    deployChecklist.push(
      concurrencyCovered
        ? t("runtime.deployChecklistPerformanceReady")
        : t("runtime.deployChecklistPerformanceMissing")
    );
  }

  const deployReadiness = {
    status: deployReady ? "ready" : hasDeploySignals ? "blocked" : "not-applicable",
    summary: deployReady
      ? t("runtime.deployReadinessReady")
      : hasDeploySignals
        ? t("runtime.deployReadinessBlocked")
        : t("runtime.deployReadinessNotApplicable"),
    checklist: deployChecklist
  };

  const operatorNextActions = [];
  if (rollbackNotes) {
    operatorNextActions.push(t("runtime.postDeployRollbackPath", { value: rollbackNotes }));
  } else if (criticalPathFiles.length > 0) {
    operatorNextActions.push(t("runtime.postDeployAddRollback"));
  }

  if (observabilityRequirements.length > 0) {
    operatorNextActions.push(
      observabilityCovered
        ? t("runtime.postDeployWatchObservability", { value: observabilityRequirements.join(", ") })
        : t("runtime.postDeployAddObservability")
    );
  } else if (productionProfile) {
    operatorNextActions.push(t("runtime.postDeployWatchHealth"));
  }

  if (expectedConcurrencyImpact || loadSensitivePaths.length > 0) {
    operatorNextActions.push(
      concurrencyCovered
        ? t("runtime.postDeployWatchPerformance")
        : t("runtime.postDeployValidatePerformance")
    );
  }

  if ((continuity.futureMaintenanceRisks ?? []).length > 0) {
    operatorNextActions.push(t("runtime.postDeployTrackMaintenance"));
  }

  const postDeployMaintenance = {
    summary: productionProfile
      ? t("runtime.postDeploySummaryProduction")
      : t("runtime.postDeploySummaryReview"),
    rollbackPath: rollbackNotes || t("runtime.postDeployRollbackUnknown"),
    observabilityStatus: observabilityRequirements.length === 0
      ? "not-declared"
      : observabilityCovered
        ? "covered"
        : "missing",
    operatorNextActions: unique(operatorNextActions)
  };

  return {
    status: result.ok ? "pass" : "fail",
    verdict,
    scoreVerdict: result.scoreVerdict || "",
    deployReadiness,
    postDeployMaintenance,
    costHints: buildCostHints(result),
    topRisks: [
      ...result.review.scopeIssues,
      ...result.review.validationIssues,
      ...result.review.consistencyConcerns,
      ...result.review.riskConcerns
    ].slice(0, 5),
    futureMaintenanceRisks: continuity.futureMaintenanceRisks ?? [],
    nextActions: unique([...nextActions, ...(continuity.hints ?? []), ...(continuity.nextActions ?? [])])
  };
}
