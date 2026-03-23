import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "../i18n.js";
import { prepareFinishCheck, summarizeReviewRisks } from "../runtime/service.js";
import { ossDetectors } from "../check/detectors/oss.js";
import { createFindingStore } from "../check/finding.js";
import { runDetectorPipeline } from "../check/pipeline.js";
import { buildPolicy, requiredPaths } from "../check/policy.js";
import { loadSemanticPlugins } from "../check/plugins.js";
import { buildReview } from "../check/review.js";
import {
  defaultTaskContractPath,
  findOutOfScopeFiles,
  getProtectedAreas,
  getTopLevelEntry,
  isPathWithinAllowedScope,
  isSourceFile,
  isTestFile,
  listChangedFiles,
  listChangedFilesFromBaseRef,
  normalizeChangeType,
  normalizeRepoPath,
  parseStringList,
  readConfig,
  readTaskContract,
  readTextIfExists,
  unique
} from "../utils.js";

function toBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  if (value == null) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function classifyChangeType(filePath, config) {
  const normalized = normalizeRepoPath(filePath);
  const lower = normalized.toLowerCase();
  const extension = path.posix.extname(lower);
  const baseName = path.posix.basename(lower);

  if (isTestFile(normalized, config)) {
    return "tests";
  }

  if ([".md", ".txt", ".rst"].includes(extension) || lower.startsWith("docs/")) {
    return "docs";
  }

  if (
    lower.includes("/migrations/") ||
    lower.includes("/migration/") ||
    lower.startsWith("migrations/") ||
    lower.startsWith("migration/") ||
    [".sql", ".prisma"].includes(extension)
  ) {
    return "migration";
  }

  if (
    baseName === "package.json" ||
    lower.endsWith(".json") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".toml") ||
    lower.startsWith(".github/") ||
    lower.startsWith(".agent-guardrails/")
  ) {
    return "config";
  }

  if (
    lower.endsWith(".d.ts") ||
    lower.includes("/types/") ||
    lower.includes("/contracts/") ||
    lower.includes("/schema/") ||
    lower.includes("/schemas/") ||
    lower.includes("/api/") ||
    baseName.includes("types.") ||
    baseName.includes("contract.") ||
    baseName.includes("schema.")
  ) {
    return "interface";
  }

  if (isSourceFile(normalized, config)) {
    return "implementation";
  }

  return "other";
}

function parseProtectedArea(area) {
  if (typeof area === "string") {
    return { path: area };
  }

  return area ?? {};
}

function findProtectedAreaMatches(changedFiles, areas, repoRoot) {
  const matches = [];

  for (const area of areas) {
    const normalizedArea = parseProtectedArea(area);
    const areaPath = normalizedArea.path ? normalizeRepoPath(normalizedArea.path) : "";
    if (!areaPath) {
      continue;
    }

    const files = changedFiles.filter((filePath) => isPathWithinAllowedScope(filePath, areaPath, repoRoot));
    if (files.length === 0) {
      continue;
    }

    matches.push({
      label: normalizedArea.label ?? areaPath,
      path: areaPath,
      severity: normalizedArea.severity ?? "high",
      minimumRiskLevel: normalizedArea.minimumRiskLevel ?? null,
      requiresReviewNotes: toBoolean(normalizedArea.requiresReviewNotes),
      action: normalizedArea.action ?? `Narrow the task contract or add stronger review notes for ${areaPath}.`,
      files
    });
  }

  return matches;
}

function hasSkipAcknowledgement(taskContract, key) {
  const acknowledgedSkips = taskContract?.acknowledgedSkips ?? [];
  return acknowledgedSkips.includes(key);
}

