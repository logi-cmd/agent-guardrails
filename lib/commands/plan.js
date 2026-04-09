import path from "node:path";
import fs from "node:fs";
import { createTranslator } from "../i18n.js";
import { bootstrapTaskSession } from "../runtime/service.js";
import {
  defaultTaskContractPath,
  formatList,
  parseCommaSeparatedList,
  parseStringList,
  readConfig,
  normalizeChangeType,
  resolveRepoRoot,
  writeTaskContract
} from "../utils.js";
import {
  parseRoughIntent,
  isRoughIntent,
  generateSuggestionText
} from "../rough-intent/index.js";
import { tryPlanTaskShapes } from "../plan/pro/index.js";

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

function renderOrFallback(items, renderer, fallback) {
  return items.length > 0 ? formatList(items.map(renderer)) : fallback;
}

function labelFromTemplate(t, key) {
  return t(key, { value: "{value}" }).replace(/\s*[:：]\s*\{value\}\s*$/, "").trim();
}

export async function runPlan({ positional, flags, locale = null }) {
  const repoRoot = resolveRepoRoot(process.cwd());
  const config = readConfig(repoRoot);
  const task = flags.task || positional.join(" ");
  const { t } = createTranslator(flags.lang || locale);

  if (!task) {
    throw new Error(t("errors.missingTask"));
  }

  if (!config) {
    throw new Error(t("errors.missingInitConfig"));
  }

  // === Rough-Intent 模式检测 ===
  const hasDetailedFlags = Boolean(
    flags["allow-paths"] ||
    flags["required-commands"] ||
    flags["intended-files"] ||
    flags["risk-level"] ||
    flags["evidence-paths"]
  );

  if (isRoughIntent(task, flags) || !hasDetailedFlags) {
    return await runRoughIntentPlan({ task, flags, locale: flags.lang || locale, repoRoot, config, t });
  }

  const preset = config.preset;
  const runtimeSuggestion = bootstrapTaskSession({ repoRoot, flags, positional, locale: flags.lang || locale });
  const suggestedDefaults = runtimeSuggestion?.suggestions ?? {
    allowedPaths: [],
    intendedFiles: [],
    requiredCommands: [],
    evidencePaths: [],
    riskLevel: "standard",
    requiresReviewNotes: false,
    validationProfile: "standard",
    riskDimensions: {
      securityRequirements: [],
      dependencyRequirements: [],
      performanceRequirements: [],
      understandingRequirements: [],
      continuityRequirements: []
    }
  };
  const readBeforeWrite = config.workflow?.readBeforeWrite ?? [
    "AGENTS.md",
    "docs/PROJECT_STATE.md",
    "README.md"
  ];
  const constraints = config.workflow?.constraints ?? [
    "Prefer the existing architecture and file patterns.",
    "Keep the change small and bounded.",
    "Add tests for behavioral changes."
  ];
  const doneWhen = config.workflow?.definitionOfDone ?? [
    "Code matches existing project conventions.",
    "Tests and checks pass.",
    "Risks and assumptions are documented."
  ];
  const explicitAllowedPaths = parseCommaSeparatedList(flags["allow-paths"] || flags.allow);
  const explicitRequiredCommands = parseStringList(flags["required-commands"] || flags.commands);
  const explicitEvidencePaths = parseCommaSeparatedList(flags["evidence-paths"] || flags.evidence);
  const explicitSecurityRequirements = parseStringList(flags["security-requirements"]);
  const explicitDependencyRequirements = parseStringList(flags["dependency-requirements"]);
  const explicitPerformanceRequirements = parseStringList(flags["performance-requirements"]);
  const explicitUnderstandingRequirements = parseStringList(flags["understanding-requirements"]);
  const explicitContinuityRequirements = parseStringList(flags["continuity-requirements"]);
  const allowedPaths = explicitAllowedPaths.length > 0 ? explicitAllowedPaths : suggestedDefaults.allowedPaths;
  const requiredCommands = explicitRequiredCommands.length > 0 ? explicitRequiredCommands : suggestedDefaults.requiredCommands;
  const evidencePaths = explicitEvidencePaths.length > 0 ? explicitEvidencePaths : suggestedDefaults.evidencePaths;
  const explicitIntendedFiles = parseCommaSeparatedList(flags["intended-files"]);
  const intendedFiles = explicitIntendedFiles.length > 0
    ? explicitIntendedFiles
    : (suggestedDefaults.intendedFiles ?? []);
  const protectedPaths = parseCommaSeparatedList(flags["protected-paths"]);
  const allowedChangeTypes = parseStringList(flags["allowed-change-types"])
    .map((item) => normalizeChangeType(item))
    .filter(Boolean);
  const riskLevel = flags["risk-level"]
    ? String(flags["risk-level"]).trim().toLowerCase()
    : (suggestedDefaults.riskLevel ?? "");
  const requiresReviewNotes = flags["requires-review-notes"] != null
    ? parseBooleanFlag(flags["requires-review-notes"])
    : Boolean(suggestedDefaults.requiresReviewNotes);
  const validationProfile = flags["validation-profile"]
    ? String(flags["validation-profile"]).trim().toLowerCase()
    : (suggestedDefaults.validationProfile ?? "standard");
  const acknowledgedSkips = parseStringList(flags["acknowledged-skips"]);
  const patternSummary = flags["pattern-summary"] ? String(flags["pattern-summary"]).trim() : "";
  const smallestViableChange = flags["smallest-change"] || flags["smallest-viable-change"]
    ? String(flags["smallest-change"] || flags["smallest-viable-change"]).trim()
    : "";
  const assumptions = parseStringList(flags.assumptions);
  const acceptanceCriteria = parseStringList(flags["acceptance-criteria"]);
  const nonGoals = parseStringList(flags["non-goals"]);
  const expectedBehaviorChanges = parseStringList(flags["expected-behavior-changes"]);
  const userVisibleEffects = parseStringList(flags["user-visible-effects"]);
  const intendedSymbols = parseStringList(flags["intended-symbols"]);
  const expectedPublicSurfaceChanges = parseStringList(flags["expected-public-surface-changes"]);
  const expectedBoundaryExceptions = parseStringList(flags["expected-boundary-exceptions"]);
  const expectedTestTargets = parseStringList(flags["expected-test-targets"]);
  const productionProfile = flags["production-profile"] ? String(flags["production-profile"]).trim().toLowerCase() : "";
  const nfrRequirements = parseStringList(flags["nfr-requirements"]);
  const expectedLoadSensitivePaths = parseCommaSeparatedList(flags["expected-load-sensitive-paths"]);
  const expectedConcurrencyImpact = flags["expected-concurrency-impact"]
    ? String(flags["expected-concurrency-impact"]).trim()
    : "";
  const observabilityRequirements = parseStringList(flags["observability-requirements"]);
  const rollbackNotes = flags["rollback-notes"] ? String(flags["rollback-notes"]).trim() : "";
  const riskJustification = flags["risk-justification"] ? String(flags["risk-justification"]).trim() : "";
  const securityRequirements = explicitSecurityRequirements.length > 0
    ? explicitSecurityRequirements
    : (suggestedDefaults.riskDimensions?.securityRequirements ?? []);
  const dependencyRequirements = explicitDependencyRequirements.length > 0
    ? explicitDependencyRequirements
    : (suggestedDefaults.riskDimensions?.dependencyRequirements ?? []);
  const performanceRequirements = explicitPerformanceRequirements.length > 0
    ? explicitPerformanceRequirements
    : (suggestedDefaults.riskDimensions?.performanceRequirements ?? []);
  const understandingRequirements = explicitUnderstandingRequirements.length > 0
    ? explicitUnderstandingRequirements
    : (suggestedDefaults.riskDimensions?.understandingRequirements ?? []);
  const continuityRequirements = explicitContinuityRequirements.length > 0
    ? explicitContinuityRequirements
    : (suggestedDefaults.riskDimensions?.continuityRequirements ?? []);
  const contractPath = String(flags["contract-path"] || defaultTaskContractPath);
  const printOnly = Boolean(flags["print-only"]);
  let writtenContractPath = null;

  const contract = {
    schemaVersion: 3,
    task,
    preset,
    createdAt: new Date().toISOString(),
    allowedPaths,
    requiredCommands,
    evidencePaths,
    intendedFiles,
    protectedPaths,
    allowedChangeTypes,
    riskLevel,
    requiresReviewNotes,
    validationProfile,
    securityRequirements,
    dependencyRequirements,
    performanceRequirements,
    understandingRequirements,
    continuityRequirements,
    acknowledgedSkips,
    patternSummary,
    smallestViableChange,
    assumptions,
    acceptanceCriteria,
    nonGoals,
    expectedBehaviorChanges,
    userVisibleEffects,
    intendedSymbols,
    expectedPublicSurfaceChanges,
    expectedBoundaryExceptions,
    expectedTestTargets,
    productionProfile,
    nfrRequirements,
    expectedLoadSensitivePaths,
    expectedConcurrencyImpact,
    observabilityRequirements,
    rollbackNotes,
    riskJustification,
    autoFilledFields: [],
    session: runtimeSuggestion?.session ?? null
  };

  const autoFilledFields = [];
  if (explicitAllowedPaths.length === 0 && allowedPaths.length > 0) {
    autoFilledFields.push(t("plan.autoFilledAllowedPaths"));
  }
  if (explicitRequiredCommands.length === 0 && requiredCommands.length > 0) {
    autoFilledFields.push(t("plan.autoFilledRequiredCommands"));
  }
  if (explicitEvidencePaths.length === 0 && evidencePaths.length > 0) {
    autoFilledFields.push(t("plan.autoFilledEvidencePaths"));
  }
  if (explicitSecurityRequirements.length === 0 && securityRequirements.length > 0) {
    autoFilledFields.push(t("plan.autoFilledSecurityRequirements"));
  }
  if (explicitDependencyRequirements.length === 0 && dependencyRequirements.length > 0) {
    autoFilledFields.push(t("plan.autoFilledDependencyRequirements"));
  }
  if (explicitPerformanceRequirements.length === 0 && performanceRequirements.length > 0) {
    autoFilledFields.push(t("plan.autoFilledPerformanceRequirements"));
  }
  if (explicitUnderstandingRequirements.length === 0 && understandingRequirements.length > 0) {
    autoFilledFields.push(t("plan.autoFilledUnderstandingRequirements"));
  }
  if (explicitContinuityRequirements.length === 0 && continuityRequirements.length > 0) {
    autoFilledFields.push(t("plan.autoFilledContinuityRequirements"));
  }
  contract.autoFilledFields = autoFilledFields;
  if (contract.session) {
    contract.session.autoFilledFields = autoFilledFields;
  }

  if (!printOnly) {
    writtenContractPath = writeTaskContract(repoRoot, contract, contractPath);
  }

  console.log(`# ${t("plan.title")}

${t("plan.task")}:
${task}

${t("plan.preset")}:
${preset}

${t("plan.readBeforeWriting")}:
${formatList(readBeforeWrite.map((item) => path.normalize(item)))}

${t("plan.constraints")}:
${formatList(constraints)}

${t("plan.definitionOfDone")}:
${formatList(doneWhen)}

${t("plan.taskContract")}:
- ${printOnly ? t("plan.printOnly") : t("plan.writtenTo", { contractPath: path.normalize(contractPath) })}
${autoFilledFields.length > 0 ? `- ${t("plan.autoFilled", { value: autoFilledFields.join(", ") })}` : ""}
${contract.session?.contractSource ? `- ${t("plan.contractSource", { value: contract.session.contractSource })}` : ""}
${contract.session?.sessionId ? `- ${t("plan.sessionId", { value: contract.session.sessionId })}` : ""}
${renderOrFallback(allowedPaths, (item) => t("plan.allowedPath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.allowedPath") })}`)}
${renderOrFallback(intendedFiles, (item) => t("plan.intendedFile", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.intendedFile") })}`)}
${renderOrFallback(protectedPaths, (item) => t("plan.protectedPath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.protectedPath") })}`)}
${renderOrFallback(allowedChangeTypes, (item) => t("plan.allowedChangeType", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.allowedChangeType") })}`)}
- ${t("plan.riskLevel", { value: riskLevel || "standard" })}
- ${requiresReviewNotes ? t("plan.reviewNotesRequiredYes") : t("plan.reviewNotesRequiredNo")}
- ${t("plan.validationProfile", { value: validationProfile || "standard" })}
${renderOrFallback(requiredCommands, (item) => t("plan.requiredCommand", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.requiredCommand") })}`)}
${renderOrFallback(evidencePaths, (item) => t("plan.evidencePath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.evidencePath") })}`)}
${t("plan.riskDimensions")}:
${renderOrFallback(securityRequirements, (item) => t("plan.securityRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.securityRequirement") })}`)}
${renderOrFallback(dependencyRequirements, (item) => t("plan.dependencyRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.dependencyRequirement") })}`)}
${renderOrFallback(performanceRequirements, (item) => t("plan.performanceRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.performanceRequirement") })}`)}
${renderOrFallback(understandingRequirements, (item) => t("plan.understandingRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.understandingRequirement") })}`)}
${renderOrFallback(continuityRequirements, (item) => t("plan.continuityRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.continuityRequirement") })}`)}
${renderOrFallback(acknowledgedSkips, (item) => t("plan.acknowledgedSkip", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.acknowledgedSkip") })}`)}

${t("plan.acceptanceAlignment")}:
${renderOrFallback(acceptanceCriteria, (item) => t("plan.acceptanceCriteria", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.acceptanceCriteria") })}`)}
${renderOrFallback(nonGoals, (item) => t("plan.nonGoal", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.nonGoal") })}`)}
${renderOrFallback(expectedBehaviorChanges, (item) => t("plan.behaviorChange", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.behaviorChange") })}`)}
${renderOrFallback(userVisibleEffects, (item) => t("plan.userVisibleEffect", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.userVisibleEffect") })}`)}

${t("plan.implementationShape")}:
${patternSummary ? `- ${t("plan.existingPatternSummary", { value: patternSummary })}` : `- ${t("plan.existingPatternSummaryDefault")}`}
${smallestViableChange ? `- ${t("plan.smallestViableChange", { value: smallestViableChange })}` : `- ${t("plan.smallestViableChangeDefault")}`}
${renderOrFallback(assumptions, (item) => t("plan.assumption", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.assumption") })}`)}

${t("plan.productionProfile", { value: productionProfile || t("plan.noneDeclaredValue") })}
${renderOrFallback(nfrRequirements, (item) => t("plan.nfrRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.nfrRequirement") })}`)}
${renderOrFallback(intendedSymbols, (item) => t("plan.intendedSymbol", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.intendedSymbol") })}`)}
${renderOrFallback(expectedPublicSurfaceChanges, (item) => t("plan.expectedPublicSurfaceChange", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.expectedPublicSurfaceChange") })}`)}
${renderOrFallback(expectedBoundaryExceptions, (item) => t("plan.expectedBoundaryException", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.expectedBoundaryException") })}`)}
${renderOrFallback(expectedTestTargets, (item) => t("plan.expectedTestTarget", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.expectedTestTarget") })}`)}
${renderOrFallback(expectedLoadSensitivePaths, (item) => t("plan.loadSensitivePath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.loadSensitivePath") })}`)}
${expectedConcurrencyImpact ? `- ${t("plan.expectedConcurrencyImpact", { value: expectedConcurrencyImpact })}` : `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.expectedConcurrencyImpact") })}`}
${renderOrFallback(observabilityRequirements, (item) => t("plan.observabilityRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.observabilityRequirement") })}`)}
${rollbackNotes ? `- ${t("plan.rollbackNotes", { value: rollbackNotes })}` : `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.rollbackNotes") })}`}
${riskJustification ? `- ${t("plan.riskJustification", { value: riskJustification })}` : `- ${t("plan.noneDeclared", { label: labelFromTemplate(t, "plan.riskJustification") })}`}

${t("plan.implementationNote")}:
- ${t("plan.implementationNote1")}
- ${t("plan.implementationNote2")}
- ${t("plan.implementationNote3")}
- ${t("plan.implementationNote4")}
${contract.session?.nextActions?.length > 0 ? `\n${t("plan.nextActions")}:\n${formatList(contract.session.nextActions)}` : ""}
`);

  return {
    task,
    preset,
    allowedPaths,
    intendedFiles,
    protectedPaths,
    allowedChangeTypes,
    riskLevel,
    requiresReviewNotes,
    validationProfile,
    securityRequirements,
    dependencyRequirements,
    performanceRequirements,
    understandingRequirements,
    continuityRequirements,
    riskDimensions: {
      securityRequirements,
      dependencyRequirements,
      performanceRequirements,
      understandingRequirements,
      continuityRequirements
    },
    requiredCommands,
    evidencePaths,
    acknowledgedSkips,
    patternSummary,
    smallestViableChange,
    assumptions,
    acceptanceCriteria,
    nonGoals,
    expectedBehaviorChanges,
    userVisibleEffects,
    intendedSymbols,
    expectedPublicSurfaceChanges,
    expectedBoundaryExceptions,
    expectedTestTargets,
    productionProfile,
    nfrRequirements,
    expectedLoadSensitivePaths,
    expectedConcurrencyImpact,
    observabilityRequirements,
    rollbackNotes,
    riskJustification,
    contractPath: writtenContractPath,
    autoFilledFields,
    session: contract.session
  };
}

/**
 * Rough-Intent 模式处理
 * 从模糊意图自动生成契约
 */
async function runRoughIntentPlan({ task, flags, locale, repoRoot, config, t }) {
  console.log(`\n🔍 ${t("roughIntent.analyzing") || "Analyzing your intent..."}\n`);

  const repoContext = {
    fileTree: getFileTree(repoRoot),
    packageJson: getPackageJson(repoRoot),
    topLevelEntries: getTopLevelEntries(repoRoot)
  };

  // 解析意图
  const parsed = parseRoughIntent(task, repoContext);
  const proPlan = await tryPlanTaskShapes(task, repoContext);

  // 生成建议文本
  const suggestionText = generateSuggestionText(parsed, locale);
  const proPlanText = formatProTaskShapes(proPlan);

  // 打印建议
  console.log(`╔${"═".repeat(50)}╗
║  📋 ${suggestionText.title.padEnd(44)}║
╚${"═".repeat(50)}╝

${suggestionText.taskType}
${suggestionText.confidence}

${suggestionText.paths}

${suggestionText.commands}

${suggestionText.risk}
${suggestionText.rules ? "\n" + suggestionText.rules : ""}
${proPlanText ? "\n" + proPlanText : ""}

${"─".repeat(50)}
${suggestionText.confirm}
${"─".repeat(50)}
`);

  // 检查是否自动确认
  const autoConfirm = flags.yes || flags.y || flags["auto-confirm"];

  if (autoConfirm) {
    return saveRoughIntentContract({ task, parsed, proPlan, flags, locale, repoRoot, config, t });
  }

  // 交互式确认（简化版，实际可用 inquirer）
  console.log(`${t("roughIntent.actions") || "Actions"}:`);
  console.log(`  ✅ ${suggestionText.actions.confirm}  (--yes)`);
  console.log(`  ✏️  ${suggestionText.actions.modify}  (--modify)`);
  console.log(`  ❌ ${suggestionText.actions.cancel}\n`);

  // 如果是 MCP 模式，返回 JSON
  if (flags.mode === 'mcp' || flags.json) {
    return {
      status: 'suggestion',
      suggestion: {
        task: parsed.task,
        taskType: parsed.taskType,
        confidence: parsed.confidence,
        inferred: parsed.inferred,
        sources: parsed.sources,
        proPlan
      },
      display: suggestionText,
      actions: [
        { type: 'accept', label: suggestionText.actions.confirm },
        { type: 'modify', label: suggestionText.actions.modify },
        { type: 'cancel', label: suggestionText.actions.cancel }
      ]
    };
  }

  // 默认返回建议，等待用户确认
  return {
    status: 'pending_confirmation',
    parsed,
    proPlan,
    suggestionText,
    nextStep: `Run with --yes to confirm, or --modify to adjust scope`
  };
}

/**
 * 保存 Rough-Intent 契约
 */
function saveRoughIntentContract({ task, parsed, proPlan, flags, locale, repoRoot, config, t }) {
  const contractPath = String(flags["contract-path"] || defaultTaskContractPath);
  const printOnly = Boolean(flags["print-only"]);
  const selectedProOption = selectProTaskOption(proPlan, flags["option-id"]);
  const proContractDraft = selectedProOption?.contractDraft || null;
  const contractRiskLevel = proContractDraft?.riskLevel || parsed.inferred.riskLevel;

  const contract = {
    schemaVersion: 3,
    task,
    preset: config.preset,
    createdAt: new Date().toISOString(),
    allowedPaths: proContractDraft?.allowedPaths || parsed.inferred.allowedPaths,
    requiredCommands: proContractDraft?.requiredCommands || parsed.inferred.requiredCommands,
    evidencePaths: proContractDraft?.evidencePaths || [parsed.inferred.evidencePath],
    intendedFiles: [],
    protectedPaths: [],
    allowedChangeTypes: [],
    riskLevel: contractRiskLevel,
    requiresReviewNotes: contractRiskLevel === 'high' || contractRiskLevel === 'critical',
    validationProfile: 'standard',
    securityRequirements: [],
    dependencyRequirements: [],
    performanceRequirements: [],
    understandingRequirements: [],
    continuityRequirements: [],
    acknowledgedSkips: [],
    patternSummary: '',
    smallestViableChange: '',
    assumptions: [],
    acceptanceCriteria: [],
    nonGoals: [],
    expectedBehaviorChanges: [],
    userVisibleEffects: [],
    intendedSymbols: [],
    expectedPublicSurfaceChanges: [],
    expectedBoundaryExceptions: [],
    expectedTestTargets: [],
    productionProfile: '',
    nfrRequirements: [],
    expectedLoadSensitivePaths: [],
    expectedConcurrencyImpact: '',
    observabilityRequirements: [],
    rollbackNotes: '',
    riskJustification: '',
    guardRules: parsed.inferred.guardRules,
    roughIntent: {
      detected: true,
      taskType: parsed.taskType,
      confidence: parsed.confidence,
      sources: parsed.sources
    },
    proPlan: selectedProOption ? {
      selectedOptionId: selectedProOption.id,
      recommendedOptionId: proPlan?.recommendedOptionId || null,
      options: proPlan?.options?.map((option) => ({
        id: option.id,
        title: option.title,
        summary: option.summary,
        changeType: option.changeType,
        likelyFiles: option.likelyFiles,
        validations: option.validations,
        riskLevel: option.riskLevel,
        safeBecause: option.safeBecause
      })) || []
    } : undefined,
    autoFilledFields: ['allowedPaths', 'requiredCommands', 'riskLevel', 'guardRules']
  };

  let writtenContractPath = null;
  if (!printOnly) {
    writtenContractPath = writeTaskContract(repoRoot, contract, contractPath);
  }

  console.log(`\n✅ ${t("roughIntent.contractCreated") || "Contract created!"}\n`);
  console.log(`${t("roughIntent.taskType") || "Task type"}: ${parsed.taskType}`);
  console.log(`${t("roughIntent.confidence") || "Confidence"}: ${(parsed.confidence * 100).toFixed(0)}%`);
  if (selectedProOption) {
    console.log(`${t("roughIntent.selectedTaskShape") || "Selected task shape"}: ${selectedProOption.title}`);
  }
  console.log(`${t("roughIntent.contractPath") || "Contract path"}: ${path.normalize(contractPath)}\n`);

  console.log(`${t("roughIntent.nextSteps") || "Next steps"}:`);
  console.log(`  1. ${t("roughIntent.nextStep1") || "Let your AI agent implement this task"}`);
  console.log(`  2. ${t("roughIntent.nextStep2") || "Run: agent-guardrails check"}\n`);

  return {
    status: 'created',
    task,
    preset: config.preset,
    taskType: parsed.taskType,
    confidence: parsed.confidence,
    allowedPaths: contract.allowedPaths,
    requiredCommands: contract.requiredCommands,
    riskLevel: contract.riskLevel,
    contractPath: writtenContractPath,
    roughIntent: contract.roughIntent,
    proPlan: contract.proPlan
  };
}

/**
 * 辅助函数：获取文件树
 */
function getFileTree(repoRoot) {
  const files = [];
  function walk(dir, base = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        const relativePath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(fullPath, relativePath);
        } else {
          files.push(relativePath);
        }
      }
    } catch {
      // ignore
    }
  }
  walk(repoRoot);
  return files;
}

/**
 * 辅助函数：获取 package.json
 */
function getPackageJson(repoRoot) {
  try {
    const pkgPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    }
  } catch {
    // ignore
  }
  return null;
}

function getTopLevelEntries(repoRoot) {
  try {
    return fs.readdirSync(repoRoot)
      .filter((entry) => !entry.startsWith(".") && entry !== "node_modules");
  } catch {
    return [];
  }
}

function formatProTaskShapes(proPlan) {
  if (!proPlan?.options?.length) return "";

  const lines = ["Pro task shapes:"];
  for (const option of proPlan.options) {
    const recommended = option.id === proPlan.recommendedOptionId ? " [recommended]" : "";
    lines.push(`- ${option.title}${recommended}`);
    lines.push(`  Scope: ${option.likelyFiles.join(", ") || "n/a"}`);
    lines.push(`  Validations: ${option.validations.join(", ") || "n/a"}`);
    lines.push(`  Safe because: ${option.safeBecause}`);
  }
  if (proPlan.shouldSplitImmediately) {
    lines.push("- Split now: at least one option is high-risk and should stay isolated.");
  }
  return lines.join("\n");
}

function selectProTaskOption(proPlan, optionId) {
  if (!proPlan?.options?.length) return null;
  if (optionId) {
    return proPlan.options.find((option) => option.id === optionId) || null;
  }
  return proPlan.options.find((option) => option.id === proPlan.recommendedOptionId) || proPlan.options[0] || null;
}
