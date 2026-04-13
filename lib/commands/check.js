import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "../i18n.js";
import { buildContinuitySummary, prepareFinishCheck, summarizeReviewRisks } from "../runtime/service.js";
import { ossDetectors } from "../check/detectors/oss.js";
import { createFindingStore, addFinding, createFinding } from "../check/finding.js";
import { runDetectorPipeline } from "../check/pipeline.js";
import { buildPolicy, requiredPaths } from "../check/policy.js";
import { loadSemanticPlugins } from "../check/plugins.js";
import { buildReview } from "../check/review.js";
import { formatScoreBar, getScoreVerdict } from "../check/scoring.js";
import { tryEnrichReview, getProNextActions, formatProCategoryBreakdown } from "../check/pro/index.js";
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
  resolveRepoRoot,
  readTextIfExists,
  toBoolean,
  unique
} from "../utils.js";

function classifyChangeType(filePath, config) {
  const normalized = normalizeRepoPath(filePath);
  const lower = normalized.toLowerCase();
  const extension = path.posix.extname(lower);
  const baseName = path.posix.basename(lower);

  if (lower.startsWith(".agent-guardrails/")) {
    return "guardrails-internal";
  }

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
    lower.startsWith(".github/")
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

function findProtectedAreaMatches(changedFiles, areas, repoRoot, t) {
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
      action: normalizedArea.action ?? t("findings.protectedAreaDefaultAction", { path: areaPath }),
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
    const normalizedContent = content
      ? content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n")
      : "";
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
      ,
      fullText: normalizedContent
    };
  });

  return {
    entries: summaries,
    hasReviewNotes: summaries.some((item) => item.hasReviewNotes),
    fullText: summaries
      .map((item) => item.fullText)
      .filter(Boolean)
      .join("\n")
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
  criticalPathFiles,
  changeTypes,
  review,
  evidenceSummary,
  warnings,
  failures,
  findings,
  locale
}) {
  const topLevelEntries = unique(changedFiles.map((filePath) => getTopLevelEntry(filePath)));

  const finishCheck = prepareFinishCheck({
    repoRoot: config.repoRoot ?? "",
    session: taskContract?.session ?? null,
    commandsRun,
    baseRef: baseRef ?? "",
    locale
  });
  const continuity = buildContinuitySummary({
    taskContract,
    changedFiles,
    findings,
    review,
    protectedAreaMatches: configProtectedAreaMatches,
    t: createTranslator(locale).t
  });
  const runtimeSummary = summarizeReviewRisks({
    ok: failures.length === 0,
    missingRequiredCommands,
    missingEvidencePaths,
    review,
    taskContract,
    findings,
    changedFiles,
    protectedAreaMatches: configProtectedAreaMatches,
    continuity,
    criticalPathFiles,
    scoreVerdict: review.scoreVerdict
  }, locale);

  let verdict = runtimeSummary.verdict;
  const scoreVerdict = runtimeSummary.scoreVerdict || review.scoreVerdict;
  const { t: vt } = createTranslator(locale);
  if (verdict === vt("runtime.verdictSafeToReview") && scoreVerdict) {
    const scoreVerdictMap = {
      "safe-to-deploy": vt("runtime.verdictSafeToDeploy"),
      "pass-with-concerns": vt("runtime.verdictPassWithConcerns"),
      "needs-attention": vt("runtime.verdictNeedsAttention"),
      "blocked": vt("runtime.verdictValidationIncomplete"),
      "high-risk": vt("runtime.verdictHighRiskChange")
    };
    const mapped = scoreVerdictMap[scoreVerdict];
    if (mapped) {
      verdict = mapped;
    }
  }

  return {
    ok: failures.length === 0,
    verdict,
    score: review.score,
    scoreVerdict: review.scoreVerdict,
    goLiveDecision: review.goLiveDecision ?? null,
    proofPlan: review.proofPlan ?? null,
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
    continuity,
    deployReadiness: runtimeSummary.deployReadiness,
    postDeployMaintenance: runtimeSummary.postDeployMaintenance,
    finishCheck,
    runtime: runtimeSummary,
    warnings,
    failures
  };
}

