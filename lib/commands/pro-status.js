import { buildOssProCleanup, buildOssProStatus } from "../pro/status.js";
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
  if (proofMemory.proofRecipeCount != null) {
    console.log(`  Proof recipes: ${proofMemory.proofRecipeCount}`);
  }

  const surfaceSummary = proofMemory.surfaceSummary;
  if (surfaceSummary?.headline) {
    console.log(`  ${surfaceSummary.headline}`);
  }
  for (const surface of (surfaceSummary?.topSurfaces ?? []).slice(0, 3)) {
    if (surface.message) {
      console.log(`  - ${surface.message}`);
    }
  }

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
      if (proof.closureSummary) {
        console.log(`    ${proof.closureSummary}`);
      }
    }
  }

  const recipes = (proofMemory.topProofRecipes ?? []).slice(0, 3);
  if (recipes.length > 0) {
    console.log("  Reusable proof recipes:");
    for (const recipe of recipes) {
      const used = recipe.timesUsed ? ` (used ${recipe.timesUsed}x)` : "";
      console.log(`  - ${recipe.title || recipe.code}${used}`);
      if (recipe.command) {
        console.log(`    Command: ${recipe.command}`);
      }
      if (recipe.freshness) {
        const age = Number.isFinite(Number(recipe.ageDays)) ? ` (${recipe.ageDays} days old)` : "";
        console.log(`    Freshness: ${recipe.freshness}${age}`);
      }
      if (recipe.stalenessWarning) {
        console.log(`    ${recipe.stalenessWarning}`);
      }
      if (recipe.nextAction) {
        console.log(`    Next: ${recipe.nextAction}`);
      }
      if (recipe.userValue) {
        console.log(`    ${recipe.userValue}`);
      }
    }
  }

  const commandPatterns = (proofMemory.commandPatterns ?? []).slice(0, 5);
  if (commandPatterns.length > 0) {
    console.log("  Reusable proof commands:");
    for (const pattern of commandPatterns) {
      const used = pattern.timesUsed ? `used ${pattern.timesUsed}x` : "used";
      const surfaces = (pattern.surfaces ?? []).length > 0 ? `; ${pattern.surfaces.join(", ")}` : "";
      console.log(`  - ${pattern.command} (${used}${surfaces})`);
      if (pattern.nextUse) {
        console.log(`    Next: ${pattern.nextUse}`);
      }
    }
  }

  const evidencePathPatterns = (proofMemory.evidencePathPatterns ?? []).slice(0, 5);
  if (evidencePathPatterns.length > 0) {
    console.log("  Reusable evidence paths:");
    for (const pattern of evidencePathPatterns) {
      const used = pattern.timesUsed ? `used ${pattern.timesUsed}x` : "used";
      const surfaces = (pattern.surfaces ?? []).length > 0 ? `; ${pattern.surfaces.join(", ")}` : "";
      console.log(`  - ${pattern.path} (${used}${surfaces})`);
      if (pattern.nextUse) {
        console.log(`    Next: ${pattern.nextUse}`);
      }
    }
  }
}

function formatProofMemoryPolicy(policy) {
  if (!policy) return null;

  const parts = [];
  if (policy.staleAfterDays != null) {
    parts.push(`stale after ${policy.staleAfterDays} days`);
  }
  if (policy.maxFailureCount != null) {
    const failedReuseLabel = Number(policy.maxFailureCount) === 1
      ? "failed reuse attempt"
      : "failed reuse attempts";
    parts.push(`archive after ${policy.maxFailureCount} ${failedReuseLabel}`);
  }
  if (policy.recentCleanupDays != null) {
    parts.push(`cleanup context ${policy.recentCleanupDays} days`);
  }

  return parts.length > 0 ? `Policy: ${parts.join("; ")}` : null;
}

