import { normalizeRepoPath, unique } from "../utils.js";

const DEFAULT_EVIDENCE_PATH = ".agent-guardrails/evidence/current-task.md";

function normalizeDirectoryScope(value) {
  const normalized = normalizeRepoPath(value);
  if (!normalized) {
    return "";
  }

  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

export function suggestTaskContractDefaults(config) {
  const workflowDefaults = config?.workflow?.planDefaults ?? {};
  const sourceRoots = config?.checks?.sourceRoots ?? [];
  const testRoots = config?.checks?.testRoots ?? [];

  const allowedPaths = workflowDefaults.allowedPaths?.length > 0
    ? workflowDefaults.allowedPaths.map((item) => normalizeDirectoryScope(item)).filter(Boolean)
    : unique([...sourceRoots, ...testRoots].map((item) => normalizeDirectoryScope(item)).filter(Boolean));

  const requiredCommands = workflowDefaults.requiredCommands ?? [];
  const evidencePaths = workflowDefaults.evidencePaths?.length > 0
    ? workflowDefaults.evidencePaths.map((item) => normalizeRepoPath(item)).filter(Boolean)
    : [DEFAULT_EVIDENCE_PATH];

  return {
    allowedPaths,
    requiredCommands,
    evidencePaths
  };
}
