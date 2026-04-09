/**
 * Pro planning stub for optional @agent-guardrails/pro integration.
 *
 * When the Pro package is installed, rough-intent planning can be upgraded
 * with deeper task-shape suggestions. When absent, OSS behavior remains
 * unchanged.
 */

let _proModule = null;
let _loadAttempted = false;

async function loadPro() {
  if (_loadAttempted) return _proModule;
  _loadAttempted = true;
  try {
    _proModule = await import("@agent-guardrails/pro");
  } catch {
    _proModule = null;
  }
  return _proModule;
}

export async function tryPlanTaskShapes(intent, repoContext) {
  const pro = await loadPro();
  if (pro?.planTaskShapes) {
    return pro.planTaskShapes(intent, repoContext);
  }
  return null;
}