function printGoLiveDecision(review) {
  const decision = review?.goLiveDecision;
  if (!decision) {
    return;
  }

  const verdict = String(decision.verdict || "unknown").toUpperCase();
  console.log(`\nGo-live verdict: ${verdict} (${decision.riskTier || "unknown"})`);

  if ((decision.why ?? []).length > 0) {
    console.log(`- Why: ${decision.why.slice(0, 3).join(" | ")}`);
  }

  if ((decision.evidenceGaps ?? []).length > 0) {
    console.log(`- Evidence gaps: ${decision.evidenceGaps.slice(0, 3).join(" | ")}`);
  }

  if ((decision.nextBestActions ?? []).length > 0) {
    console.log(`- Next best actions: ${decision.nextBestActions.slice(0, 3).join(" | ")}`);
  }
}

function formatPrioritizedProofSurface(proofPlan = {}) {
  const surface = proofPlan.impactSurfaces?.[0];
  if (!surface?.title) {
    return null;
  }

  const blocking = Number(surface.blockingCount || 0);
  const steps = Number(surface.stepCount || 0);
  const pressure = Number(surface.memoryPressure || 0);
  const countText = blocking > 0
    ? `${blocking} blocking`
    : `${steps} step${steps === 1 ? "" : "s"}`;
  const pressureText = pressure > 0 ? `, memory pressure ${pressure}` : "";

  return `${surface.title} (${countText}${pressureText})`;
}

function formatLearnedProofScore(learnedEvidence = {}) {
  const effectiveScore = learnedEvidence.effectiveScore;
  if (effectiveScore == null) {
    return null;
  }

  const parts = [];
  if (learnedEvidence.applicabilityScore != null) {
    parts.push(`applicability ${learnedEvidence.applicabilityScore}`);
  }
  if (learnedEvidence.freshnessPenalty != null) {
    parts.push(`freshness penalty ${learnedEvidence.freshnessPenalty}`);
  }

  return parts.length > 0
    ? `${effectiveScore} (${parts.join(", ")})`
    : String(effectiveScore);
}

