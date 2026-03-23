import crypto from "node:crypto";
import path from "node:path";
import { suggestTaskContractDefaults } from "../automation/plan-defaults.js";
import { buildPolicy } from "../check/policy.js";
import { createTranslator } from "../i18n.js";
import {
  getProtectedAreas,
  normalizeChangeType,
  normalizeRepoPath,
  parseCommaSeparatedList,
  parseStringList,
  readConfig,
  unique
} from "../utils.js";

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

function getParentScope(filePath) {
  const normalized = normalizeRepoPath(filePath);
  const directory = path.posix.dirname(normalized);
  if (!directory || directory === ".") {
    return normalized;
  }

  return `${directory.replace(/\/+$/, "")}/`;
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
      session
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
      riskDimensions: riskDimensionSelection.riskDimensions
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

export function summarizeReviewRisks(result, locale = null) {
  const { t, locale: resolvedLocale } = createTranslator(locale ?? "en");
  const nextActions = [];

  if (result.missingRequiredCommands.length > 0) {
    nextActions.push(t("runtime.reviewRunMissingCommands", { value: result.missingRequiredCommands.join(", ") }));
  }

  if (result.missingEvidencePaths.length > 0) {
    nextActions.push(t("runtime.reviewCreateEvidence", { value: result.missingEvidencePaths.join(", ") }));
  }

  if (result.review.summary.scopeIssues > 0) {
    nextActions.push(t("runtime.reviewNarrowScope"));
  }

  if (result.review.summary.consistencyConcerns > 0) {
    nextActions.push(t("runtime.reviewResolveConsistency"));
  }

  if (result.review.summary.riskConcerns > 0) {
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

  return {
    status: result.ok ? "pass" : "fail",
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
