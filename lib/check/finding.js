import { normalizeRepoPath, unique } from "../utils.js";

export function createFinding({ severity, category, code, message, action, files = [], archaeology }) {
  const finding = {
    severity,
    category,
    code,
    message,
    action,
    files: unique(files.map((item) => normalizeRepoPath(item)).filter(Boolean))
  };
  if (archaeology) {
    finding.archaeology = archaeology;
  }
  return finding;
}

export function createFindingStore() {
  return {
    findings: [],
    failures: [],
    warnings: []
  };
}

export function addFinding(store, finding) {
  store.findings.push(finding);
  if (finding.severity === "error") {
    store.failures.push(finding.message);
    return;
  }

  store.warnings.push(finding.message);
}