function formatProofWorkbenchScore(proofWorkbench = {}) {
  const parts = [];
  if (proofWorkbench.confidenceLevel) {
    parts.push(`${proofWorkbench.confidenceLevel} confidence`);
  }
  if (proofWorkbench.recommendationScore != null) {
    parts.push(`recommendation ${proofWorkbench.recommendationScore}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
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
    if (finding.skipKey && finding.severity === "error") {
      console.log(`  💡 ${t("check.suppressHint", { key: finding.skipKey })}`);
    }
  }
}

function printReviewSummary(review, t) {
  console.log(`\n${t("check.reviewSummary")}`);
  console.log(`- ${t("check.scopeIssues", { value: review.summary.scopeIssues })}`);
  console.log(`- ${t("check.validationIssues", { value: review.summary.validationIssues })}`);
  console.log(`- ${t("check.consistencyConcerns", { value: review.summary.consistencyConcerns })}`);
  console.log(`- ${t("check.continuityConcerns", { value: review.summary.continuityConcerns })}`);
  console.log(`- ${t("check.performanceConcerns", { value: review.summary.performanceConcerns })}`);
  console.log(`- ${t("check.riskConcerns", { value: review.summary.riskConcerns })}`);
}

function printDeploySurface(result, t) {
  if (result.deployReadiness) {
    console.log(`\n${t("check.deployReadiness")}`);
    console.log(`- ${t("check.deployReadinessStatus", { value: result.deployReadiness.summary })}`);
    for (const item of result.deployReadiness.checklist ?? []) {
      console.log(`- ${item}`);
    }
  }

  if (result.postDeployMaintenance) {
    console.log(`\n${t("check.postDeployMaintenance")}`);
    console.log(`- ${t("check.postDeploySummary", { value: result.postDeployMaintenance.summary })}`);
    console.log(`- ${t("check.rollbackPath", { value: result.postDeployMaintenance.rollbackPath })}`);
    if ((result.postDeployMaintenance.operatorNextActions ?? []).length > 0) {
      for (const item of result.postDeployMaintenance.operatorNextActions) {
        console.log(`- ${t("check.operatorNextAction", { value: item })}`);
      }
    }
  }
}

function printContinuitySummary(continuity, t) {
  console.log(`\n${t("check.continuityGuidance")}`);

  if ((continuity.reuseTargets ?? []).length > 0) {
    console.log(`- ${t("check.reuseTargets", {
      value: continuity.reuseTargets.map((target) => target.value).join(", ")
    })}`);
  }

  if ((continuity.newSurfaceFiles ?? []).length > 0) {
    console.log(`- ${t("check.newSurfaceFiles", { value: continuity.newSurfaceFiles.join(", ") })}`);
  }

  if ((continuity.continuityBreaks ?? []).length > 0) {
    for (const item of continuity.continuityBreaks) {
      console.log(`- ${t("check.continuityBreak", { value: item.message })}`);
    }
  }

  if ((continuity.futureMaintenanceRisks ?? []).length > 0) {
    for (const item of continuity.futureMaintenanceRisks) {
      console.log(`- ${t("check.futureMaintenanceRisk", { value: item })}`);
    }
  }
}

function printProDeepSignals(review) {
  const scope = review?.scopeIntelligence;
  const contextQuality = review?.contextQuality;
  const memory = review?.repoMemory;

  if (!scope && !contextQuality && !memory) {
    return;
  }

  console.log("\nPro guidance");

  if (scope?.fileBudget) {
    const status = scope.fileBudget.overBudget ? "over budget" : "within budget";
    console.log(`- Scope budget: ${scope.fileBudget.fileCount}/${scope.fileBudget.safeBudget} files (${status})`);
    console.log(`- Scope action: ${scope.recommendedAction} - ${scope.explanation}`);

    if ((scope.spillover ?? []).length > 0) {
      for (const item of scope.spillover) {
        const label = item.justified ? "justified spillover" : "unexplained spillover";
        console.log(`- ${label}: ${item.file} (${item.reason})`);
      }
    }

    if ((scope.batches ?? []).length > 0) {
      const topBatches = scope.batches.slice(0, 3)
        .map((batch) => `${batch.role}: ${batch.files.join(", ")}`);
      console.log(`- Suggested batches: ${topBatches.join(" | ")}`);
    }
  }

  if (contextQuality) {
    console.log(`- Context quality: ${contextQuality.score}/100 (${contextQuality.confidence})`);

    if ((contextQuality.missingInputs ?? []).length > 0) {
      console.log(`- Missing inputs: ${contextQuality.missingInputs.join(", ")}`);
    }

    if ((contextQuality.suggestedFiles ?? []).length > 0) {
      console.log(`- Suggested files to load: ${contextQuality.suggestedFiles.slice(0, 5).join(", ")}`);
    }

    if ((contextQuality.contractFixes ?? []).length > 0) {
      console.log(`- Contract fixes: ${contextQuality.contractFixes.join(" | ")}`);
    }
  }

  const deploy = review?.deployHandoff;
  if (deploy?.isProductionSensitive) {
    console.log(`- Deploy handoff: ${deploy.sensitivity} (${deploy.recommendation})`);

    if ((deploy.signals ?? []).length > 0) {
      console.log(`- Deploy signals: ${deploy.signals.map((signal) => signal.message).join(" | ")}`);
    }

    if ((deploy.missingProof ?? []).length > 0) {
      console.log(`- Missing deploy proof: ${deploy.missingProof.join(", ")}`);
    }

    if ((deploy.preDeployChecks ?? []).length > 0) {
      console.log(`- Pre-deploy checks: ${deploy.preDeployChecks.slice(0, 4).join(" | ")}`);
    }

    if ((deploy.postDeployVerify ?? []).length > 0) {
      console.log(`- Post-deploy verify: ${deploy.postDeployVerify.slice(0, 4).join(" | ")}`);
    }

    if (deploy.rollback) {
      console.log(`- Rollback: ${deploy.rollback}`);
    }
  }

  if (memory?.hasUsefulMemory) {
    console.log(`- Repo memory: ${memory.continuityHints.length} hints, ${memory.repeatedRisks.length} repeated risks`);
    for (const hint of (memory.continuityHints ?? []).slice(0, 3)) {
      console.log(`- Memory hint: ${hint}`);
    }
    for (const risk of (memory.repeatedRisks ?? []).slice(0, 2)) {
      console.log(`- Repeated risk: ${risk.message || risk.code}`);
    }
  }

  const proofSurfaceSummary = memory?.proofMemory?.surfaceSummary;
  if (proofSurfaceSummary?.headline) {
    console.log(`- Proof memory: ${proofSurfaceSummary.headline}`);
  }
  for (const surface of (proofSurfaceSummary?.topSurfaces ?? []).slice(0, 3)) {
    if (surface.message) {
      console.log(`- Proof surface: ${surface.message}`);
    }
  }

  const cheapestProof = review?.proofPlan?.cheapestNextProof;
  if (cheapestProof?.learnedEvidence?.summary) {
    console.log(`- Learned proof: ${cheapestProof.learnedEvidence.summary}`);
    const learnedProofScore = formatLearnedProofScore(cheapestProof.learnedEvidence);
    if (learnedProofScore) {
      console.log(`- Learned proof score: ${learnedProofScore}`);
    }
    if (cheapestProof.learnedEvidence.scoreReason) {
      console.log(`- Learned proof reason: ${cheapestProof.learnedEvidence.scoreReason}`);
    }
  }

  const proofWorkbench = review?.proofPlan?.proofWorkbench;
  if (proofWorkbench?.nextAction) {
    console.log(`- Proof workbench: ${proofWorkbench.nextAction}`);
    const proofWorkbenchScore = formatProofWorkbenchScore(proofWorkbench);
    if (proofWorkbenchScore) {
      console.log(`- Proof workbench score: ${proofWorkbenchScore}`);
    }
  }

  const prioritizedSurface = formatPrioritizedProofSurface(review?.proofPlan);
  if (prioritizedSurface) {
    console.log(`- Prioritized proof surface: ${prioritizedSurface}`);
  }
}

async function printTextResult(result, t, { reviewMode = false } = {}) {
  const resolvedLocale = t("check.title") === "Agent Guardrails 检查结果" ? "zh-CN" : "en";

  // ─── Title & Verdict ──────────────────────────────
  console.log(t("check.title"));

  printGoLiveDecision(result.review);

  if (result.score != null && typeof result.score === "number") {
    const scoreVerdict = result.scoreVerdict || getScoreVerdict(result.score, result.failures.length > 0);
    console.log(formatScoreBar(result.score, scoreVerdict, resolvedLocale));
    const proBreakdown = await formatProCategoryBreakdown(result.review, t, resolvedLocale);
    if (proBreakdown) {
      console.log(proBreakdown);
    }
  }

  if (result.failures.length > 0) {
    console.log(`❌ ${t("check.errorsToFix", { count: result.failures.length })} — ${result.failures.length === 1
      ? t("check.fixItAndReRun")
      : t("check.fixThemAndReRun")
    }`);
  } else if (result.score != null && result.score < 70) {
    console.log(`⚠️ ${t("check.scoreNeedsAttention", { score: result.score })}`);
  } else if (result.warnings.length > 0) {
    console.log(`⚡ ${t("check.warningsWithScore", { score: result.score ?? "N/A", count: result.warnings.length })}`);
  } else {
    console.log(`✅ ${t("check.readyToMerge", { score: result.score ?? "N/A" })}`);
  }

  // ─── Quick Counts ─────────────────────────────────
  const parts = [];
  if (result.counts.changedFiles > 0) parts.push(t("check.quickCountFiles", { count: result.counts.changedFiles }));
  if (result.counts.outOfScopeFiles > 0) parts.push(t("check.quickCountOutOfScope", { count: result.counts.outOfScopeFiles }));
  if (result.counts.missingRequiredCommands > 0) parts.push(t("check.quickCountMissingCommands", { count: result.counts.missingRequiredCommands }));
  if (result.counts.warnings > 0) parts.push(t("check.quickCountWarnings", { count: result.counts.warnings }));
  if (result.counts.failures > 0) parts.push(t("check.quickCountErrors", { count: result.counts.failures }));
  if (parts.length > 0) {
    console.log(`  ${parts.join(", ")}`);
  }

  // ─── Next Actions ─────────────────────────────────
  if (result.runtime?.nextActions?.length > 0) {
    console.log(`\n${t("check.nextActions")}`);
    result.runtime.nextActions.forEach((item, i) => console.log(`  ${i + 1}. ${item}`));
  }

  // ─── Details ──────────────────────────────────────
  console.log(`\n${t("check.detailsSeparator")}`);
  console.log(`- ${t("check.preset", { value: result.preset })}`);
  console.log(`- ${t("check.diffSource", { value: result.diffSource })}`);
  console.log(`- ${t("check.changedFiles", { value: result.counts.changedFiles })}  ${t("check.sourceFiles", { value: result.counts.sourceFiles })}  ${t("check.testFiles", { value: result.counts.testFiles })}`);
  console.log(`- ${t("check.topLevelEntries", { value: result.topLevelEntries.join(", ") || "none" })}`);
  if (result.changedFileTypes.length > 0) {
    console.log(`- ${t("check.changeTypes", { value: result.changedFileTypes.join(", ") })}`);
  }
  if (result.allowedPaths.length > 0) {
    console.log(`- ${t("check.allowedPaths", { value: result.counts.allowedPaths })}`);
    if (result.counts.outOfScopeFiles > 0) {
      console.log(`- ${t("check.outOfScopeFiles", { value: result.counts.outOfScopeFiles })}`);
    }
  }

  if (result.taskContract) {
    console.log(`- ${t("check.taskContract", { value: path.normalize(result.contractPath) })}`);
    const contractParts = [];
    contractParts.push(`${t("check.taskAllowedPaths", { value: result.counts.taskAllowedPaths })}`);
    contractParts.push(`${t("check.intendedFiles", { value: result.counts.intendedFiles })}`);
    contractParts.push(`${t("check.commandsReported", { value: result.counts.commandsRun })}/${t("check.taskRequiredCommands", { value: result.counts.requiredCommands })}`);
    console.log(`  ${contractParts.join("  ")}`);
    if (result.counts.outOfTaskScopeFiles > 0) {
      console.log(`  - ${t("check.taskOutOfScopeFiles", { value: result.counts.outOfTaskScopeFiles })}`);
    }
    if (result.counts.outOfIntendedFiles > 0) {
      console.log(`  - ${t("check.outOfIntendedFiles", { value: result.counts.outOfIntendedFiles })}`);
    }
    if (result.counts.missingRequiredCommands > 0) {
      console.log(`  - ${t("check.missingRequiredCommands", { value: result.counts.missingRequiredCommands })}`);
    }
    if (result.counts.evidencePaths > 0 || result.counts.missingEvidencePaths > 0) {
      console.log(`  - ${t("check.taskEvidencePaths", { value: result.counts.evidencePaths })}  ${t("check.missingEvidenceFiles", { value: result.counts.missingEvidencePaths })}`);
    }
    if (result.taskContract.productionProfile) {
      console.log(`  - ${t("check.productionProfile", { value: result.taskContract.productionProfile })}`);
    }
    if ((result.taskContract.nfrRequirements ?? []).length > 0) {
      console.log(`  - ${t("check.nfrRequirements", { value: result.taskContract.nfrRequirements.join(", ") })}`);
    }
    if (
      (result.taskContract.securityRequirements ?? []).length > 0 ||
      (result.taskContract.dependencyRequirements ?? []).length > 0 ||
      (result.taskContract.performanceRequirements ?? []).length > 0 ||
      (result.taskContract.understandingRequirements ?? []).length > 0 ||
      (result.taskContract.continuityRequirements ?? []).length > 0
    ) {
      console.log(`  - ${t("check.riskDimensions")}`);
      if ((result.taskContract.securityRequirements ?? []).length > 0) {
        console.log(`    - ${t("check.securityRequirements", { value: result.taskContract.securityRequirements.join(", ") })}`);
      }
      if ((result.taskContract.dependencyRequirements ?? []).length > 0) {
        console.log(`    - ${t("check.dependencyRequirements", { value: result.taskContract.dependencyRequirements.join(", ") })}`);
      }
      if ((result.taskContract.performanceRequirements ?? []).length > 0) {
        console.log(`    - ${t("check.performanceRequirements", { value: result.taskContract.performanceRequirements.join(", ") })}`);
      }
      if ((result.taskContract.understandingRequirements ?? []).length > 0) {
        console.log(`    - ${t("check.understandingRequirements", { value: result.taskContract.understandingRequirements.join(", ") })}`);
      }
      if ((result.taskContract.continuityRequirements ?? []).length > 0) {
        console.log(`    - ${t("check.continuityRequirements", { value: result.taskContract.continuityRequirements.join(", ") })}`);
      }
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
  printProDeepSignals(result.review);
  printDeploySurface(result, t);

  if (reviewMode || result.findings.length > 0) {
    printFindingGroup(t("check.scopeGroup"), result.review.scopeIssues, t);
    printFindingGroup(t("check.validationGroup"), result.review.validationIssues, t);
    printFindingGroup(t("check.consistencyGroup"), result.review.consistencyConcerns, t);
    printFindingGroup(t("check.continuityGroup"), result.review.continuityConcerns, t);
    printFindingGroup(t("check.performanceGroup"), result.review.performanceConcerns, t);
    printFindingGroup(t("check.riskGroup"), result.review.riskConcerns, t);
  }

  if (
    (result.continuity?.reuseTargets?.length ?? 0) > 0 ||
    (result.continuity?.newSurfaceFiles?.length ?? 0) > 0 ||
    (result.continuity?.futureMaintenanceRisks?.length ?? 0) > 0
  ) {
    printContinuitySummary(result.continuity, t);
  }

  if (result.runtime?.costHints?.entries?.length > 0) {
    console.log(`\n${t("check.costAwareness")}`);
    console.log(result.runtime.costHints.entries.map((entry) => `- ${t(entry.key, entry.vars)}`).join("\n"));
  }

  // ─── Finish ───────────────────────────────────────
  if (result.finishCheck?.recommendedCommand) {
    console.log(`\n- ${t("check.finishCommand", { value: result.finishCheck.recommendedCommand })}`);
  }

  if (result.failures.length === 0 && result.warnings.length === 0) {
    console.log(`\n✅ ${t("check.allChecksPassed")}`);
  } else if (result.failures.length === 0 && result.warnings.length > 0) {
    console.log(`\n⚡ ${t("check.warningsNotBlocking", { count: result.warnings.length })}`);
  }
}

function printJsonResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

export async function executeCheck({ repoRoot = process.cwd(), flags, locale = null, suppressExitCode = false } = { flags: {} }) {
  const { t } = createTranslator(flags?.lang || locale);
  const config = readConfig(repoRoot);
  const contractPath = String(flags?.["contract-path"] || defaultTaskContractPath);
  const baseRef = flags?.["base-ref"] ? String(flags["base-ref"]) : null;
  const json = Boolean(flags?.json);
  const reviewMode = Boolean(flags?.review);
  const commandsRun = parseStringList(flags?.["commands-run"] || process.env.AGENT_GUARDRAILS_COMMANDS_RUN);
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
  if (diffResult.fallback) {
    addFinding(store, createFinding({
      severity: "warning",
      category: "diff",
      code: "base-ref-fallback",
      message: diffResult.fallbackReason,
      action: t("check.baseRefFallbackAction")
    }));
  }
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
    repoRoot,
    t
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
    isPathWithinAllowedScope: (filePath, scope) => isPathWithinAllowedScope(filePath, scope, repoRoot),
    security: policy.security
  };

  await runDetectorPipeline({
    detectors: [...ossDetectors, ...pluginLoad.detectors],
    context,
    store,
    t
  });

  const baseReview = buildReview(store.findings, policy.scoring.weights);
  const review = await tryEnrichReview(baseReview, context);

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
    criticalPathFiles,
    changeTypes,
    review,
    evidenceSummary,
    warnings: store.warnings,
    failures: store.failures,
    findings: store.findings,
    locale: flags?.lang || locale
  });

  const proActions = await getProNextActions(result, context);
  if (proActions.length > 0 && result.runtime?.nextActions) {
    result.runtime.nextActions.push(...proActions);
  }

  if (!suppressExitCode && result.failures.length > 0) {
    process.exitCode = 1;
  }

  return result;
}

export async function runCheck({ flags, locale = null } = { flags: {} }) {
  const result = await executeCheck({ repoRoot: resolveRepoRoot(process.cwd()), flags, locale });
  const json = Boolean(flags?.json);
  const reviewMode = Boolean(flags?.review);
  const { t } = createTranslator(flags?.lang || locale);

  if (json) {
    printJsonResult(result);
    return result;
  }

  await printTextResult(result, t, { reviewMode });
  return result;
}
