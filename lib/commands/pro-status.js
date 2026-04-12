import { buildOssProStatus } from "../pro/status.js";
import { readConfig, resolveRepoRoot } from "../utils.js";

function formatLicense(license) {
  const state = license?.state || "unknown";
  const validity = license?.valid ? "valid" : "not valid";
  return `${state} (${validity})`;
}

function printProofMemory(proofMemory) {
  if (!proofMemory) return;

  console.log(`- Proof memory: ${proofMemory.state || "unknown"}`);
  if (proofMemory.userValue) {
    console.log(`  ${proofMemory.userValue}`);
  }
  console.log(`  Active gaps: ${proofMemory.activeGapCount ?? 0}`);

  for (const gap of (proofMemory.topActiveGaps ?? []).slice(0, 3)) {
    const seen = gap.timesSeen ? ` (seen ${gap.timesSeen}x)` : "";
    console.log(`  - ${gap.title || gap.code}${seen}`);
    if (gap.command) {
      console.log(`    Command: ${gap.command}`);
    }
    if (gap.expectedEvidence) {
      console.log(`    Evidence: ${gap.expectedEvidence}`);
    }
  }

  const recentResolved = (proofMemory.recentResolvedProof ?? []).slice(0, 2);
  if (recentResolved.length > 0) {
    console.log("  Recently resolved:");
    for (const proof of recentResolved) {
      console.log(`  - ${proof.title || proof.code}`);
      if (proof.command) {
        console.log(`    Command: ${proof.command}`);
      }
    }
  }
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

  if (status.readiness?.state) {
    console.log(`- Readiness: ${status.readiness.state}`);
    if (status.readiness.summary) {
      console.log(`  ${status.readiness.summary}`);
    }
  }

  if (status.license?.reason) {
    console.log(`- License note: ${status.license.reason}`);
  }

  if (status.activationFlow?.nextAction) {
    const action = status.activationFlow.nextAction;
    console.log(`- Next Pro action: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  Command: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
    if (status.activationFlow.primaryCommand) {
      console.log(`  Primary command: ${status.activationFlow.primaryCommand}`);
    }
  }

  if ((status.activationChecklist ?? []).length > 0) {
    console.log("- Activation checklist:");
    for (const item of status.activationChecklist) {
      const command = item.command ? ` (${item.command})` : "";
      console.log(`  - ${item.label || item.code}: ${item.status || "unknown"}${command}`);
    }
  }

  printProofMemory(status.proofMemory);

  if ((status.capabilities ?? []).length > 0) {
    console.log("- Capabilities:");
    for (const capability of status.capabilities) {
      const marker = capability.available ? "available" : "unavailable";
      console.log(`  - ${capability.label || capability.code}: ${marker}`);
      if (capability.userValue) {
        console.log(`    ${capability.userValue}`);
      }
    }
  }

  if ((status.conversion?.valueMoments ?? []).length > 0) {
    console.log("- Why Pro matters:");
    if (status.conversion.primaryUseCase) {
      console.log(`  ${status.conversion.primaryUseCase}`);
    }
    for (const item of status.conversion.valueMoments.slice(0, 4)) {
      console.log(`  - ${item.title || item.code}: ${item.outcome || ""}`.trimEnd());
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
