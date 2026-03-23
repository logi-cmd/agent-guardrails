import crypto from "node:crypto";
import path from "node:path";
import { suggestTaskContractDefaults } from "../automation/plan-defaults.js";
import { buildPolicy } from "../check/policy.js";
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

function buildFinishCheckHints({ requiredCommands, evidencePaths }) {
  const hints = [];

  if (requiredCommands.length > 0) {
    hints.push(`Report the commands you actually ran: ${requiredCommands.join(", ")}`);
  }

  if (evidencePaths.length > 0) {
    hints.push(`Keep the evidence note current: ${evidencePaths.join(", ")}`);
  }

  hints.push("Finish with agent-guardrails check --review before handing off or merging.");
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
  evidencePaths
}) {
  const createdAt = new Date().toISOString();
  const finishCheckHints = buildFinishCheckHints({ requiredCommands, evidencePaths });

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
    finishCheckHints,
    riskSignals: protectedMatches.map((match) => ({
      type: "protected-area",
      label: match.label,
      minimumRiskLevel: match.minimumRiskLevel,
      files: match.files
    })),
    nextActions
  };
}

function buildNextActions({ requiredCommands, evidencePaths, riskLevel, requiresReviewNotes }) {
  const actions = [];

  actions.push("Implement the smallest change that fits the contract.");

  if (requiredCommands.length > 0) {
    actions.push(`Run required commands: ${requiredCommands.join(", ")}`);
  }

  if (evidencePaths.length > 0) {
    actions.push(`Update evidence: ${evidencePaths.join(", ")}`);
  }

  if (requiresReviewNotes || ["high", "critical"].includes(riskLevel)) {
    actions.push("Capture review-oriented notes before finishing.");
  }

  actions.push("Run agent-guardrails check --review before completing the task.");
  return actions;
}

function buildContinuityHints({ taskContract, review }) {
  const hints = [];

  if ((taskContract?.intendedFiles ?? []).length > 0) {
    hints.push("Prefer extending the declared intended files before creating new helpers, services, or hooks.");
  }

  if (review.summary.consistencyConcerns > 0) {
    hints.push("Keep the implementation aligned with existing repo patterns so the next change stays easy to maintain.");
  }

  if ((taskContract?.session?.riskSignals ?? []).length > 0) {
    hints.push("High-risk paths are involved, so preserve the existing structure unless the task contract is updated first.");
  }

  return unique(hints);
}

export function readRepoGuardrails(repoRoot) {
  const config = readConfig(repoRoot);
  if (!config) {
    return null;
  }

  const policy = buildPolicy(config);
  const defaults = suggestTaskContractDefaults(config);

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
  changedFiles = []
}) {
  const config = readConfig(repoRoot);
  if (!config) {
    return null;
  }

  const task = flags.task || positional.join(" ");
  const defaults = suggestTaskContractDefaults(config);
  const runtimeFiles = getRuntimeFileContext({ selectedFiles, changedFiles });
  const explicitAllowedPaths = parseCommaSeparatedList(flags["allow-paths"] || flags.allow);
  const explicitRequiredCommands = parseStringList(flags["required-commands"] || flags.commands);
  const explicitEvidencePaths = parseCommaSeparatedList(flags["evidence-paths"] || flags.evidence);
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
  if (parseCommaSeparatedList(flags["intended-files"]).length === 0 && intendedFiles.length > 0) {
    autoFilledFields.push("intended files");
  }

  const contractSource = selectedRepoFiles.length > 0 ? "runtime-suggested" : autoFilledFields.length > 0 ? "preset-defaults" : "manual";
  const nextActions = buildNextActions({ requiredCommands, evidencePaths, riskLevel, requiresReviewNotes });
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
    evidencePaths
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
      validationProfile
    }
  };
}

export function suggestTaskContract(options) {
  return bootstrapTaskSession(options);
}

export function prepareFinishCheck({ repoRoot, session = null, commandsRun = [], baseRef = "" }) {
  const normalizedCommandsRun = unique(commandsRun.map((item) => String(item).trim()).filter(Boolean));
  const finishCheckHints = session?.finishCheckHints ?? [];
  const evidencePaths = session?.evidencePathSuggested ? [session.evidencePathSuggested] : [];
  const requiredCommands = session?.requiredCommandsSuggested ?? [];
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
    nextActions: [
      ...finishCheckHints,
      `Use this finish-time command: ${checkArgs.join(" ")}`
    ]
  };
}

export function summarizeReviewRisks(result) {
  const nextActions = [];

  if (result.missingRequiredCommands.length > 0) {
    nextActions.push(`Run the missing required commands: ${result.missingRequiredCommands.join(", ")}`);
  }

  if (result.missingEvidencePaths.length > 0) {
    nextActions.push(`Create or update evidence files: ${result.missingEvidencePaths.join(", ")}`);
  }

  if (result.review.summary.scopeIssues > 0) {
    nextActions.push("Narrow the change so it matches the declared task scope.");
  }

  if (result.review.summary.consistencyConcerns > 0) {
    nextActions.push("Resolve consistency and architecture concerns before merge.");
  }

  if (result.review.summary.riskConcerns > 0) {
    nextActions.push("Add explicit reviewer notes or reduce risk before merge.");
  }

  const continuityHints = buildContinuityHints({
    taskContract: result.taskContract,
    review: result.review
  });

  if (nextActions.length === 0) {
    nextActions.push("The guardrail check passed. Review the summary and merge when ready.");
  }

  return {
    status: result.ok ? "pass" : "fail",
    topRisks: [
      ...result.review.scopeIssues,
      ...result.review.validationIssues,
      ...result.review.consistencyConcerns,
      ...result.review.riskConcerns
    ].slice(0, 5),
    nextActions: unique([...nextActions, ...continuityHints])
  };
}
