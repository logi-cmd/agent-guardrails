import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildOssProActivation, buildOssProCleanup, buildOssProReport, buildOssProStatus, buildOssProWorkbench } from "../pro/status.js";
import { readConfig, resolveRepoRoot } from "../utils.js";

function proStatusText(locale) {
  const zh = String(locale || "").toLowerCase().startsWith("zh");
  if (zh) {
    return {
      installed: "已安装",
      notInstalled: "未安装",
      status: "状态",
      package: "包",
      license: "许可证",
      next: "下一步",
      then: "然后",
      readiness: "就绪状态",
      licenseNote: "许可证说明",
      nextProAction: "下一步 Pro 动作",
      command: "命令",
      evidence: "证据",
      primaryCommand: "主命令",
      activationChecklist: "激活清单",
      proofMemory: "证据记忆",
      activeGaps: "活跃缺口",
      proofRecipes: "证据配方",
      recentlyResolved: "最近已补齐",
      reusableProofRecipes: "可复用证据配方",
      freshness: "新鲜度",
      reusableProofCommands: "可复用证据命令",
      reusableEvidencePaths: "可复用证据路径",
      proofMemoryHealth: "证据记忆健康度",
      trusted: "可信",
      watch: "观察",
      unreliable: "不可靠",
      archived: "已归档",
      cleanupEvents: "清理事件",
      cleanupCandidates: "清理候选",
      policy: "策略",
      policyAdvice: "策略建议",
      adviceNext: "建议下一步",
      config: "配置",
      lastCleanup: "上次清理",
      recentCleanup: "最近清理",
      commands: "命令",
      reasons: "原因",
      paidValue: "付费价值",
      valueDrivers: "价值驱动",
      nextPaidAction: "下一步付费动作",
      firstValuePath: "首次价值路径",
      nextFirstValueAction: "下一步首次价值动作",
      capabilities: "能力",
      available: "可用",
      unavailable: "不可用",
      whyProMatters: "为什么 Pro 重要",
      demoGoLiveVerdict: "演示上线结论",
      demoEvidenceGaps: "演示证据缺口",
      demoNextAction: "演示下一步动作"
    };
  }

  return {
    installed: "installed",
    notInstalled: "not installed",
    status: "Status",
    package: "Package",
    license: "License",
    next: "Next",
    then: "Then",
    readiness: "Readiness",
    licenseNote: "License note",
    nextProAction: "Next Pro action",
    command: "Command",
    evidence: "Evidence",
    primaryCommand: "Primary command",
    activationChecklist: "Activation checklist",
    proofMemory: "Proof memory",
    activeGaps: "Active gaps",
    proofRecipes: "Proof recipes",
    recentlyResolved: "Recently resolved",
    reusableProofRecipes: "Reusable proof recipes",
    freshness: "Freshness",
    reusableProofCommands: "Reusable proof commands",
    reusableEvidencePaths: "Reusable evidence paths",
    proofMemoryHealth: "Proof memory health",
    trusted: "Trusted",
    watch: "Watch",
    unreliable: "Unreliable",
    archived: "Archived",
    cleanupEvents: "Cleanup events",
    cleanupCandidates: "Cleanup candidates",
    policy: "Policy",
    policyAdvice: "Policy advice",
    adviceNext: "Advice next",
    config: "Config",
    lastCleanup: "Last cleanup",
    recentCleanup: "Recent cleanup",
    commands: "Commands",
    reasons: "Reasons",
    paidValue: "Paid value",
    valueDrivers: "Value drivers",
    nextPaidAction: "Next paid action",
    firstValuePath: "First value path",
    nextFirstValueAction: "Next first-value action",
    capabilities: "Capabilities",
    available: "available",
    unavailable: "unavailable",
    whyProMatters: "Why Pro matters",
    demoGoLiveVerdict: "Demo go-live verdict",
    demoEvidenceGaps: "Demo evidence gaps",
    demoNextAction: "Demo next action"
  };
}

function formatLicense(license) {
  const state = license?.state || "unknown";
  const validity = license?.valid ? "valid" : "not valid";
  return `${state} (${validity})`;
}

