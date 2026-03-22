import path from "node:path";
import { createTranslator } from "../i18n.js";
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
  const allowedPaths = parseCommaSeparatedList(flags["allow-paths"] || flags.allow);
  const requiredCommands = parseStringList(flags["required-commands"] || flags.commands);
  const evidencePaths = parseCommaSeparatedList(flags["evidence-paths"] || flags.evidence);
  const intendedFiles = parseCommaSeparatedList(flags["intended-files"]);
  const protectedPaths = parseCommaSeparatedList(flags["protected-paths"]);
  const allowedChangeTypes = parseStringList(flags["allowed-change-types"])
    .map((item) => normalizeChangeType(item))
    .filter(Boolean);
  const riskLevel = flags["risk-level"] ? String(flags["risk-level"]).trim().toLowerCase() : "";
  const requiresReviewNotes = parseBooleanFlag(flags["requires-review-notes"]);
  const validationProfile = flags["validation-profile"]
    ? String(flags["validation-profile"]).trim().toLowerCase()
    : "standard";
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
    riskJustification
  };

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
${renderOrFallback(allowedPaths, (item) => t("plan.allowedPath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: t("plan.allowedPath", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(intendedFiles, (item) => t("plan.intendedFile", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: t("plan.intendedFile", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(protectedPaths, (item) => t("plan.protectedPath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: t("plan.protectedPath", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(allowedChangeTypes, (item) => t("plan.allowedChangeType", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.allowedChangeType", { value: "" }).split(":")[0] })}`)}
- ${t("plan.riskLevel", { value: riskLevel || "standard" })}
- ${requiresReviewNotes ? t("plan.reviewNotesRequiredYes") : t("plan.reviewNotesRequiredNo")}
- ${t("plan.validationProfile", { value: validationProfile || "standard" })}
${renderOrFallback(requiredCommands, (item) => t("plan.requiredCommand", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.requiredCommand", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(evidencePaths, (item) => t("plan.evidencePath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: t("plan.evidencePath", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(acknowledgedSkips, (item) => t("plan.acknowledgedSkip", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.acknowledgedSkip", { value: "" }).split(":")[0] })}`)}

${t("plan.acceptanceAlignment")}:
${renderOrFallback(acceptanceCriteria, (item) => t("plan.acceptanceCriteria", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.acceptanceCriteria", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(nonGoals, (item) => t("plan.nonGoal", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.nonGoal", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(expectedBehaviorChanges, (item) => t("plan.behaviorChange", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.behaviorChange", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(userVisibleEffects, (item) => t("plan.userVisibleEffect", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.userVisibleEffect", { value: "" }).split(":")[0] })}`)}

${t("plan.implementationShape")}:
${patternSummary ? `- ${t("plan.existingPatternSummary", { value: patternSummary })}` : `- ${t("plan.existingPatternSummaryDefault")}`}
${smallestViableChange ? `- ${t("plan.smallestViableChange", { value: smallestViableChange })}` : `- ${t("plan.smallestViableChangeDefault")}`}
${renderOrFallback(assumptions, (item) => t("plan.assumption", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.assumption", { value: "" }).split(":")[0] })}`)}

${t("plan.productionProfile", { value: productionProfile || "none declared" })}
${renderOrFallback(nfrRequirements, (item) => t("plan.nfrRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.nfrRequirement", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(intendedSymbols, (item) => t("plan.intendedSymbol", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.intendedSymbol", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(expectedPublicSurfaceChanges, (item) => t("plan.expectedPublicSurfaceChange", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.expectedPublicSurfaceChange", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(expectedBoundaryExceptions, (item) => t("plan.expectedBoundaryException", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.expectedBoundaryException", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(expectedTestTargets, (item) => t("plan.expectedTestTarget", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.expectedTestTarget", { value: "" }).split(":")[0] })}`)}
${renderOrFallback(expectedLoadSensitivePaths, (item) => t("plan.loadSensitivePath", { value: path.normalize(item) }), `- ${t("plan.noneDeclared", { label: t("plan.loadSensitivePath", { value: "" }).split(":")[0] })}`)}
${expectedConcurrencyImpact ? `- ${t("plan.expectedConcurrencyImpact", { value: expectedConcurrencyImpact })}` : `- ${t("plan.noneDeclared", { label: t("plan.expectedConcurrencyImpact", { value: "" }).split(":")[0] })}`}
${renderOrFallback(observabilityRequirements, (item) => t("plan.observabilityRequirement", { value: item }), `- ${t("plan.noneDeclared", { label: t("plan.observabilityRequirement", { value: "" }).split(":")[0] })}`)}
${rollbackNotes ? `- ${t("plan.rollbackNotes", { value: rollbackNotes })}` : `- ${t("plan.noneDeclared", { label: t("plan.rollbackNotes", { value: "" }).split(":")[0] })}`}
${riskJustification ? `- ${t("plan.riskJustification", { value: riskJustification })}` : `- ${t("plan.noneDeclared", { label: t("plan.riskJustification", { value: "" }).split(":")[0] })}`}

${t("plan.implementationNote")}:
- ${t("plan.implementationNote1")}
- ${t("plan.implementationNote2")}
- ${t("plan.implementationNote3")}
- ${t("plan.implementationNote4")}
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
    contractPath: writtenContractPath
  };
}