function summarizeEvidence(repoRoot, evidencePaths) {
  const summaries = evidencePaths.map((evidencePath) => {
    const absolutePath = path.join(repoRoot, evidencePath);
    const content = readTextIfExists(absolutePath);
    return {
      path: normalizeRepoPath(evidencePath),
      exists: content != null,
      hasReviewNotes: /residual risk|review note|review summary|risk:/i.test(content ?? ""),
      excerpt: content
        ? content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, 4)
        : []
    };
  });

  return {
    entries: summaries,
    hasReviewNotes: summaries.some((item) => item.hasReviewNotes),
    fullText: summaries.map((item) => item.excerpt.join("\n")).join("\n")
  };
}

function buildCheckResult({
  config,
  policy,
  baseRef,
  plugins,
  contractPath,
  changedFiles,
  sourceFiles,
  testFiles,
  allowedPaths,
  outOfScopeFiles,
  taskContract,
  taskAllowedPaths,
  outOfTaskScopeFiles,
  intendedFiles,
  outOfIntendedFiles,
  protectedPathMatches,
  configProtectedAreaMatches,
  commandsRun,
  requiredCommands,
  missingRequiredCommands,
  evidencePaths,
  missingEvidencePaths,
  changeTypes,
  review,
  evidenceSummary,
  warnings,
  failures,
  findings
}) {
  const topLevelEntries = unique(changedFiles.map((filePath) => getTopLevelEntry(filePath)));

  const finishCheck = prepareFinishCheck({
    repoRoot: config.repoRoot ?? "",
    session: taskContract?.session ?? null,
    commandsRun,
    baseRef: baseRef ?? ""
  });

  return {
    ok: failures.length === 0,
    preset: config.preset,
    diffSource: baseRef ? `git diff ${baseRef}...HEAD` : "working tree",
    baseRef,
    plugins,
    counts: {
      changedFiles: changedFiles.length,
      sourceFiles: sourceFiles.length,
      testFiles: testFiles.length,
      allowedPaths: allowedPaths.length,
      outOfScopeFiles: outOfScopeFiles.length,
      taskAllowedPaths: taskAllowedPaths.length,
      outOfTaskScopeFiles: outOfTaskScopeFiles.length,
      intendedFiles: intendedFiles.length,
      outOfIntendedFiles: outOfIntendedFiles.length,
      protectedPathMatches: protectedPathMatches.length,
      protectedAreaMatches: configProtectedAreaMatches.length,
      commandsRun: commandsRun.length,
      requiredCommands: requiredCommands.length,
      missingRequiredCommands: missingRequiredCommands.length,
      evidencePaths: evidencePaths.length,
      missingEvidencePaths: missingEvidencePaths.length,
      loadedPlugins: plugins.filter((plugin) => plugin.status === "loaded").length,
      missingPlugins: plugins.filter((plugin) => plugin.status === "missing").length,
      findings: findings.length,
      warnings: warnings.length,
      failures: failures.length
    },
    limits: {
      maxFilesPerTask: policy.consistency.maxChangedFilesPerTask,
      maxTopLevelEntries: policy.consistency.maxTopLevelEntries,
      requireTestsWithSourceChanges: Boolean(policy.correctness.requireTestsWithSourceChanges)
    },
    requiredPaths: requiredPaths(config),
    contractPath: taskContract ? normalizeRepoPath(contractPath) : null,
    changedFiles,
    sourceFiles,
    testFiles,
    topLevelEntries,
    changedFileTypes: unique(Object.values(changeTypes)),
    changeTypes,
    allowedPaths,
    outOfScopeFiles,
    taskContract,
    taskAllowedPaths,
    outOfTaskScopeFiles,
    intendedFiles,
    outOfIntendedFiles,
    protectedPathMatches,
    protectedAreaMatches: configProtectedAreaMatches,
    commandsRun,
    requiredCommands,
    missingRequiredCommands,
    evidencePaths,
    missingEvidencePaths,
    evidenceSummary,
    findings,
    review,
    finishCheck,
    runtime: summarizeReviewRisks({
      ok: failures.length === 0,
      missingRequiredCommands,
      missingEvidencePaths,
      review,
      taskContract
    }),
    warnings,
    failures
  };
}