function printProofMemory(proofMemory, text) {
  if (!proofMemory) return;

  console.log(`- ${text.proofMemory}: ${proofMemory.state || "unknown"}`);
  if (proofMemory.userValue) {
    console.log(`  ${proofMemory.userValue}`);
  }
  console.log(`  ${text.activeGaps}: ${proofMemory.activeGapCount ?? 0}`);
  if (proofMemory.proofRecipeCount != null) {
    console.log(`  ${text.proofRecipes}: ${proofMemory.proofRecipeCount}`);
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
      console.log(`    ${text.command}: ${gap.command}`);
    }
    if (gap.expectedEvidence) {
      console.log(`    ${text.evidence}: ${gap.expectedEvidence}`);
    }
  }

  const recentResolved = (proofMemory.recentResolvedProof ?? []).slice(0, 2);
  if (recentResolved.length > 0) {
    console.log(`  ${text.recentlyResolved}:`);
    for (const proof of recentResolved) {
      console.log(`  - ${proof.title || proof.code}`);
      if (proof.command) {
        console.log(`    ${text.command}: ${proof.command}`);
      }
      if (proof.closureSummary) {
        console.log(`    ${proof.closureSummary}`);
      }
    }
  }

  const recipes = (proofMemory.topProofRecipes ?? []).slice(0, 3);
  if (recipes.length > 0) {
    console.log(`  ${text.reusableProofRecipes}:`);
    for (const recipe of recipes) {
      const used = recipe.timesUsed ? ` (used ${recipe.timesUsed}x)` : "";
      console.log(`  - ${recipe.title || recipe.code}${used}`);
      if (recipe.command) {
        console.log(`    ${text.command}: ${recipe.command}`);
      }
      if (recipe.freshness) {
        const age = Number.isFinite(Number(recipe.ageDays)) ? ` (${recipe.ageDays} days old)` : "";
        console.log(`    ${text.freshness}: ${recipe.freshness}${age}`);
      }
      if (recipe.stalenessWarning) {
        console.log(`    ${recipe.stalenessWarning}`);
      }
      if (recipe.nextAction) {
        console.log(`    ${text.next}: ${recipe.nextAction}`);
      }
      if (recipe.userValue) {
        console.log(`    ${recipe.userValue}`);
      }
    }
  }

  const commandPatterns = (proofMemory.commandPatterns ?? []).slice(0, 5);
  if (commandPatterns.length > 0) {
    console.log(`  ${text.reusableProofCommands}:`);
    for (const pattern of commandPatterns) {
      const used = pattern.timesUsed ? `used ${pattern.timesUsed}x` : "used";
      const surfaces = (pattern.surfaces ?? []).length > 0 ? `; ${pattern.surfaces.join(", ")}` : "";
      console.log(`  - ${pattern.command} (${used}${surfaces})`);
      if (pattern.nextUse) {
        console.log(`    ${text.next}: ${pattern.nextUse}`);
      }
    }
  }

  const evidencePathPatterns = (proofMemory.evidencePathPatterns ?? []).slice(0, 5);
  if (evidencePathPatterns.length > 0) {
    console.log(`  ${text.reusableEvidencePaths}:`);
    for (const pattern of evidencePathPatterns) {
      const used = pattern.timesUsed ? `used ${pattern.timesUsed}x` : "used";
      const surfaces = (pattern.surfaces ?? []).length > 0 ? `; ${pattern.surfaces.join(", ")}` : "";
      console.log(`  - ${pattern.path} (${used}${surfaces})`);
      if (pattern.nextUse) {
        console.log(`    ${text.next}: ${pattern.nextUse}`);
      }
    }
  }
}

function formatProofMemoryPolicy(policy, text) {
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

  return parts.length > 0 ? `${text.policy}: ${parts.join("; ")}` : null;
}

