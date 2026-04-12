import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

export const PRO_PACKAGE_NAME = "@agent-guardrails/pro";

async function loadPro() {
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve(PRO_PACKAGE_NAME);
    return await import(pathToFileURL(resolved).href);
  } catch {
    return null;
  }
}

export async function buildOssProStatus(context = {}) {
  const pro = await loadPro();

  if (pro?.buildProStatus) {
    return pro.buildProStatus(context);
  }

  return {
    packageName: PRO_PACKAGE_NAME,
    packageVersion: null,
    installed: false,
    license: {
      state: "unavailable",
      valid: false,
      reason: "Install @agent-guardrails/pro to enable Pro status and deeper guardrails.",
      meta: null
    },
    capabilities: [],
    integration: {
      ossPackage: "agent-guardrails",
      activation: "Install @agent-guardrails/pro and configure pro.licenseKey."
    },
    demoGoLiveDecision: null
  };
}