function printProofMemoryHealth(proofMemoryHealth) {
  if (!proofMemoryHealth) return;

  const state = proofMemoryHealth.state || "unknown";
  const severity = proofMemoryHealth.severity || "unknown";
  console.log(`- Proof memory health: ${state} (${severity})`);
  if (proofMemoryHealth.headline) {
    console.log(`  ${proofMemoryHealth.headline}`);
  }
  if (proofMemoryHealth.summary) {
    console.log(`  ${proofMemoryHealth.summary}`);
  }

  const counts = proofMemoryHealth.counts || {};
  console.log([
    `  Trusted: ${counts.trusted ?? 0}`,
    `Watch: ${counts.watch ?? 0}`,
    `Unreliable: ${counts.unreliable ?? 0}`,
    `Archived: ${counts.archived ?? 0}`,
    `Cleanup events: ${counts.cleanupEvents ?? 0}`,
    `Cleanup candidates: ${counts.cleanupCandidates ?? 0}`
  ].join("; "));

  const policySummary = formatProofMemoryPolicy(proofMemoryHealth.policy || proofMemoryHealth.nextAction?.policy);
  if (policySummary) {
    console.log(`  ${policySummary}`);
  }

  if (proofMemoryHealth.lastCleanupAt) {
    console.log(`  Last cleanup: ${proofMemoryHealth.lastCleanupAt}`);
  }

  const recentCleanupEvents = (proofMemoryHealth.recentCleanupEvents ?? []).slice(0, 3);
  if (recentCleanupEvents.length > 0) {
    console.log("  Recent cleanup:");
    for (const event of recentCleanupEvents) {
      console.log(`  - ${event.summary || `Archived ${event.archivedCount || 0} proof recipe${event.archivedCount === 1 ? "" : "s"}.`}`);
      if ((event.commands ?? []).length > 0) {
        console.log(`    Commands: ${event.commands.slice(0, 5).join(", ")}`);
      }
      if ((event.reasons ?? []).length > 0) {
        console.log(`    Reasons: ${event.reasons.slice(0, 3).join(" | ")}`);
      }
    }
  }

  const action = proofMemoryHealth.nextAction;
  if (action) {
    console.log(`  Next: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  Command: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
  }

  if (proofMemoryHealth.userValue) {
    console.log(`  ${proofMemoryHealth.userValue}`);
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
  printProofMemoryHealth(status.proofMemoryHealth);

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

function printCleanup(cleanup) {
  console.log("Agent Guardrails Pro");
  console.log(`- Proof memory cleanup: ${cleanup.state || "unknown"}`);
  console.log(`  Mode: ${cleanup.mode || "dry-run"}`);

  if (!cleanup.installed) {
    console.log(`- Package: ${cleanup.packageName}`);
    const action = cleanup.nextAction;
    if (action) {
      console.log(`- Next: ${action.label || action.code}`);
      if (action.command) {
        console.log(`  Command: ${action.command}`);
      }
      if (action.value) {
        console.log(`  ${action.value}`);
      }
    }
    if (cleanup.userValue) {
      console.log(`  ${cleanup.userValue}`);
    }
    return;
  }

  const archivedCount = cleanup.cleanup?.archivedCount ?? 0;
  const countLabel = cleanup.mode === "apply" ? "Archived" : "Would archive";
  console.log(`  ${countLabel}: ${archivedCount}`);

  const candidates = (cleanup.cleanup?.wouldArchive || cleanup.cleanup?.archivedRecipes || []).slice(0, 5);
  for (const candidate of candidates) {
    if (candidate.command) {
      console.log(`  - Command: ${candidate.command}`);
    } else if (candidate.title || candidate.code) {
      console.log(`  - ${candidate.title || candidate.code}`);
    }
    if (candidate.reason) {
      console.log(`    Reason: ${candidate.reason}`);
    }
  }

  const action = cleanup.nextAction;
  if (action) {
    console.log(`  Next: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  Command: ${action.command}`);
    }
    if (action.warning) {
      console.log(`  ${action.warning}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
  }

  if (cleanup.userValue) {
    console.log(`  ${cleanup.userValue}`);
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

export async function runProCleanup({
  flags = {},
  locale = null,
  repoRoot = resolveRepoRoot(process.cwd())
} = {}) {
  const config = readConfig(repoRoot) || {};
  const cleanup = await buildOssProCleanup({
    repoRoot,
    config,
    locale: flags.lang || locale,
    apply: Boolean(flags.apply)
  });

  if (flags.json) {
    console.log(JSON.stringify(cleanup, null, 2));
    return cleanup;
  }

  printCleanup(cleanup);
  return cleanup;
}
