import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PRO_PACKAGE_NAME = "@agent-guardrails/pro";

export async function loadPro(repoRoot = null) {
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

export async function buildOssProReport(context = {}) {
  const pro = await loadPro(context.repoRoot);

  if (!pro) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion: null,
      installed: false,
      action: "go-live-report",
      state: "unavailable",
      format: "markdown",
      nextAction: {
        code: "install-pro",
        label: "Install Pro",
        command: "npm install @agent-guardrails/pro",
        value: "Install @agent-guardrails/pro, then run agent-guardrails check --review to generate a go-live report."
      },
      markdown: [
        "# Agent Guardrails Pro Go-Live Report",
        "",
        "Go-live report: unavailable",
        "",
        "Command: npm install @agent-guardrails/pro",
        "",
        "Install @agent-guardrails/pro, then run agent-guardrails check --review to generate a go-live report."
      ].join("\n")
    };
  }

  const status = pro.buildProStatus ? await pro.buildProStatus(context) : {};
  const packageVersion = status.packageVersion ?? null;

  if (!pro.buildGoLiveReport) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion,
      installed: true,
      action: "go-live-report",
      state: "unsupported",
      format: "markdown",
      nextAction: {
        code: "upgrade-pro",
        label: "Upgrade Pro",
        command: "npm install @agent-guardrails/pro@latest",
        value: "This installed Pro package does not expose go-live reports yet."
      },
      markdown: [
        "# Agent Guardrails Pro Go-Live Report",
        "",
        "Go-live report: unsupported",
        "",
        "Upgrade @agent-guardrails/pro to use go-live reports from the OSS CLI."
      ].join("\n")
    };
  }

  const report = await pro.buildGoLiveReport({
    ...(context.review ? { review: context.review } : {}),
    context
  });

  return {
    packageName: PRO_PACKAGE_NAME,
    packageVersion,
    installed: true,
    action: "go-live-report",
    ...report
  };
}

function resolveProWorkbenchView(report = {}, pro = null) {
  if (report.workbenchView) return report.workbenchView;
  if (report.operatorWorkbench?.view) return report.operatorWorkbench.view;
  if (report.operatorWorkbench && pro?.buildOperatorWorkbenchView) {
    return pro.buildOperatorWorkbenchView(report.operatorWorkbench);
  }
  return null;
}

export async function buildOssProWorkbench(context = {}) {
  const pro = await loadPro(context.repoRoot);

  if (!pro) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion: null,
      installed: false,
      action: "operator-workbench",
      state: "unavailable",
      format: "workbench-view",
      nextAction: {
        code: "install-pro",
        label: "Install Pro",
        command: "npm install @agent-guardrails/pro",
        value: "Install @agent-guardrails/pro, then run agent-guardrails check --review to generate a local release workbench."
      },
      userValue: "The Workbench turns Pro's go-live decision into a readable UI instead of making users inspect JSON."
    };
  }

  const status = pro.buildProStatus ? await pro.buildProStatus(context) : {};
  const packageVersion = status.packageVersion ?? null;

  if (!pro.buildGoLiveReport) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion,
      installed: true,
      action: "operator-workbench",
      state: "unsupported",
      format: "workbench-view",
      nextAction: {
        code: "upgrade-pro",
        label: "Upgrade Pro",
        command: "npm install @agent-guardrails/pro@latest",
        value: "This installed Pro package does not expose the operator workbench yet."
      },
      userValue: "Upgrade Pro to open a decision-first Workbench from the OSS CLI."
    };
  }

  const report = await pro.buildGoLiveReport({
    ...(context.review ? { review: context.review } : {}),
    context
  });
  const view = resolveProWorkbenchView(report, pro);
  const html = report.html || (!view && report.operatorWorkbench && pro.renderOperatorWorkbenchHtml
    ? pro.renderOperatorWorkbenchHtml(report.operatorWorkbench)
    : null);

  if (!view && !html) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion,
      installed: true,
      action: "operator-workbench",
      state: "unavailable",
      format: "workbench-view",
      nextAction: {
        code: "run-pro-check",
        label: "Run a Pro-enriched check",
        command: "agent-guardrails check --review",
        value: "Generate the go-live report and Workbench view from a real diff first."
      },
      userValue: "The Workbench opens after Pro has a go-live decision or remembered report to show."
    };
  }

  return {
    packageName: PRO_PACKAGE_NAME,
    packageVersion,
    installed: true,
    action: "operator-workbench",
    state: "ready",
    format: view ? "workbench-view" : "html",
    view,
    html: view ? undefined : html,
    legacyHtmlAvailable: Boolean(view && html),
    operatorWorkbench: report.operatorWorkbench || null,
    verdict: report.verdict || null,
    nextAction: report.nextAction || null,
    userValue: "Open this local Workbench to see Can I ship, the one next action, agent handoff, proof queue, and receipt without reading raw JSON."
  };
}

export async function callOssProMcpTool(name, args = {}, context = {}) {
  const repoRoot = args.repoRoot || context.repoRoot || null;
  const pro = await loadPro(repoRoot);
  if (!pro?.callProMcpTool) {
    return null;
  }

  return pro.callProMcpTool(name, {
    ...args,
    ...(repoRoot ? { repoRoot } : {})
  });
}

export async function buildOssProActivation(context = {}) {
  const pro = await loadPro(context.repoRoot);
  const instanceName = context.instanceName || "agent-guardrails-pro-local";
  const instanceId = context.instanceId || "";
  const licenseKey = context.licenseKey || context.config?.pro?.licenseKey || "";

  if (!pro) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion: null,
      installed: false,
      action: "license-activation",
      activated: false,
      error: "PRO_PACKAGE_NOT_INSTALLED",
      nextAction: {
        code: "install-pro",
        label: "Install Pro",
        command: "npm install @agent-guardrails/pro",
        value: "Install @agent-guardrails/pro before activating a Pro license."
      }
    };
  }

  const status = pro.buildProStatus ? await pro.buildProStatus(context) : {};
  const packageVersion = status.packageVersion ?? null;

  if (!pro.activateLicense) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion,
      installed: true,
      action: "license-activation",
      activated: false,
      error: "PRO_ACTIVATION_UNSUPPORTED",
      nextAction: {
        code: "upgrade-pro",
        label: "Upgrade Pro",
        command: "npm install @agent-guardrails/pro@latest",
        value: "This installed Pro package does not expose license activation yet."
      }
    };
  }

  if (!licenseKey) {
    return {
      packageName: PRO_PACKAGE_NAME,
      packageVersion,
      installed: true,
      action: "license-activation",
      activated: false,
      error: "PRO_LICENSE_REQUIRED",
      nextAction: {
        code: "provide-license-key",
        label: "Provide a Pro license key",
        command: "agent-guardrails pro activate <license-key>",
        value: "Pass the license key from the purchase receipt. Activation stores a user-local cache and does not write the license key into repo config."
      }
    };
  }

  const activationOptions = instanceId ? { instanceId } : {};
  const result = await pro.activateLicense(licenseKey, instanceName, activationOptions);
  return {
    packageName: PRO_PACKAGE_NAME,
    packageVersion,
    installed: true,
    action: "license-activation",
    instanceName,
    ...(instanceId ? { instanceId } : {}),
    ...result
  };
}
