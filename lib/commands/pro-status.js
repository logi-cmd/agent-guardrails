import { buildOssProStatus } from "../pro/status.js";
import { readConfig, resolveRepoRoot } from "../utils.js";

function formatLicense(license) {
  const state = license?.state || "unknown";
  const validity = license?.valid ? "valid" : "not valid";
  return `${state} (${validity})`;
}

function printTextStatus(status) {
  console.log("Agent Guardrails Pro");

  if (!status.installed) {
    console.log("- Status: not installed");
    console.log(`- Package: ${status.packageName}`);
    console.log("- Next: npm install @agent-guardrails/pro");
    console.log("- Then: add pro.licenseKey to .agent-guardrails/config.json");
    return;
  }

  const version = status.packageVersion ? ` v${status.packageVersion}` : "";
  console.log("- Status: installed");
  console.log(`- Package: ${status.packageName}${version}`);
  console.log(`- License: ${formatLicense(status.license)}`);

  if (status.license?.reason) {
    console.log(`- License note: ${status.license.reason}`);
  }

  if ((status.capabilities ?? []).length > 0) {
    console.log("- Capabilities:");
    for (const capability of status.capabilities) {
      const marker = capability.available ? "available" : "unavailable";
      console.log(`  - ${capability.label || capability.code}: ${marker}`);
    }
  }

  const decision = status.demoGoLiveDecision;
  if (decision) {
    const verdict = String(decision.verdict || "unknown").toUpperCase();
    console.log(`- Demo go-live verdict: ${verdict} (${decision.riskTier || "unknown"})`);
    if ((decision.evidenceGaps ?? []).length > 0) {
      console.log(`- Demo evidence gaps: ${decision.evidenceGaps.slice(0, 3).join(" | ")}`);
    }
    if ((decision.nextBestActions ?? []).length > 0) {
      console.log(`- Demo next action: ${decision.nextBestActions[0]}`);
    }
  }
}

export async function runProStatus({
  flags = {},
  locale = null,
  repoRoot = resolveRepoRoot(process.cwd())
} = {}) {
  const config = readConfig(repoRoot) || {};
  const status = await buildOssProStatus({ repoRoot, config, locale: flags.lang || locale });

  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
    return status;
  }

  printTextStatus(status);
  return status;
}