function printFindingGroup(title, findings, t) {
  if (findings.length === 0) {
    return;
  }

  console.log(`\n${title}:`);
  for (const finding of findings) {
    console.log(`- ${t("check.findingSeverity", { severity: finding.severity, message: finding.message })}`);
    if (finding.action) {
      console.log(`  ${t("check.action", { value: finding.action })}`);
    }
  }
}

function printReviewSummary(review, t) {
  console.log(`\n${t("check.reviewSummary")}`);
  console.log(`- ${t("check.scopeIssues", { value: review.summary.scopeIssues })}`);
  console.log(`- ${t("check.validationIssues", { value: review.summary.validationIssues })}`);
  console.log(`- ${t("check.consistencyConcerns", { value: review.summary.consistencyConcerns })}`);
  console.log(`- ${t("check.riskConcerns", { value: review.summary.riskConcerns })}`);
}

function printTextResult(result, t, { reviewMode = false } = {}) {
  console.log(t("check.title"));
  console.log(`- ${t("check.preset", { value: result.preset })}`);
  console.log(`- ${t("check.diffSource", { value: result.diffSource })}`);
  console.log(`- ${t("check.changedFiles", { value: result.counts.changedFiles })}`);
  console.log(`- ${t("check.sourceFiles", { value: result.counts.sourceFiles })}`);
  console.log(`- ${t("check.testFiles", { value: result.counts.testFiles })}`);
  console.log(`- ${t("check.topLevelEntries", { value: result.topLevelEntries.join(", ") || "none" })}`);
  console.log(`- ${t("check.changeTypes", { value: result.changedFileTypes.join(", ") || "none" })}`);
  if (result.allowedPaths.length > 0) {
    console.log(`- ${t("check.allowedPaths", { value: result.counts.allowedPaths })}`);
    console.log(`- ${t("check.outOfScopeFiles", { value: result.counts.outOfScopeFiles })}`);
  }
  if (result.taskContract) {
    console.log(`- ${t("check.taskContract", { value: path.normalize(result.contractPath) })}`);
    console.log(`- ${t("check.taskAllowedPaths", { value: result.counts.taskAllowedPaths })}`);
    console.log(`- ${t("check.taskOutOfScopeFiles", { value: result.counts.outOfTaskScopeFiles })}`);
    console.log(`- ${t("check.intendedFiles", { value: result.counts.intendedFiles })}`);
    console.log(`- ${t("check.outOfIntendedFiles", { value: result.counts.outOfIntendedFiles })}`);
    console.log(`- ${t("check.taskRequiredCommands", { value: result.counts.requiredCommands })}`);
    console.log(`- ${t("check.commandsReported", { value: result.counts.commandsRun })}`);
    console.log(`- ${t("check.missingRequiredCommands", { value: result.counts.missingRequiredCommands })}`);
    console.log(`- ${t("check.taskEvidencePaths", { value: result.counts.evidencePaths })}`);
    console.log(`- ${t("check.missingEvidenceFiles", { value: result.counts.missingEvidencePaths })}`);
    if (result.taskContract.productionProfile) {
      console.log(`- ${t("check.productionProfile", { value: result.taskContract.productionProfile })}`);
    }
    if ((result.taskContract.nfrRequirements ?? []).length > 0) {
      console.log(`- ${t("check.nfrRequirements", { value: result.taskContract.nfrRequirements.join(", ") })}`);
    }
  }

  if (result.warnings.length > 0 && !reviewMode) {
    console.log(`\n${t("check.warnings")}`);
    console.log(result.warnings.map((item) => `- ${item}`).join("\n"));
  }

  if (result.failures.length > 0 && !reviewMode) {
    console.log(`\n${t("check.failures")}`);
    console.log(result.failures.map((item) => `- ${item}`).join("\n"));
  }

  printReviewSummary(result.review, t);

  if (reviewMode || result.findings.length > 0) {
    printFindingGroup(t("check.scopeGroup"), result.review.scopeIssues, t);
    printFindingGroup(t("check.validationGroup"), result.review.validationIssues, t);
    printFindingGroup(t("check.consistencyGroup"), result.review.consistencyConcerns, t);
    printFindingGroup(t("check.riskGroup"), result.review.riskConcerns, t);
  }

  if (result.runtime?.nextActions?.length > 0) {
    console.log(`\n${t("check.nextActions")}`);
    console.log(result.runtime.nextActions.map((item) => `- ${item}`).join("\n"));
  }

  if (result.finishCheck?.recommendedCommand) {
    console.log(`- ${t("check.finishCommand", { value: result.finishCheck.recommendedCommand })}`);
  }

  if (result.failures.length === 0) {
    console.log(`\n${t("check.allPassed")}`);
  }
}

function printJsonResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

export async function executeCheck({ repoRoot = process.cwd(), flags, locale = null, suppressExitCode = false } = { flags: {} }) {
  const config = readConfig(repoRoot);
  const contractPath = String(flags?.["contract-path"] || defaultTaskContractPath);
  const baseRef = flags?.["base-ref"] ? String(flags["base-ref"]) : null;
  const json = Boolean(flags?.json);
  const reviewMode = Boolean(flags?.review);
  const commandsRun = parseStringList(flags?.["commands-run"] || process.env.AGENT_GUARDRAILS_COMMANDS_RUN);
  const { t } = createTranslator(flags?.lang || locale);

  if (!config) {
    throw new Error(t("errors.missingCheckConfig"));
  }

  const policy = buildPolicy(config);
  const store = createFindingStore();
  const requiredPathList = requiredPaths(config);
  const requiredPathStatus = Object.fromEntries(
    requiredPathList.map((relativePath) => [relativePath, fs.existsSync(path.join(repoRoot, relativePath))])
  );

  const ignoredFiles = new Set([normalizeRepoPath(contractPath)]);
  const diffResult = baseRef
    ? listChangedFilesFromBaseRef(repoRoot, baseRef)
    : listChangedFiles(repoRoot);
  const changedFiles = diffResult.files
    .map((filePath) => normalizeRepoPath(filePath))
    .filter((filePath) => !ignoredFiles.has(filePath));
  const sourceFiles = changedFiles.filter((filePath) => isSourceFile(filePath, config));
  const testFiles = changedFiles.filter((filePath) => isTestFile(filePath, config));
  const taskContract = readTaskContract(repoRoot, contractPath);
  const taskAllowedPaths = taskContract?.allowedPaths ?? [];
  const intendedFiles = taskContract?.intendedFiles ?? [];
  const protectedPaths = taskContract?.protectedPaths ?? [];
  const allowedChangeTypes = (taskContract?.allowedChangeTypes ?? [])
    .map((item) => normalizeChangeType(item))
    .filter(Boolean);
  const outOfTaskScopeFiles = findOutOfScopeFiles(changedFiles, taskAllowedPaths, repoRoot);
  const outOfIntendedFiles = findOutOfScopeFiles(changedFiles, intendedFiles, repoRoot);
  const requiredCommands = taskContract?.requiredCommands ?? [];
  const missingRequiredCommands = requiredCommands.filter((command) => !commandsRun.includes(command));
  const evidencePaths = taskContract?.evidencePaths ?? [];
  const missingEvidencePaths = evidencePaths.filter((evidencePath) => {
    return !fs.existsSync(path.join(repoRoot, evidencePath));
  });
  const allowedPaths = policy.allowedPaths;
  const outOfScopeFiles = findOutOfScopeFiles(changedFiles, allowedPaths, repoRoot);
  const changeTypes = Object.fromEntries(
    changedFiles.map((filePath) => [filePath, classifyChangeType(filePath, config)])
  );
  const topLevelEntries = unique(changedFiles.map((filePath) => getTopLevelEntry(filePath)));
  const evidenceSummary = summarizeEvidence(repoRoot, evidencePaths);
  const protectedPathMatches = protectedPaths.length > 0
    ? protectedPaths.filter((areaPath) => changedFiles.some((filePath) => isPathWithinAllowedScope(filePath, areaPath, repoRoot)))
    : [];
  const configProtectedAreaMatches = findProtectedAreaMatches(
    changedFiles,
    getProtectedAreas(config),
    repoRoot
  );
  const interfaceLikeFiles = changedFiles.filter((filePath) => changeTypes[filePath] === "interface");
  const configOrMigrationFiles = changedFiles.filter((filePath) => ["config", "migration"].includes(changeTypes[filePath]));
  const performanceSensitiveAreas = config.performanceSensitiveAreas ?? [];
  const criticalPaths = config.criticalPaths ?? [];
  const taskNfrRequirements = taskContract?.nfrRequirements ?? [];
  const evidenceText = evidenceSummary.fullText.toLowerCase();
  const performanceSensitiveFiles = changedFiles.filter((filePath) => {
    return performanceSensitiveAreas.some((scope) => isPathWithinAllowedScope(filePath, scope, repoRoot));
  });
  const criticalPathFiles = changedFiles.filter((filePath) => {
    return criticalPaths.some((scope) => isPathWithinAllowedScope(filePath, scope, repoRoot));
  });
  const pluginLoad = await loadSemanticPlugins({ config, repoRoot });

  const context = {
    repoRoot,
    config,
    policy,
    baseRef,
    diffResult,
    requiredPaths: requiredPathList,
    requiredPathStatus,
    changedFiles,
    sourceFiles,
    testFiles,
    topLevelEntries,
    taskContract,
    taskAllowedPaths,
    intendedFiles,
    protectedPaths,
    allowedChangeTypes,
    requiredCommands,
    missingRequiredCommands,
    evidencePaths,
    missingEvidencePaths,
    commandsRun,
    allowedPaths,
    outOfScopeFiles,
    outOfTaskScopeFiles,
    outOfIntendedFiles,
    changeTypes,
    evidenceSummary,
    evidenceText,
    protectedPathMatches,
    configProtectedAreaMatches,
    interfaceLikeFiles,
    configOrMigrationFiles,
    performanceSensitiveFiles,
    criticalPathFiles,
    taskNfrRequirements,
    hasSkipAcknowledgement: (key) => hasSkipAcknowledgement(taskContract, key),
    isPathWithinAllowedScope: (filePath, scope) => isPathWithinAllowedScope(filePath, scope, repoRoot)
  };

  await runDetectorPipeline({
    detectors: [...ossDetectors, ...pluginLoad.detectors],
    context,
    store,
    t
  });

  const result = buildCheckResult({
    config: { ...config, repoRoot },
    policy,
    baseRef,
    plugins: pluginLoad.plugins,
    contractPath,
    changedFiles,
    sourceFiles,
    testFiles,
    allowedPaths,
    outOfScopeFiles,
    taskContract,
    taskAllowedPaths,
    outOfTaskScopeFiles,
    intendedFiles,
    outOfIntendedFiles,
    protectedPathMatches,
    configProtectedAreaMatches,
    commandsRun,
    requiredCommands,
    missingRequiredCommands,
    evidencePaths,
    missingEvidencePaths,
    changeTypes,
    review: buildReview(store.findings),
    evidenceSummary,
    warnings: store.warnings,
    failures: store.failures,
    findings: store.findings
  });

  if (!suppressExitCode && result.failures.length > 0) {
    process.exitCode = 1;
  }

  return result;
}

export async function runCheck({ flags, locale = null } = { flags: {} }) {
  const result = await executeCheck({ repoRoot: process.cwd(), flags, locale });
  const json = Boolean(flags?.json);
  const reviewMode = Boolean(flags?.review);
  const { t } = createTranslator(flags?.lang || locale);

  if (json) {
    printJsonResult(result);
    return result;
  }

  printTextResult(result, t, { reviewMode });
  return result;
}
