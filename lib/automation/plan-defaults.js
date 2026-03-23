import { createTranslator } from "../i18n.js";
import { normalizeRepoPath, unique } from "../utils.js";

const DEFAULT_EVIDENCE_PATH = ".agent-guardrails/evidence/current-task.md";
const DEFAULT_SECURITY_HINT = "Mention auth, secrets, permissions, and sensitive-data handling explicitly.";
const DEFAULT_DEPENDENCY_HINT = "Mention new or upgraded packages, lockfile changes, and dependency impact explicitly.";
const DEFAULT_PERFORMANCE_HINT = "Mention latency, throughput, or hotspot validation in evidence.";
const DEFAULT_UNDERSTANDING_HINT = "Explain the main tradeoffs so future maintainers can follow the change.";
const DEFAULT_CONTINUITY_HINT = "Mention reuse targets and any deliberate continuity break in evidence.";

function normalizeDirectoryScope(value) {
  const normalized = normalizeRepoPath(value);
  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function suggestTaskContractDefaults(config, locale = null) {
  const { t } = createTranslator(locale);
  const workflowDefaults = config?.workflow?.planDefaults ?? {};
  const sourceRoots = config?.checks?.sourceRoots ?? [];
  const testRoots = config?.checks?.testRoots ?? [];
  const nfrPolicies = config?.nfrPolicies ?? {};
  const securityPolicy = nfrPolicies.security ?? {};
  const dependencyPolicy = nfrPolicies.dependency ?? {};
  const performancePolicy = nfrPolicies.performance ?? {};
  const understandingPolicy = nfrPolicies.understanding ?? {};
  const continuityPolicy = nfrPolicies.continuity ?? {};

  const allowedPaths = workflowDefaults.allowedPaths?.length > 0
    ? workflowDefaults.allowedPaths.map((item) => normalizeDirectoryScope(item)).filter(Boolean)
    : unique([...sourceRoots, ...testRoots].map((item) => normalizeDirectoryScope(item)).filter(Boolean));

  const requiredCommands = workflowDefaults.requiredCommands ?? [];
  const evidencePaths = workflowDefaults.evidencePaths?.length > 0
    ? workflowDefaults.evidencePaths.map((item) => normalizeRepoPath(item)).filter(Boolean)
    : [DEFAULT_EVIDENCE_PATH];

  function localizeKnownHint(value, fallbackKey, defaultEnglish) {
    const normalized = value?.trim();
    if (!normalized) {
      return t(fallbackKey);
    }

    return normalized === defaultEnglish ? t(fallbackKey) : normalized;
  }

  const securityRequirements = [
    localizeKnownHint(securityPolicy.evidenceHint, "defaults.securityRequirementHint", DEFAULT_SECURITY_HINT)
  ];

  const dependencyRequirements = [
    localizeKnownHint(dependencyPolicy.evidenceHint, "defaults.dependencyRequirementHint", DEFAULT_DEPENDENCY_HINT)
  ];

  const performanceRequirements = [
    localizeKnownHint(performancePolicy.evidenceHint, "defaults.performanceRequirementHint", DEFAULT_PERFORMANCE_HINT)
  ];

  const understandingRequirements = [
    localizeKnownHint(understandingPolicy.evidenceHint, "defaults.understandingRequirementHint", DEFAULT_UNDERSTANDING_HINT)
  ];

  const continuityRequirements = [
    localizeKnownHint(continuityPolicy.evidenceHint, "defaults.continuityRequirementHint", DEFAULT_CONTINUITY_HINT)
  ];

  const riskDimensions = {
    securityRequirements,
    dependencyRequirements,
    performanceRequirements,
    understandingRequirements,
    continuityRequirements
  };

  return {
    allowedPaths,
    requiredCommands,
    evidencePaths,
    ...riskDimensions,
    riskDimensions
  };
}
