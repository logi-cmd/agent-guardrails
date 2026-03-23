import path from "node:path";
import { createTranslator } from "../i18n.js";
import { bootstrapTaskSession } from "../runtime/service.js";
import {
  defaultTaskContractPath,
  formatList,
  parseCommaSeparatedList,
  parseStringList,
  readConfig,
  normalizeChangeType,
  writeTaskContract
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

function renderOrFallback(items, renderer, fallback) {
  return items.length > 0 ? formatList(items.map(renderer)) : fallback;
}

function labelFromTemplate(t, key) {
  return t(key, { value: "{value}" }).replace(/\s*[:：]\s*\{value\}\s*$/, "").trim();
}

export async function runPlan({ positional, flags, locale = null }) {
  const repoRoot = process.cwd();
  const config = readConfig(repoRoot);
  const task = flags.task || positional.join(" ");
  const { t } = createTranslator(flags.lang || locale);

  if (!task) {
    throw new Error(t("errors.missingTask"));
  }

  if (!config) {
    throw new Error(t("errors.missingInitConfig"));
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
