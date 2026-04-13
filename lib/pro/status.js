import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRO_PACKAGE_NAME = "@agent-guardrails/pro";

async function loadPro(repoRoot = null) {
  const requireRoots = [];
  if (repoRoot) {
    requireRoots.push(path.join(repoRoot, "package.json"));
  }
  requireRoots.push(import.meta.url);

  for (const requireRoot of requireRoots) {
    try {
      const require = createRequire(requireRoot);
      const resolved = require.resolve(PRO_PACKAGE_NAME);
      return await import(pathToFileURL(resolved).href);
    } catch {
      // Try the next resolution root. Missing Pro must degrade silently.
    }
  }

  return null;
}

export async function buildOssProStatus(context = {}) {
  const pro = await loadPro(context.repoRoot);

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

export async function buildOssProCleanup(context = {}) {
  const pro = await loadPro(context.repoRoot);
  const apply = Boolean(context.apply);
  const mode = apply ? "apply" : "dry-run";

  if (!pro) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion: null,
      installed: false,
      action: "proof-memory-cleanup",
      mode,
      state: "unavailable",
      cleanup: {
        archivedCount: 0,
        wouldArchive: []
      },
      nextAction: {
        code: "install-pro",
        label: "Install Pro",
        command: "npm install @agent-guardrails/pro",
        value: "Proof memory cleanup is available when @agent-guardrails/pro is installed."
      },
      userValue: "Pro keeps repo memory useful by archiving stale or repeatedly failed proof recipes."
    };
  }

  const cleanupFn = apply ? pro.applyProofMemoryCleanup : pro.planProofMemoryCleanup;
  const status = pro.buildProStatus ? await pro.buildProStatus(context) : {};

  if (!cleanupFn) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion: status.packageVersion ?? null,
      installed: true,
      action: "proof-memory-cleanup",
      mode,
      state: "unsupported",
      cleanup: {
        archivedCount: 0,
        wouldArchive: []
      },
      nextAction: {
        code: "upgrade-pro",
        label: "Upgrade Pro",
        command: "npm install @agent-guardrails/pro@latest",
        value: "This installed Pro package does not expose proof memory cleanup yet."
      },
      userValue: "Upgrade Pro to maintain proof memory from the OSS CLI."
    };
  }

  const cleanup = await cleanupFn(context.repoRoot, context);

  return {
    packageName: PRO_PACKAGE_NAME,
    packageVersion: status.packageVersion ?? null,
    installed: true,
    action: "proof-memory-cleanup",
    ...cleanup,
    mode: cleanup.mode || mode
  };
}