function printProofMemoryPolicyAdvice(policyAdvice, text) {
  if (!policyAdvice) return;

  const mode = policyAdvice.mode || "unknown";
  console.log(`  ${text.policyAdvice}: ${mode}`);
  if (policyAdvice.summary) {
    console.log(`  ${policyAdvice.summary}`);
  }
  if (policyAdvice.tradeoff) {
    console.log(`  ${policyAdvice.tradeoff}`);
  }
  if (policyAdvice.nextAction) {
    console.log(`  ${text.adviceNext}: ${policyAdvice.nextAction.label || policyAdvice.nextAction.code}`);
    if (policyAdvice.nextAction.command) {
      console.log(`  ${text.command}: ${policyAdvice.nextAction.command}`);
    }
    if (policyAdvice.nextAction.value) {
      console.log(`  ${policyAdvice.nextAction.value}`);
    }
  }
  if (policyAdvice.configPath) {
    console.log(`  ${text.config}: ${policyAdvice.configPath}`);
  }
}

function printProofMemoryHealth(proofMemoryHealth, text) {
  if (!proofMemoryHealth) return;

  const state = proofMemoryHealth.state || "unknown";
  const severity = proofMemoryHealth.severity || "unknown";
  console.log(`- ${text.proofMemoryHealth}: ${state} (${severity})`);
  if (proofMemoryHealth.headline) {
    console.log(`  ${proofMemoryHealth.headline}`);
  }
  if (proofMemoryHealth.summary) {
    console.log(`  ${proofMemoryHealth.summary}`);
  }

  const counts = proofMemoryHealth.counts || {};
  console.log([
    `  ${text.trusted}: ${counts.trusted ?? 0}`,
    `${text.watch}: ${counts.watch ?? 0}`,
    `${text.unreliable}: ${counts.unreliable ?? 0}`,
    `${text.archived}: ${counts.archived ?? 0}`,
    `${text.cleanupEvents}: ${counts.cleanupEvents ?? 0}`,
    `${text.cleanupCandidates}: ${counts.cleanupCandidates ?? 0}`
  ].join("; "));

  const policySummary = formatProofMemoryPolicy(proofMemoryHealth.policy || proofMemoryHealth.nextAction?.policy, text);
  if (policySummary) {
    console.log(`  ${policySummary}`);
  }
  printProofMemoryPolicyAdvice(proofMemoryHealth.policyAdvice, text);

  if (proofMemoryHealth.lastCleanupAt) {
    console.log(`  ${text.lastCleanup}: ${proofMemoryHealth.lastCleanupAt}`);
  }

  const recentCleanupEvents = (proofMemoryHealth.recentCleanupEvents ?? []).slice(0, 3);
  if (recentCleanupEvents.length > 0) {
    console.log(`  ${text.recentCleanup}:`);
    for (const event of recentCleanupEvents) {
      console.log(`  - ${event.summary || `Archived ${event.archivedCount || 0} proof recipe${event.archivedCount === 1 ? "" : "s"}.`}`);
      if ((event.commands ?? []).length > 0) {
        console.log(`    ${text.commands}: ${event.commands.slice(0, 5).join(", ")}`);
      }
      if ((event.reasons ?? []).length > 0) {
        console.log(`    ${text.reasons}: ${event.reasons.slice(0, 3).join(" | ")}`);
      }
    }
  }

  const action = proofMemoryHealth.nextAction;
  if (action) {
    console.log(`  ${text.next}: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  ${text.command}: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
  }

  if (proofMemoryHealth.userValue) {
    console.log(`  ${proofMemoryHealth.userValue}`);
  }
}

function printPaidValue(paidValue, text) {
  if (!paidValue) return;

  const score = paidValue.score == null ? "" : ` (${paidValue.score}/100)`;
  console.log(`- ${text.paidValue}: ${paidValue.state || "unknown"}${score}`);
  if (paidValue.headline) {
    console.log(`  ${paidValue.headline}`);
  }
  if (paidValue.summary) {
    console.log(`  ${paidValue.summary}`);
  }
  if (paidValue.userValue) {
    console.log(`  ${paidValue.userValue}`);
  }

  const drivers = (paidValue.valueDrivers ?? []).slice(0, 4);
  if (drivers.length > 0) {
    console.log(`  ${text.valueDrivers}:`);
    for (const driver of drivers) {
      console.log(`  - ${driver.title || driver.code}: ${driver.outcome || ""}`.trimEnd());
    }
  }

  const action = paidValue.nextAction;
  if (action) {
    console.log(`  ${text.nextPaidAction}: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  ${text.command}: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
  }
}

function printFirstValuePath(firstValuePath, text) {
  if (!firstValuePath) return;

  console.log(`- ${text.firstValuePath}: ${firstValuePath.state || "unknown"}`);
  if (firstValuePath.headline) {
    console.log(`  ${firstValuePath.headline}`);
  }
  if (firstValuePath.userValue) {
    console.log(`  ${firstValuePath.userValue}`);
  }

  for (const step of (firstValuePath.steps ?? []).slice(0, 4)) {
    const command = step.command ? ` (${step.command})` : "";
    console.log(`  - ${step.title || step.code}: ${step.status || "unknown"}${command}`);
    if (step.outcome) {
      console.log(`    ${step.outcome}`);
    }
  }

  const action = firstValuePath.nextAction;
  if (action) {
    console.log(`  ${text.nextFirstValueAction}: ${action.title || action.label || action.code}`);
    if (action.command) {
      console.log(`  ${text.command}: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
  }
}

function printTextStatus(status, locale = "en") {
  const text = proStatusText(locale);
  console.log("Agent Guardrails Pro");

  if (!status.installed) {
    console.log(`- ${text.status}: ${text.notInstalled}`);
    console.log(`- ${text.package}: ${status.packageName}`);
    console.log(`- ${text.next}: npm install @agent-guardrails/pro`);
    console.log(`- ${text.then}: add pro.licenseKey to .agent-guardrails/config.json`);
    return;
  }

  const version = status.packageVersion ? ` v${status.packageVersion}` : "";
  console.log(`- ${text.status}: ${text.installed}`);
  console.log(`- ${text.package}: ${status.packageName}${version}`);
  console.log(`- ${text.license}: ${formatLicense(status.license)}`);

  if (status.readiness?.state) {
    console.log(`- ${text.readiness}: ${status.readiness.state}`);
    if (status.readiness.summary) {
      console.log(`  ${status.readiness.summary}`);
    }
  }

  if (status.license?.reason) {
    console.log(`- ${text.licenseNote}: ${status.license.reason}`);
  }

  if (status.activationFlow?.nextAction) {
    const action = status.activationFlow.nextAction;
    console.log(`- ${text.nextProAction}: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  ${text.command}: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
    if (status.activationFlow.primaryCommand) {
      console.log(`  ${text.primaryCommand}: ${status.activationFlow.primaryCommand}`);
    }
  }

  if ((status.activationChecklist ?? []).length > 0) {
    console.log(`- ${text.activationChecklist}:`);
    for (const item of status.activationChecklist) {
      const command = item.command ? ` (${item.command})` : "";
      console.log(`  - ${item.label || item.code}: ${item.status || "unknown"}${command}`);
    }
  }

  printProofMemory(status.proofMemory, text);
  printProofMemoryHealth(status.proofMemoryHealth, text);
  printPaidValue(status.paidValue, text);
  printFirstValuePath(status.firstValuePath, text);

  if ((status.capabilities ?? []).length > 0) {
    console.log(`- ${text.capabilities}:`);
    for (const capability of status.capabilities) {
      const marker = capability.available ? text.available : text.unavailable;
      console.log(`  - ${capability.label || capability.code}: ${marker}`);
      if (capability.userValue) {
        console.log(`    ${capability.userValue}`);
      }
    }
  }

  if ((status.conversion?.valueMoments ?? []).length > 0) {
    console.log(`- ${text.whyProMatters}:`);
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
    console.log(`- ${text.demoGoLiveVerdict}: ${verdict} (${decision.riskTier || "unknown"})`);
    if ((decision.evidenceGaps ?? []).length > 0) {
      console.log(`- ${text.demoEvidenceGaps}: ${decision.evidenceGaps.slice(0, 3).join(" | ")}`);
    }
    if ((decision.nextBestActions ?? []).length > 0) {
      console.log(`- ${text.demoNextAction}: ${decision.nextBestActions[0]}`);
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

function printReport(report) {
  console.log("Agent Guardrails Pro");

  if (report?.markdown) {
    console.log(report.markdown);
    return;
  }

  console.log(`- Go-live report: ${report?.state || "unavailable"}`);
  console.log(`- Package: ${report?.packageName || "@agent-guardrails/pro"}`);

  const action = report?.nextAction;
  if (action) {
    console.log(`- Next: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  Command: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
    }
    return;
  }

  console.log("- Next: npm install @agent-guardrails/pro");
  console.log("- Then: run agent-guardrails check --review");
}

function openLocalFile(filePath) {
  const opener = process.platform === "win32"
    ? { command: "cmd", args: ["/c", "start", "", filePath] }
    : process.platform === "darwin"
      ? { command: "open", args: [filePath] }
      : { command: "xdg-open", args: [filePath] };
  const child = spawn(opener.command, opener.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function writeWorkbenchHtml(repoRoot, html) {
  const outputDir = path.join(repoRoot, ".agent-guardrails", "pro");
  const outputPath = path.join(outputDir, "operator-workbench.html");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  return outputPath;
}

function printWorkbench(workbench) {
  console.log("Agent Guardrails Pro");
  console.log(`- Operator workbench: ${workbench?.state || "unavailable"}`);

  if (workbench?.outputPath) {
    console.log(`- Local HTML: ${workbench.outputPath}`);
  }

  if (workbench?.opened) {
    console.log("- Opened: yes");
  }

  const action = workbench?.nextAction;
  if (action?.command) {
    console.log(`- Next: ${action.command}`);
  } else if (action?.label || action?.code) {
    console.log(`- Next: ${action.label || action.code}`);
  }

  if (action?.value) {
    console.log(`  ${action.value}`);
  }

  if (workbench?.userValue) {
    console.log(`  ${workbench.userValue}`);
  }
}

function printActivation(activation) {
  console.log("Agent Guardrails Pro");
  console.log(`- License activation: ${activation.activated ? "activated" : "not activated"}`);
  console.log(`- Package: ${activation.packageName}${activation.packageVersion ? ` v${activation.packageVersion}` : ""}`);

  if (activation.activated) {
    console.log(`- Instance: ${activation.instanceId || activation.instanceName || "default"}`);
    if (activation.lifecycle?.state) {
      console.log(`- Lifecycle: ${activation.lifecycle.state}`);
    }
    console.log("- Next: agent-guardrails pro status");
    return;
  }

  if (activation.error) {
    console.log(`- Error: ${activation.error}`);
  }
  const action = activation.nextAction;
  if (action) {
    console.log(`- Next: ${action.label || action.code}`);
    if (action.command) {
      console.log(`  Command: ${action.command}`);
    }
    if (action.value) {
      console.log(`  ${action.value}`);
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

  printTextStatus(status, flags.lang || locale);
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

export async function runProReport({
  flags = {},
  locale = null,
  repoRoot = resolveRepoRoot(process.cwd())
} = {}) {
  const config = readConfig(repoRoot) || {};
  const report = await buildOssProReport({
    repoRoot,
    config,
    locale: flags.lang || locale
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
    return report;
  }

  printReport(report);
  return report;
}

export async function runProWorkbench({
  flags = {},
  locale = null,
  repoRoot = resolveRepoRoot(process.cwd())
} = {}) {
  const config = readConfig(repoRoot) || {};
  const workbench = await buildOssProWorkbench({
    repoRoot,
    config,
    locale: flags.lang || locale
  });

  if (workbench.html) {
    workbench.outputPath = writeWorkbenchHtml(repoRoot, workbench.html);
    if (flags.open) {
      openLocalFile(workbench.outputPath);
      workbench.opened = true;
    }
  }

  if (flags.json) {
    console.log(JSON.stringify(workbench, null, 2));
    return workbench;
  }

  printWorkbench(workbench);
  return workbench;
}

export async function runProActivate({
  positional = [],
  flags = {},
  locale = null,
  repoRoot = resolveRepoRoot(process.cwd())
} = {}) {
  const config = readConfig(repoRoot) || {};
  const licenseKey = flags.license || positional[0] || config.pro?.licenseKey || "";
  const instanceName = flags["instance-name"] || flags.instance || "agent-guardrails-pro-local";
  const activation = await buildOssProActivation({
    repoRoot,
    config,
    locale: flags.lang || locale,
    licenseKey,
    instanceName
  });

  activation.configUpdated = false;

  if (flags.json) {
    console.log(JSON.stringify(activation, null, 2));
    return activation;
  }

  printActivation(activation);
  return activation;
}
