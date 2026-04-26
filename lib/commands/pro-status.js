import { createServer } from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildOssProActivation, buildOssProCleanup, buildOssProReport, buildOssProStatus, buildOssProWorkbench, callOssProMcpTool } from "../pro/status.js";
import { buildWorkbenchPanelModel, renderWorkbenchPanelText } from "../pro/workbench-panel.js";
import { resolveRustCheckRuntime } from "../rust-runtime.js";
import { readConfig, resolveRepoRoot } from "../utils.js";
import { executeCheck } from "./check.js";

function isChineseLocale(locale) {
  return String(locale || "").toLowerCase().startsWith("zh");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asArray(value = []) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function proStatusText(locale) {
  const zh = isChineseLocale(locale);
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

function liveWorkbenchText(locale) {
  if (isChineseLocale(locale)) {
    return {
      liveMode: "实时模式",
      heading: "直接在这个页面推进下一步",
      body: "用这个面板刷新答案、运行下一条 proof，或直接复制给 agent 的完整委托包，不用自己重写计划。",
      ready: "实时模式已就绪。",
      refresh: "刷新答案",
      runNext: "运行下一条 proof",
      autoLoop: "运行短闭环",
      recordHelped: "标记这条 proof 有帮助",
      recordFailed: "标记这条 proof 没帮助",
      copyAgentBrief: "复制通用委托包",
      copyCodexHandoff: "复制 Codex 委托包",
      copyClaudeHandoff: "复制 Claude Code 委托包",
      copyRerun: "复制 rerun 命令",
      nothingToCopy: "现在还没有可复制的内容。",
      copyFailed: "复制失败了，不过委托内容还在页面里。",
      copied: label => `${label} 已复制。`,
      runningNext: "正在运行下一条 proof...",
      runningLoop: "正在运行短闭环...",
      recordingHelped: "正在记录这条 proof 有帮助...",
      recordingFailed: "正在记录这条 proof 没帮助...",
      refreshing: "正在刷新答案...",
      agentHandoff: "Agent 委托包",
      checkAtEnd: "你最后要确认的内容",
      stopAndHandBack: "出现这些情况就停下并交还给人",
      lastProofRun: "最近一次 proof",
      lastShortLoop: "最近一次短闭环",
      proofLabel: "Proof",
      surfaceLabel: "表面",
      evidenceSaved: "证据已保存",
      outcomeLabel: "结果",
      suggestedLabel: "建议结果",
      evidenceLabel: "证据",
      noEvidencePath: "还没有记录证据路径。",
      stepsLabel: "步骤",
      modeLabel: "模式",
      nextCommandLabel: "下一条命令",
      noNextCommand: "当前没有排队中的下一条命令。",
      commandLabel: "命令",
      refreshedStatus: "已刷新最新答案。",
      refreshLogPrefix: "已刷新 Agent Guardrails review check。",
      ranNextSavedRecorded: "已运行下一条 proof、保存 proof note、记录 proof outcome，并刷新了答案。",
      ranNextSaved: "已运行下一条 proof、保存 proof note，并刷新了答案。",
      ranNext: "已运行下一条 proof，并刷新了答案。",
      ranNextWithErrors: "下一条 proof 命令有报错，但答案仍已刷新。",
      shortLoopStatus: count => `已运行 ${count} 步短闭环。`,
      recordedHelped: "已记录这条 proof 有帮助。",
      recordedFailed: "已记录这条 proof 没帮助。",
      currentLoop: "\u5f53\u524d\u95ed\u73af",
      runCurrent: "\u8fd0\u884c\u5f53\u524d\u95ed\u73af",
      runCurrentVisible: "\u8fd0\u884c\u53ef\u89c1\u9a8c\u8bc1",
      runCurrentProof: "\u8fd0\u884c\u5f53\u524d proof",
      rerunAnswer: "\u53ea rerun \u7b54\u6848",
      rerunDone: "\u5df2 rerun \u5e76\u5237\u65b0\u7b54\u6848\u3002",
      saveNote: "\u4fdd\u5b58\u8bc1\u636e\u5907\u6ce8",
      saveNoteAndRerun: "\u4fdd\u5b58\u5907\u6ce8\u5e76 rerun",
      savingNote: "\u6b63\u5728\u4fdd\u5b58\u8bc1\u636e\u5907\u6ce8...",
      savingNoteAndRerun: "\u6b63\u5728\u4fdd\u5b58\u8bc1\u636e\u5907\u6ce8\u5e76 rerun...",
      runningCurrent: "\u6b63\u5728\u8fd0\u884c\u5f53\u524d\u95ed\u73af...",
      currentStep: "\u5f53\u524d\u6b65\u9aa4",
      targetLabel: "\u76ee\u6807",
      watchPointsLabel: "\u89c2\u5bdf\u70b9",
      suggestedEvidenceLabel: "\u9700\u8981\u7684\u8bc1\u636e",
      noWatchPoints: "\u5f53\u524d\u6ca1\u6709\u989d\u5916\u89c2\u5bdf\u70b9\u3002",
      noteTitle: "\u8bc1\u636e\u5907\u6ce8",
      noteSummary: "\u6458\u8981",
      noteArtifacts: "\u622a\u56fe/\u89c6\u9891/\u62a5\u544a\u8def\u5f84",
      noteOutput: "\u8f93\u51fa\u6458\u5f55",
      noteOutcome: "\u89c2\u5bdf\u7ed3\u679c",
      noteSaved: "\u5df2\u4fdd\u5b58\u8bc1\u636e\u5907\u6ce8\u3002",
      noteSavedAndRerun: "\u5df2\u4fdd\u5b58\u8bc1\u636e\u5907\u6ce8\u5e76\u5237\u65b0\u7b54\u6848\u3002",
      noteObservedLabel: "\u5df2\u89c2\u5bdf",
      notePassedLabel: "\u5df2\u901a\u8fc7",
      noteFailedLabel: "\u5df2\u5931\u8d25",
      exportHandoff: "\u5bfc\u51fa\u59d4\u6258\u5305",
      exportingHandoff: "\u6b63\u5728\u5bfc\u51fa\u59d4\u6258\u5305...",
      handoffBundleTitle: "\u5df2\u5bfc\u51fa\u7684\u59d4\u6258\u5305",
      handoffBundleSaved: "\u5df2\u4fdd\u5b58\u5230",
      handoffBundleFiles: "\u5305\u542b\u6587\u4ef6",
      handoffBundleDone: "\u5df2\u5bfc\u51fa\u59d4\u6258\u5305\u3002",
      copyBundlePath: "\u590d\u5236\u5bfc\u51fa\u8def\u5f84",
      visibleLoop: "\u53ef\u89c1\u9a8c\u8bc1\u95ed\u73af",
      visibleWatchTitle: "\u8fd9\u4e00\u8f6e\u8981\u770b\u4ec0\u4e48",
      visibleEvidenceTitle: "\u5b8c\u6210\u540e\u7559\u4e0b\u4ec0\u4e48",
      visibleTargetEmpty: "\u5f53\u524d\u6ca1\u6709\u989d\u5916\u53ef\u89c1\u76ee\u6807\u3002",
      visibleComplete: "\u5b8c\u6210\u53ef\u89c1\u9a8c\u8bc1\u5e76 rerun",
      completingVisible: "\u6b63\u5728\u4fdd\u5b58\u53ef\u89c1\u9a8c\u8bc1\u5e76 rerun...",
      visibleDone: "\u5df2\u4fdd\u5b58\u53ef\u89c1\u9a8c\u8bc1\u5e76\u5237\u65b0\u7b54\u6848\u3002",
      visibleNeedsEvidence: "\u5148\u5199\u4e0b\u4f60\u770b\u5230\u7684\u7ed3\u679c\uff0c\u6216\u586b\u4e00\u4e2a\u622a\u56fe/\u89c6\u9891/\u62a5\u544a\u8def\u5f84\uff0c\u518d\u5b8c\u6210\u53ef\u89c1\u9a8c\u8bc1\u3002",
      noteSummaryPlaceholder: "\u4f8b\u5982\uff1a\u53ef\u89c1\u5730\u8dd1\u5b8c\u767b\u5f55\u6d41\u7a0b\uff0c\u9519\u8bef\u6001\u4e0e\u56de\u9000\u8def\u5f84\u90fd\u6b63\u5e38\u3002",
      noteArtifactsPlaceholder: "\u4f8b\u5982\uff1a.agent-guardrails/evidence/visual/login-watch.png",
      noteOutputPlaceholder: "\u53ef\u4ee5\u8bb0\u5f55\u7ec8\u7aef\u6458\u8981\uff0c\u6216\u7b80\u5355\u5199\u4f60\u770b\u5230\u7684\u754c\u9762\u7ed3\u679c\u3002"
    };
  }

  return {
    liveMode: "Live mode",
    heading: "Run the next step from this page",
    body: "Use this panel to refresh the answer, run the next proof, or copy a complete handoff package to an agent without rewriting the plan.",
    ready: "Live mode is ready.",
    refresh: "Refresh answer",
    runNext: "Run next proof",
    autoLoop: "Run short loop",
    recordHelped: "Mark proof helped",
    recordFailed: "Mark proof didn't help",
    copyAgentBrief: "Copy generic handoff",
    copyCodexHandoff: "Copy Codex handoff",
    copyClaudeHandoff: "Copy Claude Code handoff",
    copyRerun: "Copy rerun command",
    nothingToCopy: "Nothing to copy yet.",
    copyFailed: "Copy failed. The handoff is still shown on this page.",
    copied: label => `${label} copied.`,
    runningNext: "Running the next proof...",
    runningLoop: "Running a short proof loop...",
    recordingHelped: "Recording that the proof helped...",
    recordingFailed: "Recording that the proof did not help...",
    refreshing: "Refreshing the answer...",
    agentHandoff: "Agent handoff",
    checkAtEnd: "What you check at the end",
    stopAndHandBack: "Stop and hand back if",
    lastProofRun: "Last proof run",
    lastShortLoop: "Last short loop",
    proofLabel: "Proof",
    surfaceLabel: "Surface",
    evidenceSaved: "Evidence saved",
    outcomeLabel: "Outcome",
    suggestedLabel: "Suggested",
    evidenceLabel: "Evidence",
    noEvidencePath: "No evidence path recorded yet.",
    stepsLabel: "Steps",
    modeLabel: "Mode",
    nextCommandLabel: "Next command",
    noNextCommand: "No next command is queued right now.",
    commandLabel: "Command",
    refreshedStatus: "Refreshed the release answer.",
    refreshLogPrefix: "Refreshed Agent Guardrails review check.",
    ranNextSavedRecorded: "Ran the next proof, saved a proof note, recorded the proof outcome, and refreshed the answer.",
    ranNextSaved: "Ran the next proof, saved a proof note, and refreshed the answer.",
    ranNext: "Ran the next proof and refreshed the answer.",
    ranNextWithErrors: "The next proof command finished with errors. The answer was refreshed anyway.",
    shortLoopStatus: count => `Ran ${count} short-loop step${count === 1 ? "" : "s"}.`,
    recordedHelped: "Recorded that the proof helped.",
    recordedFailed: "Recorded that the proof did not help.",
    currentLoop: "Current loop",
    runCurrent: "Run current loop",
    runCurrentVisible: "Run visible check",
    runCurrentProof: "Run current proof",
    rerunAnswer: "Rerun answer only",
    rerunDone: "Reran the answer and refreshed the workbench.",
    saveNote: "Save evidence note",
    saveNoteAndRerun: "Save note and rerun",
    savingNote: "Saving the evidence note...",
    savingNoteAndRerun: "Saving the evidence note and rerunning the answer...",
    runningCurrent: "Running the current loop...",
    currentStep: "Current step",
    targetLabel: "Target",
    watchPointsLabel: "Watch points",
    suggestedEvidenceLabel: "Needed evidence",
    noWatchPoints: "No extra watch points are recorded right now.",
    noteTitle: "Evidence note",
    noteSummary: "Summary",
    noteArtifacts: "Screenshot/video/report paths",
    noteOutput: "Output excerpt",
    noteOutcome: "Observed result",
    noteSaved: "Saved the evidence note.",
    noteSavedAndRerun: "Saved the evidence note and refreshed the answer.",
    noteObservedLabel: "Observed",
    notePassedLabel: "Passed",
    noteFailedLabel: "Failed",
    exportHandoff: "Export handoff bundle",
    exportingHandoff: "Exporting the handoff bundle...",
    handoffBundleTitle: "Exported handoff bundle",
    handoffBundleSaved: "Saved to",
    handoffBundleFiles: "Bundle files",
    handoffBundleDone: "Exported the handoff bundle.",
    copyBundlePath: "Copy export path",
    visibleLoop: "Visible verification loop",
    visibleWatchTitle: "What to watch",
    visibleEvidenceTitle: "What to save when it looks right",
    visibleTargetEmpty: "No extra visible target is recorded right now.",
    visibleComplete: "Finish visible check and rerun",
    completingVisible: "Saving the visible check and rerunning the answer...",
    visibleDone: "Saved the visible check and refreshed the answer.",
    visibleNeedsEvidence: "Add what you observed or at least one screenshot, video, or report path before completing the visible check.",
    noteSummaryPlaceholder: "Example: watched the login flow complete visibly and the error state stayed understandable.",
    noteArtifactsPlaceholder: "Example: .agent-guardrails/evidence/visual/login-watch.png",
    noteOutputPlaceholder: "Add a short terminal excerpt or a plain-language note about what you saw on screen."
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

function renderNativeWorkbenchPanel(panelPath) {
  return new Promise((resolve, reject) => {
    let binary;
    try {
      binary = resolveRustCheckRuntime();
    } catch (error) {
      reject(error);
      return;
    }

    let stderr = "";
    const child = spawn(binary, ["workbench-panel", "--file", panelPath], {
      cwd: process.cwd(),
      env: {
        ...process.env
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    child.stdout?.on("data", chunk => {
      process.stdout.write(chunk);
    });
    child.stderr?.on("data", chunk => {
      stderr += String(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Rust workbench-panel renderer terminated by signal ${signal}.`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim() || `exited with code ${code ?? 1}`;
      reject(new Error(`Rust workbench-panel renderer failed: ${detail}`));
    });
  });
}

function writeWorkbenchHtml(repoRoot, html) {
  const outputDir = path.join(repoRoot, ".agent-guardrails", "pro");
  const outputPath = path.join(outputDir, "operator-workbench.html");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, html, "utf8");
  return outputPath;
}

function writeWorkbenchView(repoRoot, view) {
  const outputDir = path.join(repoRoot, ".agent-guardrails", "pro");
  const outputPath = path.join(outputDir, "operator-workbench-view.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(view, null, 2)}\n`, "utf8");
  return outputPath;
}

function writeWorkbenchPanel(repoRoot, panel) {
  const outputDir = path.join(repoRoot, ".agent-guardrails", "pro");
  const outputPath = path.join(outputDir, "operator-workbench-panel.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(panel, null, 2)}\n`, "utf8");
  return outputPath;
}

function writeWorkbenchState(repoRoot, workbench) {
  const outputDir = path.join(repoRoot, ".agent-guardrails", "pro");
  const outputPath = path.join(outputDir, "operator-workbench.json");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(workbench, null, 2)}\n`, "utf8");
  return outputPath;
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += String(chunk);
      if (body.length > 256 * 1024) {
        reject(new Error("Live workbench request body is too large."));
      }
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Live workbench request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function limitText(value, maxLength = 6000) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated]`;
}

const LIVE_AUTO_LOOP_STEP_LIMIT = 2;

function automationDecisionState(workbench = {}) {
  return workbench?.operatorWorkbench?.automationDecision?.state || null;
}

function workbenchVerdict(workbench = {}) {
  return workbench?.operatorWorkbench?.decisionCard?.verdict
    || workbench?.verdict?.verdict
    || null;
}

function liveLoopStopLabel(reason = "", locale = null) {
  if (isChineseLocale(locale)) {
    switch (reason) {
      case "command_failed":
        return "因为 proof 命令失败而停止。";
      case "manual_review_required":
        return "因为刷新后的答案仍需要人工 review 而停止。";
      case "queue_cleared":
        return "因为当前没有下一条 proof 命令而停止。";
      case "repeated_command":
        return "因为下一条 proof 命令重复而停止。";
      case "step_limit":
        return `已达到 ${LIVE_AUTO_LOOP_STEP_LIMIT} 步短闭环上限。`;
      default:
        return "短闭环已停止。";
    }
  }
  switch (reason) {
    case "command_failed":
      return "Stopped after a proof command failed.";
    case "manual_review_required":
      return "Stopped because the refreshed answer still needs a human review.";
    case "queue_cleared":
      return "Stopped because there is no next proof command right now.";
    case "repeated_command":
      return "Stopped because the next proof command repeated.";
    case "step_limit":
      return `Stopped after ${LIVE_AUTO_LOOP_STEP_LIMIT} short-loop step${LIVE_AUTO_LOOP_STEP_LIMIT === 1 ? "" : "s"}.`;
    default:
      return "Stopped after the latest short loop.";
  }
}

function summarizeLiveLoop(lastLoop = null, locale = null) {
  if (!lastLoop?.stepCount) {
    return null;
  }

  return {
    stepCount: lastLoop.stepCount,
    stopReason: lastLoop.stopReason || null,
    stopLabel: liveLoopStopLabel(lastLoop.stopReason, locale),
    finalState: lastLoop.finalState || null,
    finalVerdict: lastLoop.finalVerdict || null,
    automationState: lastLoop.automationState || null,
    nextCommand: lastLoop.nextCommand || null,
    commands: Array.isArray(lastLoop.commands) ? lastLoop.commands : [],
    evidencePaths: Array.isArray(lastLoop.evidencePaths) ? lastLoop.evidencePaths : [],
    steps: Array.isArray(lastLoop.steps)
      ? lastLoop.steps.map(step => ({
        title: step.title || "Proof step",
        command: step.command || null,
        code: step.code || null,
        surface: step.surface || null,
        suggestedOutcome: step.suggestedOutcome || null,
        recordedOutcome: step.recordedOutcome || null,
        evidencePaths: Array.isArray(step.evidencePaths) ? step.evidencePaths : []
      }))
      : []
  };
}

function summarizeLiveSession(liveSession = null, locale = null) {
  if (!liveSession?.lastProofRun?.command && !liveSession?.lastLoop?.stepCount) {
    return null;
  }
  const lastProofRun = liveSession?.lastProofRun || {};

  return {
    title: lastProofRun.title || "Last proof run",
    command: lastProofRun.command || null,
    code: lastProofRun.code || null,
    surface: lastProofRun.surface || null,
    evidencePaths: lastProofRun.evidencePaths || [],
    suggestedOutcome: lastProofRun.suggestedOutcome || null,
    recordedOutcome: lastProofRun.recordedOutcome || null,
    proofNoteState: lastProofRun.proofNoteState || null,
    lastLoop: summarizeLiveLoop(liveSession.lastLoop, locale)
  };
}

function summarizeAutomationHandoff(workbench = {}) {
  const automationDecision = workbench?.operatorWorkbench?.automationDecision || {};
  const automationContract = workbench?.operatorWorkbench?.automationContract || {};
  const view = resolveWorkbenchView(workbench) || {};
  const viewLoop = view.agentLoop || {};
  const executionPackage = viewLoop.nextLoopPackage || {};
  const handoffAction = asArray(view.primaryActions).find(action => action.intent === "handoff_to_agent");
  const nextCommand = automationContract.nextCommand || executionPackage.nextCommand || getNextProofCommand(workbench);
  const humanChecks = asArray(automationContract.humanChecks).length > 0
    ? asArray(automationContract.humanChecks)
    : asArray(viewLoop.humanChecks);
  const stopConditions = asArray(automationContract.stopConditions).length > 0
    ? asArray(automationContract.stopConditions)
    : asArray(viewLoop.stopConditions);
  const copyBrief = String(automationContract.copyBrief || executionPackage.agentBrief || handoffAction?.value || "").trim();

  if (
    !automationDecision.label
    && !automationDecision.summary
    && !viewLoop.headline
    && !copyBrief
    && !nextCommand
    && humanChecks.length === 0
    && stopConditions.length === 0
  ) {
    return null;
  }

  return {
    mode: automationDecision.state || automationContract.mode || viewLoop.state || null,
    label: automationDecision.label || viewLoop.headline || null,
    badge: automationDecision.badge || viewLoop.badge || null,
    summary: automationDecision.summary || automationContract.goal || viewLoop.headline || null,
    humanRole: automationDecision.humanRole || viewLoop.humanRole || null,
    nextCommand: nextCommand || null,
    rerunCommand: automationContract.rerunCommand || viewLoop.rerunCommand || executionPackage.rerunCommand || "agent-guardrails check --review",
    evidenceLocation: automationContract.evidenceLocation || executionPackage.evidenceCapture?.args?.evidencePath || ".agent-guardrails/evidence/",
    copyBrief,
    humanChecks,
    stopConditions
  };
}

function summarizeCurrentLoop(workbench = {}) {
  const operatorWorkbench = workbench?.operatorWorkbench || {};
  const view = resolveWorkbenchView(workbench) || {};
  const action = operatorWorkbench.primaryAction || {};
  const viewAction = asArray(view.primaryActions).find(item => item.intent === "execute_next_proof" || item.type === "command") || {};
  const nextProofSection = asArray(view.sections).find(section => section.id === "next-proof") || {};
  const visual = operatorWorkbench.visualVerification || {};
  const proof = currentProofContext(workbench, action.command || viewAction.command || getNextProofCommand(workbench));
  const command = action.command || viewAction.command || getNextProofCommand(workbench);
  const watchPoints = Array.isArray(visual.watchPoints) ? visual.watchPoints.filter(Boolean) : [];
  const evidencePaths = [
    ...(Array.isArray(visual.evidencePaths) ? visual.evidencePaths : []),
    ...(Array.isArray(workbench?.operatorWorkbench?.automationContract?.evidencePaths)
      ? workbench.operatorWorkbench.automationContract.evidencePaths
      : [])
  ].filter(Boolean);

  if (
    !action.label
    && !action.description
    && !command
    && !visual.summary
    && !visual.target
    && watchPoints.length === 0
    && evidencePaths.length === 0
  ) {
    return null;
  }

  return {
    type: action.type || null,
    label: action.label || viewAction.label || proof.title || nextProofSection.title || null,
    description: action.description || viewAction.value || visual.summary || nextProofSection.summary || proof.expectedEvidence || null,
    command: command || null,
    code: proof.code || null,
    surface: proof.surface || null,
    isVisible: action.type === "visible_agent_verification" || visual.state === "recommended",
    visualState: visual.state || null,
    target: visual.target || null,
    watchPoints,
    suggestedEvidence: proof.expectedEvidence || null,
    evidencePaths
  };
}

function summarizeVisualVerification(workbench = {}) {
  const view = resolveWorkbenchView(workbench) || {};
  const visualSection = asArray(view.sections).find(section => section.id === "visible-verification") || {};
  const visual = workbench?.operatorWorkbench?.visualVerification || visualSection || {};
  const steps = Array.isArray(visual.steps) ? visual.steps.filter(Boolean) : [];
  const watchPoints = Array.isArray(visual.watchPoints) ? visual.watchPoints.filter(Boolean) : [];
  const evidencePaths = Array.isArray(visual.evidencePaths) ? visual.evidencePaths.filter(Boolean) : [];

  if (
    !visual.state
    || visual.state === "not_applicable"
    || (!visual.summary && !visual.target && steps.length === 0 && watchPoints.length === 0 && evidencePaths.length === 0)
  ) {
    return null;
  }

  return {
    state: visual.state,
    summary: visual.summary || null,
    target: visual.target || visual.targetUrl || null,
    command: visual.command || null,
    watchPoints,
    evidencePaths,
    steps: steps.map(step => ({
      code: step.code || null,
      instruction: step.instruction || null,
      expectedObservation: step.expectedObservation || null,
      userVisible: step.userVisible !== false
    }))
  };
}

function hasManualNoteInput(payload = {}) {
  return Boolean(
    String(payload?.summary || "").trim()
    || String(payload?.outputExcerpt || "").trim()
    || parseArtifactPathsInput(payload?.artifactPaths).length > 0
  );
}

function buildExecutionHandoffPackage(workbench = {}, provider = "generic", locale = null) {
  const handoff = summarizeAutomationHandoff(workbench);
  if (!handoff) return null;

  const text = liveWorkbenchText(locale);
  const proof = currentProofContext(workbench, handoff.nextCommand);
  const currentLoop = summarizeCurrentLoop(workbench) || {};
  const intro = provider === "codex"
    ? (isChineseLocale(locale)
      ? "请在这个仓库里继续使用 Agent Guardrails，并按下面的 release loop 直接执行。"
      : "Use Agent Guardrails in this repo and continue the current release loop directly.")
    : provider === "claude-code"
      ? (isChineseLocale(locale)
        ? "请在这个仓库里继续使用 agent-guardrails，并按下面的 release loop 执行后交回结果。"
        : "Please use agent-guardrails in this repo, execute the release loop below, and hand back the result.")
      : (isChineseLocale(locale)
        ? "请继续使用 Agent Guardrails，并按下面这份执行包推进当前 release loop。"
        : "Continue with Agent Guardrails and use this handoff package to move the current release loop forward.");
  const doNowHeading = isChineseLocale(locale) ? "现在就做" : "Do now";
  const stopHeading = text.stopAndHandBack;
  const humanChecksHeading = text.checkAtEnd;
  const saveEvidenceLine = isChineseLocale(locale)
    ? `- 把证据保存到 \`${handoff.evidenceLocation}\`。`
    : `- Save evidence under \`${handoff.evidenceLocation}\`.`;
  const rerunLine = isChineseLocale(locale)
    ? `- 然后运行 \`${handoff.rerunCommand}\`。`
    : `- Then rerun \`${handoff.rerunCommand}\`.`;
  const returnLine = provider === "claude-code"
    ? (isChineseLocale(locale)
      ? "- 最后先返回最新的 release answer，再给出简短的 reviewer summary。"
      : "- Return the refreshed release answer first, then a short reviewer summary.")
    : provider === "codex"
      ? (isChineseLocale(locale)
        ? "- 最后先返回最新的 release answer，再给出简短的证据摘要和是否还需要人工介入。"
        : "- Return the refreshed release answer first, then a short evidence summary and whether a human still needs to step in.")
      : (isChineseLocale(locale)
        ? "- 最后先返回最新的 release answer，再给出简短的证据摘要。"
        : "- Return the refreshed release answer first, then a short evidence summary.");
  const runLine = handoff.nextCommand
    ? (isChineseLocale(locale)
      ? `- 运行 \`${handoff.nextCommand}\`。`
      : `- Run \`${handoff.nextCommand}\`.`)
    : null;
  const focusLine = proof?.title
    ? (isChineseLocale(locale)
      ? `- 聚焦这条 proof：${proof.title}。`
      : `- Focus on this proof: ${proof.title}.`)
    : null;
  const evidenceLine = proof?.expectedEvidence
    ? (isChineseLocale(locale)
      ? `- 需要补的证据：${proof.expectedEvidence}`
      : `- Capture this evidence: ${proof.expectedEvidence}`)
    : null;
  const targetLine = currentLoop?.target
    ? (isChineseLocale(locale)
      ? `- 可见验证目标：${currentLoop.target}`
      : `- Visible target: ${currentLoop.target}`)
    : null;
  const watchLines = Array.isArray(currentLoop?.watchPoints) && currentLoop.watchPoints.length > 0
    ? [
      isChineseLocale(locale) ? "观察点" : "Watch points",
      ...currentLoop.watchPoints.map(item => `- ${item}`)
    ]
    : [];

  const lines = [
    intro,
    handoff.summary ? "" : null,
    handoff.summary || null,
    "",
    doNowHeading,
    runLine,
    focusLine,
    targetLine,
    evidenceLine,
    watchLines.length > 0 ? "" : null,
    ...watchLines,
    saveEvidenceLine,
    rerunLine,
    returnLine,
    handoff.stopConditions.length > 0 ? "" : null,
    handoff.stopConditions.length > 0 ? stopHeading : null,
    ...handoff.stopConditions.map(item => `- ${item}`),
    handoff.humanChecks.length > 0 ? "" : null,
    handoff.humanChecks.length > 0 ? humanChecksHeading : null,
    ...handoff.humanChecks.map(item => `- ${item}`)
  ].filter(Boolean);

  const label = provider === "codex"
    ? (isChineseLocale(locale) ? "Codex 委托包" : "Codex handoff")
    : provider === "claude-code"
      ? (isChineseLocale(locale) ? "Claude Code 委托包" : "Claude Code handoff")
      : (isChineseLocale(locale) ? "通用委托包" : "Generic handoff");

  return {
    provider,
    label,
    text: lines.join("\n")
  };
}

function buildExecutionHandoffPackages(workbench = {}, locale = null) {
  const generic = buildExecutionHandoffPackage(workbench, "generic", locale);
  const codex = buildExecutionHandoffPackage(workbench, "codex", locale);
  const claudeCode = buildExecutionHandoffPackage(workbench, "claude-code", locale);
  if (!generic && !codex && !claudeCode) {
    return null;
  }
  return { generic, codex, claudeCode };
}

function handoffBundleDirectory(repoRoot) {
  return path.join(repoRoot, ".agent-guardrails", "pro", "handoffs");
}

function writeHandoffBundle({ repoRoot, workbench, liveSession, locale }) {
  const handoffPackages = buildExecutionHandoffPackages(workbench, locale);
  const automationHandoff = summarizeAutomationHandoff(workbench);
  const currentLoop = summarizeCurrentLoop(workbench);
  if (!handoffPackages || !automationHandoff) {
    throw new Error("No handoff package is available right now.");
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const bundleDir = path.join(handoffBundleDirectory(repoRoot), timestamp);
  fs.mkdirSync(bundleDir, { recursive: true });

  const files = [];
  const writeFile = (name, content) => {
    if (!String(content || "").trim()) return null;
    const filePath = path.join(bundleDir, name);
    fs.writeFileSync(filePath, `${String(content).trim()}\n`, "utf8");
    files.push(filePath);
    return filePath;
  };

  const genericPath = writeFile("generic-handoff.md", handoffPackages.generic?.text || "");
  const codexPath = writeFile("codex-handoff.md", handoffPackages.codex?.text || "");
  const claudePath = writeFile("claude-code-handoff.md", handoffPackages.claudeCode?.text || "");
  const rerunPath = writeFile("rerun-command.txt", automationHandoff.rerunCommand || "");

  const manifest = {
    format: "agent-guardrails-live-handoff-bundle.v1",
    createdAt: new Date().toISOString(),
    repoRoot,
    locale: locale || "en",
    directory: bundleDir,
    currentLoop,
    automationHandoff,
    liveSession: summarizeLiveSession(liveSession, locale),
    files: {
      generic: genericPath,
      codex: codexPath,
      claudeCode: claudePath,
      rerunCommand: rerunPath
    }
  };
  const manifestPath = path.join(bundleDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  files.push(manifestPath);

  return {
    format: manifest.format,
    createdAt: manifest.createdAt,
    directory: bundleDir,
    files,
    manifestPath,
    primaryFile: codexPath || genericPath || claudePath || manifestPath
  };
}

function summarizeHandoffBundle(bundle = null) {
  if (!bundle?.directory) return null;
  return {
    createdAt: bundle.createdAt || null,
    directory: bundle.directory,
    primaryFile: bundle.primaryFile || null,
    files: Array.isArray(bundle.files) ? bundle.files : [],
    manifestPath: bundle.manifestPath || null
  };
}

function currentProofContext(workbench = {}, command = null) {
  const view = resolveWorkbenchView(workbench) || {};
  const nextProofSection = asArray(view.sections).find(section => section.id === "next-proof") || {};
  const queue = Array.isArray(workbench?.operatorWorkbench?.proofQueue)
    ? workbench.operatorWorkbench.proofQueue
    : Array.isArray(workbench?.proofQueue)
      ? workbench.proofQueue
      : asArray(nextProofSection.items);
  const match = queue.find(item => item?.command === command) || queue[0] || {};
  return {
    title: match.title || workbench?.nextAction?.label || workbench?.nextAction?.code || "Live workbench proof",
    code: match.code || null,
    surface: match.surface || null,
    expectedEvidence: match.expectedEvidence || workbench?.nextAction?.value || ""
  };
}

function summarizeRunNext(workbenchBefore = {}, refreshed = {}, commandResult = {}) {
  const command = commandResult.command || getNextProofCommand(workbenchBefore);
  const beforeState = workbenchBefore?.state || "unknown";
  const afterState = refreshed?.state || "unknown";
  const proof = currentProofContext(workbenchBefore, command);
  const exitSummary = commandResult.exitCode === 0
    ? "The command finished successfully."
    : `The command exited with code ${commandResult.exitCode}.`;
  return {
    title: proof.title,
    code: proof.code,
    surface: proof.surface,
    summary: [
      proof.title ? `${proof.title}.` : null,
      exitSummary,
      `Workbench state moved from ${beforeState} to ${afterState}.`,
      proof.expectedEvidence ? `Expected evidence: ${proof.expectedEvidence}` : null
    ].filter(Boolean).join(" "),
    outputExcerpt: [
      `$ ${command}`,
      limitText(commandResult.stdout),
      limitText(commandResult.stderr)
    ].filter(Boolean).join("\n")
  };
}

function inferredProofOutcome(workbenchBefore = {}, refreshed = {}, commandResult = {}) {
  if ((commandResult.exitCode ?? 0) !== 0) {
    return "failed";
  }

  const beforeCommand = getNextProofCommand(workbenchBefore);
  const afterCommand = getNextProofCommand(refreshed);
  const beforeVerdict = workbenchBefore?.operatorWorkbench?.decisionCard?.verdict || workbenchBefore?.verdict?.verdict || null;
  const afterVerdict = refreshed?.operatorWorkbench?.decisionCard?.verdict || refreshed?.verdict?.verdict || null;
  const beforeState = workbenchBefore?.state || "";
  const afterState = refreshed?.state || "";

  if (afterVerdict === "go" && beforeVerdict !== "go") {
    return "succeeded";
  }
  if (beforeCommand && afterCommand && beforeCommand !== afterCommand) {
    return "succeeded";
  }
  if (beforeCommand && !afterCommand && afterState !== beforeState) {
    return "succeeded";
  }
  return null;
}

function buildLiveProofRun({ workbenchBefore = {}, command, proofCapture = null, suggestedOutcome = null, proofOutcome = null }) {
  const proof = currentProofContext(workbenchBefore, command);
  return {
    title: proof.title,
    command,
    code: proof.code,
    surface: proof.surface,
    evidencePaths: [
      proofCapture?.evidencePath,
      ...(proofCapture?.artifactPaths || [])
    ].filter(Boolean),
    suggestedOutcome,
    recordedOutcome: proofOutcome?.state === "recorded" ? suggestedOutcome : null,
    proofNoteState: proofCapture?.state || null
  };
}

function buildLiveProofLog({ command, commandResult = {}, proofCapture = null, proofOutcome = null, suggestedOutcome = null }) {
  return [
    `$ ${command}`,
    commandResult.stdout.trim(),
    commandResult.stderr.trim(),
    proofCapture?.evidencePath ? `Saved proof note: ${proofCapture.evidencePath}` : null,
    proofCapture?.state === "error" ? `Proof note capture failed: ${proofCapture.error}` : null,
    proofOutcome?.state === "recorded" ? `Recorded proof outcome: ${suggestedOutcome}` : null
  ].filter(Boolean).join("\n");
}

async function captureLiveProofNote({ repoRoot, workbenchBefore, refreshed, commandResult }) {
  const command = commandResult.command || getNextProofCommand(workbenchBefore);
  if (!command) return null;

  const summary = summarizeRunNext(workbenchBefore, refreshed, commandResult);
  try {
    return await callOssProMcpTool("pro_capture_evidence_note", {
      repoRoot,
      title: summary.title,
      command,
      outcome: (commandResult.exitCode ?? 0) === 0 ? "passed" : "failed",
      summary: summary.summary,
      outputExcerpt: summary.outputExcerpt,
      code: summary.code || undefined,
      surface: summary.surface || undefined
    }, { repoRoot });
  } catch (error) {
    return {
      state: "error",
      error: error?.message || "Failed to capture a live proof note."
    };
  }
}

async function recordLiveProofOutcome({ repoRoot, liveSession, outcome, reason }) {
  if (!liveSession?.lastProofRun?.command) {
    throw new Error("Run the next proof first so the workbench knows which proof to record.");
  }

  try {
    return await callOssProMcpTool("pro_record_proof_outcome", {
      repoRoot,
      outcome,
      command: liveSession.lastProofRun.command,
      code: liveSession.lastProofRun.code || undefined,
      surface: liveSession.lastProofRun.surface || undefined,
      reason,
      evidencePaths: liveSession.lastProofRun.evidencePaths || []
    }, { repoRoot });
  } catch (error) {
    return {
      state: "error",
      error: error?.message || "Failed to record the proof outcome."
    };
  }
}

function parseArtifactPathsInput(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

async function captureManualEvidenceNote({
  repoRoot,
  workbench,
  liveSession,
  payload = {}
}) {
  const currentLoop = summarizeCurrentLoop(workbench) || {};
  const currentCommand = String(payload.command || "").trim()
    || liveSession?.lastProofRun?.command
    || currentLoop.command
    || getNextProofCommand(workbench)
    || "";
  const proof = currentProofContext(workbench, currentCommand || null);
  const artifactPaths = parseArtifactPathsInput(payload.artifactPaths);
  const outcome = String(payload.outcome || "observed").trim().toLowerCase();
  const title = String(payload.title || "").trim()
    || liveSession?.lastProofRun?.title
    || currentLoop.label
    || proof.title
    || "Live workbench evidence";
  const summary = String(payload.summary || "").trim()
    || currentLoop.description
    || proof.expectedEvidence
    || title;
  const outputExcerpt = String(payload.outputExcerpt || "").trim();

  try {
    return await callOssProMcpTool("pro_capture_evidence_note", {
      repoRoot,
      title,
      ...(currentCommand ? { command: currentCommand } : {}),
      outcome,
      summary,
      ...(outputExcerpt ? { outputExcerpt } : {}),
      ...(artifactPaths.length > 0 ? { artifactPaths } : {}),
      code: String(payload.code || "").trim()
        || liveSession?.lastProofRun?.code
        || currentLoop.code
        || proof.code
        || undefined,
      surface: String(payload.surface || "").trim()
        || liveSession?.lastProofRun?.surface
        || currentLoop.surface
        || proof.surface
        || undefined
    }, { repoRoot });
  } catch (error) {
    return {
      state: "error",
      error: error?.message || "Failed to capture a live evidence note."
    };
  }
}

function updateLiveSessionFromManualNote({ liveSession, workbench, payload = {}, note = null }) {
  const currentLoop = summarizeCurrentLoop(workbench) || {};
  const proof = currentProofContext(workbench, currentLoop.command || getNextProofCommand(workbench));
  const previous = liveSession?.lastProofRun || {};
  const command = String(payload.command || "").trim() || previous.command || currentLoop.command || null;
  const evidencePaths = [
    note?.evidencePath,
    ...(Array.isArray(note?.artifactPaths) ? note.artifactPaths : [])
  ].filter(Boolean);

  liveSession.lastProofRun = {
    title: String(payload.title || "").trim() || previous.title || currentLoop.label || proof.title || "Live workbench evidence",
    command,
    code: String(payload.code || "").trim() || previous.code || proof.code || null,
    surface: String(payload.surface || "").trim() || previous.surface || proof.surface || null,
    evidencePaths: evidencePaths.length > 0 ? evidencePaths : (previous.evidencePaths || []),
    suggestedOutcome: previous.suggestedOutcome || null,
    recordedOutcome: previous.recordedOutcome || null,
    proofNoteState: note?.state || previous.proofNoteState || null
  };
}

async function rerunLiveWorkbenchAnswer({
  repoRoot,
  config,
  locale,
  liveSession
}) {
  const command = liveSession?.lastProofRun?.command || null;
  await executeCheck({
    repoRoot,
    flags: command ? { review: true, "commands-run": command } : { review: true },
    locale,
    suppressExitCode: true
  });
  return buildCurrentWorkbench({ repoRoot, config, locale });
}

async function executeLiveProofStep({
  repoRoot,
  config,
  locale,
  workbenchBefore,
  liveSession
}) {
  const command = getNextProofCommand(workbenchBefore);
  if (!command) {
    throw new Error("No next proof command is available right now.");
  }

  const commandResult = await runRepoCommand(command, repoRoot);
  await executeCheck({
    repoRoot,
    flags: { review: true, "commands-run": command },
    locale,
    suppressExitCode: true
  });
  const refreshed = await buildCurrentWorkbench({ repoRoot, config, locale });
  const proofCapture = await captureLiveProofNote({
    repoRoot,
    workbenchBefore,
    refreshed,
    commandResult
  });
  const suggestedOutcome = inferredProofOutcome(workbenchBefore, refreshed, commandResult);
  let proofOutcome = null;
  if (suggestedOutcome) {
    proofOutcome = await recordLiveProofOutcome({
      repoRoot,
      liveSession: {
        lastProofRun: buildLiveProofRun({
          workbenchBefore,
          command,
          proofCapture,
          suggestedOutcome
        })
      },
      outcome: suggestedOutcome,
      reason: suggestedOutcome === "succeeded"
        ? "The live workbench rerun moved the release answer forward after this proof command finished."
        : "The live workbench proof command failed before it could move the release answer."
    });
  }

  const lastProofRun = buildLiveProofRun({
    workbenchBefore,
    command,
    proofCapture,
    suggestedOutcome,
    proofOutcome
  });
  liveSession.lastProofRun = lastProofRun;

  return {
    command,
    commandResult,
    refreshed,
    proofCapture,
    suggestedOutcome,
    proofOutcome,
    lastProofRun,
    log: buildLiveProofLog({
      command,
      commandResult,
      proofCapture,
      proofOutcome,
      suggestedOutcome
    })
  };
}

async function runLiveAutoLoop({
  repoRoot,
  config,
  locale,
  liveSession,
  maxSteps = LIVE_AUTO_LOOP_STEP_LIMIT
}) {
  const commandsSeen = new Set();
  const steps = [];
  const combinedLogs = [];
  let currentWorkbench = await buildCurrentWorkbench({ repoRoot, config, locale });
  let stopReason = "queue_cleared";

  for (let index = 0; index < maxSteps; index += 1) {
    const command = getNextProofCommand(currentWorkbench);
    if (!command) {
      stopReason = "queue_cleared";
      break;
    }
    if (commandsSeen.has(command)) {
      stopReason = "repeated_command";
      break;
    }

    const executed = await executeLiveProofStep({
      repoRoot,
      config,
      locale,
      workbenchBefore: currentWorkbench,
      liveSession
    });
    commandsSeen.add(command);
    combinedLogs.push(executed.log);
    steps.push({
      title: executed.lastProofRun.title,
      command,
      code: executed.lastProofRun.code,
      surface: executed.lastProofRun.surface,
      suggestedOutcome: executed.lastProofRun.suggestedOutcome,
      recordedOutcome: executed.lastProofRun.recordedOutcome,
      evidencePaths: executed.lastProofRun.evidencePaths
    });
    currentWorkbench = executed.refreshed;

    if ((executed.commandResult.exitCode ?? 0) !== 0) {
      stopReason = "command_failed";
      break;
    }
    if (automationDecisionState(currentWorkbench) === "manual_review_required") {
      stopReason = "manual_review_required";
      break;
    }

    const nextCommand = getNextProofCommand(currentWorkbench);
    if (!nextCommand) {
      stopReason = "queue_cleared";
      break;
    }
    if (commandsSeen.has(nextCommand)) {
      stopReason = "repeated_command";
      break;
    }
    if (index === maxSteps - 1) {
      stopReason = "step_limit";
      break;
    }
  }

  liveSession.lastLoop = {
    stepCount: steps.length,
    stopReason,
    finalState: currentWorkbench?.state || null,
    finalVerdict: workbenchVerdict(currentWorkbench),
    automationState: automationDecisionState(currentWorkbench),
    nextCommand: getNextProofCommand(currentWorkbench),
    commands: steps.map(step => step.command).filter(Boolean),
    evidencePaths: steps.flatMap(step => step.evidencePaths || []),
    steps
  };

  return {
    workbench: currentWorkbench,
    log: combinedLogs.filter(Boolean).join("\n\n"),
    liveSession: summarizeLiveSession(liveSession, locale)
  };
}

function resolveWorkbenchView(workbench = {}) {
  return workbench?.view
    || workbench?.workbenchView
    || workbench?.operatorWorkbench?.view
    || null;
}

function renderContractRows(rows = []) {
  const values = asArray(rows);
  if (values.length === 0) return "";
  return `
    <dl class="ag-contract-rows">
      ${values.map(row => `
        <div>
          <dt>${escapeHtml(row.label || "")}</dt>
          <dd>${escapeHtml(row.value ?? "unknown")}</dd>
        </div>
      `).join("")}
    </dl>
  `;
}

function renderContractAction(action = {}) {
  const disabled = action.enabled === false ? " disabled" : "";
  const intent = action.intent ? ` data-intent="${escapeHtml(action.intent)}"` : "";
  const label = action.label || action.intent || action.id || "Action";
  return `<button type="button"${disabled}${intent}>${escapeHtml(label)}</button>`;
}

function renderContractSection(section = {}) {
  const actions = asArray(section.actions);
  const items = asArray(section.items);
  const rows = renderContractRows(section.rows);
  const itemList = items.length > 0
    ? `<ul class="ag-contract-list">${items.slice(0, 5).map(item => `
      <li>
        <strong>${escapeHtml(item.title || item.code || "Proof item")}</strong>
        ${item.command ? `<code>${escapeHtml(item.command)}</code>` : ""}
        ${item.expectedEvidence ? `<p>${escapeHtml(item.expectedEvidence)}</p>` : ""}
      </li>
    `).join("")}</ul>`
    : "";
  const actionRow = actions.length > 0
    ? `<div class="ag-contract-actions">${actions.map(renderContractAction).join("")}</div>`
    : "";

  return `
    <section class="ag-contract-card" data-section="${escapeHtml(section.id || "")}" id="${escapeHtml(section.id || "")}">
      <div class="ag-contract-card-head">
        <span>${escapeHtml(section.type || "section")}</span>
        <strong>${escapeHtml(section.title || section.id || "Workbench section")}</strong>
      </div>
      ${section.summary ? `<p>${escapeHtml(section.summary)}</p>` : ""}
      ${rows}
      ${itemList}
      ${section.target ? `<p><b>Target:</b> ${escapeHtml(section.target)}</p>` : ""}
      ${section.command ? `<p><b>Command:</b> <code>${escapeHtml(section.command)}</code></p>` : ""}
      ${actionRow}
    </section>
  `;
}

function renderContractWorkbenchDocument(workbench = {}, locale = null) {
  const view = resolveWorkbenchView(workbench) || {};
  const decision = view.decision || {};
  const navigation = asArray(view.navigation);
  const sections = asArray(view.sections);
  const actions = asArray(view.primaryActions);
  const text = liveWorkbenchText(locale);
  const contractFormat = view.format || "agent-guardrails-workbench-view";
  const tone = view.renderHints?.tone || decision.state || workbench.state || "unknown";

  return `<!doctype html>
<html lang="${isChineseLocale(locale) ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Agent Guardrails Workbench</title>
</head>
<body class="ag-contract-body" data-contract-format="${escapeHtml(contractFormat)}" data-tone="${escapeHtml(tone)}">
  <main class="ag-contract-shell">
    <section class="ag-contract-hero">
      <div>
        <p class="ag-contract-kicker">Contract-first Workbench</p>
        <h1>${escapeHtml(decision.question || view.headline || "Can I ship this change?")}</h1>
        <p>${escapeHtml(decision.reason || view.summary || "Use the structured Workbench view as the product surface.")}</p>
      </div>
      <div class="ag-contract-decision">
        <span>${escapeHtml(decision.title || "Decision")}</span>
        <strong>${escapeHtml(decision.answer || workbench.verdict?.verdict || "Not yet")}</strong>
        <small>${escapeHtml(decision.subhead || decision.riskLabel || workbench.state || "Workbench ready")}</small>
      </div>
    </section>
    ${navigation.length > 0 ? `
      <nav class="ag-contract-nav" aria-label="Workbench view contract cards">
        ${navigation.map(item => `
          <a href="#${escapeHtml(item.id || "")}">
            <span>${escapeHtml(item.title || item.id || "Card")}</span>
            <strong>${escapeHtml(item.value ?? "")}</strong>
            <small>${escapeHtml(item.description || item.state || "")}</small>
          </a>
        `).join("")}
      </nav>
    ` : ""}
    ${actions.length > 0 ? `
      <section class="ag-contract-actions-card">
        <h2>${escapeHtml(text.agentHandoff)}</h2>
        <div class="ag-contract-actions">${actions.map(renderContractAction).join("")}</div>
        <p>${escapeHtml(view.principle || "Render structured cards and actions in the host UI.")}</p>
      </section>
    ` : ""}
    <div class="ag-contract-sections">
      ${sections.map(renderContractSection).join("")}
    </div>
  </main>
  <style>
    .ag-contract-body {
      margin: 0;
      min-height: 100vh;
      color: #e8edf4;
      background:
        radial-gradient(circle at 18% 10%, rgba(91, 124, 255, .18), transparent 30%),
        radial-gradient(circle at 86% 0%, rgba(0, 220, 190, .14), transparent 28%),
        linear-gradient(145deg, #090b10 0%, #11151d 48%, #090b10 100%);
      font-family: ui-sans-serif, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
    }
    .ag-contract-shell {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      padding: 28px 0 40px;
      display: grid;
      gap: 16px;
    }
    .ag-contract-hero,
    .ag-contract-actions-card,
    .ag-contract-card,
    .ag-contract-nav a {
      border: 1px solid rgba(255,255,255,.1);
      background: linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.035));
      box-shadow: 0 24px 80px rgba(0,0,0,.34);
      backdrop-filter: blur(18px);
      border-radius: 24px;
    }
    .ag-contract-hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(230px, .36fr);
      gap: 18px;
      align-items: stretch;
      padding: 22px;
    }
    .ag-contract-kicker,
    .ag-contract-card-head span {
      margin: 0;
      color: #8da2ff;
      text-transform: uppercase;
      letter-spacing: .16em;
      font-size: .72rem;
      font-weight: 800;
    }
    .ag-contract-hero h1 {
      margin: 8px 0 10px;
      max-width: 12ch;
      font-size: clamp(2.4rem, 1.4rem + 5vw, 5.8rem);
      line-height: .88;
      letter-spacing: -.08em;
    }
    .ag-contract-hero p,
    .ag-contract-card p,
    .ag-contract-actions-card p {
      color: #aab4c3;
      line-height: 1.55;
    }
    .ag-contract-decision {
      display: grid;
      align-content: center;
      gap: 8px;
      padding: 20px;
      border-radius: 22px;
      background: rgba(255,255,255,.07);
      border: 1px solid rgba(255,255,255,.1);
    }
    .ag-contract-decision span,
    .ag-contract-decision small { color: #aab4c3; }
    .ag-contract-decision strong {
      font-size: clamp(2.2rem, 1.3rem + 2vw, 4rem);
      letter-spacing: -.06em;
    }
    .ag-contract-nav {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .ag-contract-nav a {
      display: grid;
      gap: 8px;
      padding: 15px;
      color: inherit;
      text-decoration: none;
    }
    .ag-contract-nav strong { font-size: 1.15rem; }
    .ag-contract-nav small { color: #8e98a7; }
    .ag-contract-actions-card,
    .ag-contract-card { padding: 18px; }
    .ag-contract-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .ag-contract-actions button {
      border: 1px solid rgba(141,162,255,.32);
      border-radius: 999px;
      color: #eff3ff;
      background: rgba(141,162,255,.14);
      padding: 10px 14px;
      font: inherit;
      font-weight: 800;
    }
    .ag-contract-sections {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }
    .ag-contract-card-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      margin-bottom: 8px;
    }
    .ag-contract-rows {
      display: grid;
      gap: 8px;
      margin: 12px 0 0;
    }
    .ag-contract-rows div {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-top: 1px solid rgba(255,255,255,.08);
      padding-top: 8px;
    }
    .ag-contract-rows dt,
    .ag-contract-card small { color: #8e98a7; }
    .ag-contract-rows dd { margin: 0; font-weight: 800; }
    .ag-contract-list {
      display: grid;
      gap: 10px;
      padding: 0;
      list-style: none;
    }
    .ag-contract-list li {
      display: grid;
      gap: 5px;
      padding: 12px;
      border-radius: 16px;
      background: rgba(255,255,255,.055);
    }
    .ag-contract-card code {
      color: #dde5ff;
      background: rgba(255,255,255,.09);
      border-radius: 8px;
      padding: 2px 6px;
    }
    @media (max-width: 800px) {
      .ag-contract-hero,
      .ag-contract-nav,
      .ag-contract-sections { grid-template-columns: 1fr; }
    }
  </style>
</body>
</html>`;
}

function injectLiveWorkbenchClient(html, locale = null) {
  const text = liveWorkbenchText(locale);
  const marker = "</body>";
  const livePanel = `
  <section id="ag-live-panel" aria-live="polite">
    <div class="ag-live-shell">
      <div class="ag-live-hero">
        <div class="ag-live-copy">
          <p class="ag-live-kicker">${text.liveMode}</p>
          <h2>${text.heading}</h2>
          <p class="ag-live-body">${text.body}</p>
        </div>
        <div class="ag-live-overview" id="ag-live-overview" hidden></div>
      </div>
      <div class="ag-live-toolbar">
        <button type="button" data-ag-action="run-current">${text.runCurrent}</button>
        <button type="button" data-ag-action="complete-visible" id="ag-live-complete-visible" hidden>${text.visibleComplete}</button>
        <button type="button" data-ag-action="rerun">${text.rerunAnswer}</button>
        <button type="button" data-ag-action="refresh">${text.refresh}</button>
        <button type="button" data-ag-action="run-next">${text.runNext}</button>
        <button type="button" data-ag-action="auto-loop">${text.autoLoop}</button>
        <button type="button" data-ag-action="record-outcome" data-ag-outcome="succeeded">${text.recordHelped}</button>
        <button type="button" data-ag-action="record-outcome" data-ag-outcome="failed">${text.recordFailed}</button>
      </div>
      <div class="ag-live-grid">
        <div class="ag-live-stack">
          <div class="ag-live-card ag-live-card--warm" id="ag-live-current" hidden></div>
          <div class="ag-live-card ag-live-card--mint" id="ag-live-visual" hidden></div>
        </div>
        <div class="ag-live-stack">
          <div class="ag-live-card ag-live-card--sky" id="ag-live-handoff" hidden></div>
          <div class="ag-live-card ag-live-card--paper" id="ag-live-session" hidden></div>
          <div class="ag-live-card ag-live-card--paper ag-live-note" id="ag-live-note">
            <div class="ag-live-card-head">
              <strong id="ag-live-note-title">${text.noteTitle}</strong>
              <small id="ag-live-note-help">${text.visibleNeedsEvidence}</small>
            </div>
            <div class="ag-live-note-grid">
              <label>
                <span>${text.noteSummary}</span>
                <textarea id="ag-live-note-summary" rows="3" placeholder="${text.noteSummaryPlaceholder}"></textarea>
              </label>
              <label>
                <span>${text.noteArtifacts}</span>
                <textarea id="ag-live-note-artifacts" rows="3" placeholder="${text.noteArtifactsPlaceholder}"></textarea>
              </label>
              <label class="ag-live-note-wide">
                <span>${text.noteOutput}</span>
                <textarea id="ag-live-note-output" rows="4" placeholder="${text.noteOutputPlaceholder}"></textarea>
              </label>
              <label>
                <span>${text.noteOutcome}</span>
                <select id="ag-live-note-outcome">
                  <option value="observed">${text.noteObservedLabel}</option>
                  <option value="passed">${text.notePassedLabel}</option>
                  <option value="failed">${text.noteFailedLabel}</option>
                </select>
              </label>
            </div>
            <div class="ag-live-handoff-actions">
              <button type="button" data-ag-action="capture-note">${text.saveNote}</button>
              <button type="button" data-ag-action="capture-note-rerun">${text.saveNoteAndRerun}</button>
            </div>
          </div>
        </div>
      </div>
      <p class="ag-live-status" id="ag-live-status">${text.ready}</p>
      <pre class="ag-live-log" id="ag-live-log" hidden></pre>
    </div>
  </section>
  <style>
    #ag-live-panel { position: sticky; top: 14px; z-index: 1000; margin: 0 auto 18px; width: min(1220px, calc(100% - 28px)); }
    .ag-live-shell {
      border: 1px solid rgba(42,54,44,.16);
      background:
        radial-gradient(circle at top right, rgba(233,244,255,.94), rgba(233,244,255,0) 30%),
        linear-gradient(180deg, rgba(253,250,243,.98) 0%, rgba(245,249,246,.98) 100%);
      box-shadow: 0 20px 60px rgba(22,33,29,.10), 0 3px 0 rgba(22,33,29,.10);
      border-radius: 28px;
      padding: 20px;
      display: grid;
      gap: 16px;
      color: #16211d;
    }
    .ag-live-hero {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(280px, .8fr);
      gap: 14px;
      align-items: stretch;
    }
    .ag-live-copy {
      display: grid;
      gap: 8px;
      padding: 6px 2px 0;
    }
    .ag-live-copy h2 {
      margin: 0;
      font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif;
      font-size: clamp(1.65rem, 1.2rem + 1.1vw, 2.35rem);
      line-height: 1.03;
      letter-spacing: -0.03em;
      max-width: 14ch;
    }
    .ag-live-kicker { margin: 0; text-transform: uppercase; letter-spacing: .16em; font-size: .72rem; font-weight: 800; color: #1d556b; }
    .ag-live-body { margin: 0; max-width: 62ch; color: #45594e; line-height: 1.52; }
    .ag-live-overview,
    .ag-live-card {
      display: grid;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 20px;
      border: 1px solid rgba(42,54,44,.12);
      background: rgba(255,253,248,.86);
      min-width: 0;
    }
    .ag-live-overview { align-content: start; background: linear-gradient(180deg, rgba(255,255,255,.88) 0%, rgba(245,248,253,.92) 100%); }
    .ag-live-overview-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .ag-live-glance {
      display: grid;
      gap: 5px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(246,244,238,.92);
      border: 1px solid rgba(42,54,44,.10);
    }
    .ag-live-glance strong { font-size: .96rem; line-height: 1.2; }
    .ag-live-glance p,
    .ag-live-card p,
    .ag-live-card ul,
    .ag-live-card ol,
    .ag-live-card small { margin: 0; }
    .ag-live-eyebrow { text-transform: uppercase; letter-spacing: .14em; font-size: .68rem; font-weight: 800; color: #6f7f75; }
    .ag-live-grid { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 14px; align-items: start; }
    .ag-live-stack { display: grid; gap: 14px; min-width: 0; }
    .ag-live-card--warm { background: linear-gradient(180deg, rgba(255,248,236,.98) 0%, rgba(255,252,247,.96) 100%); }
    .ag-live-card--mint { background: linear-gradient(180deg, rgba(238,249,244,.98) 0%, rgba(249,253,251,.96) 100%); }
    .ag-live-card--sky { background: linear-gradient(180deg, rgba(241,248,255,.98) 0%, rgba(249,252,255,.96) 100%); }
    .ag-live-card--paper { background: rgba(255,255,252,.92); }
    .ag-live-card-head { display: flex; gap: 12px; align-items: baseline; justify-content: space-between; }
    .ag-live-card-head strong { font-size: 1rem; letter-spacing: -0.01em; }
    .ag-live-card-head small { color: #5c6c63; text-align: right; }
    .ag-live-lead { font-size: 1rem; line-height: 1.46; color: #26352f; }
    .ag-live-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .ag-live-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 6px 10px;
      background: rgba(244,239,227,.94);
      color: #325145;
      font-size: .82rem;
      font-weight: 800;
    }
    .ag-live-card ul,
    .ag-live-card ol { padding-left: 18px; color: #365146; line-height: 1.5; }
    .ag-live-card li + li { margin-top: 4px; }
    .ag-live-callout {
      display: grid;
      gap: 8px;
      padding: 12px 13px;
      border-radius: 16px;
      background: rgba(255,255,255,.82);
      border: 1px solid rgba(42,54,44,.08);
    }
    .ag-live-split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    .ag-live-step-list { display: grid; gap: 8px; }
    .ag-live-step {
      display: grid;
      gap: 4px;
      padding: 10px 12px;
      border-radius: 14px;
      background: rgba(255,255,255,.84);
      border: 1px solid rgba(42,54,44,.08);
    }
    .ag-live-step strong { font-size: .92rem; }
    .ag-live-step small,
    .ag-live-muted { color: #5c6c63; line-height: 1.45; }
    .ag-live-toolbar { display: flex; flex-wrap: wrap; gap: 10px; }
    .ag-live-toolbar button,
    .ag-live-handoff-actions button {
      appearance: none;
      border-radius: 999px;
      padding: 10px 14px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      transition: transform .14s ease, box-shadow .14s ease, background .14s ease;
    }
    .ag-live-toolbar button {
      border: 1px solid rgba(42,54,44,.14);
      background: linear-gradient(180deg, rgba(255,255,255,.95) 0%, rgba(250,247,240,.98) 100%);
      color: #16211d;
      box-shadow: 0 6px 14px rgba(22,33,29,.05);
    }
    .ag-live-toolbar button:first-child,
    .ag-live-toolbar button[data-ag-action="complete-visible"] {
      background: linear-gradient(180deg, rgba(22,79,103,.96) 0%, rgba(20,64,83,.98) 100%);
      color: #f8fcff;
      border-color: rgba(15,57,74,.6);
      box-shadow: 0 10px 18px rgba(22,79,103,.18);
    }
    .ag-live-handoff-actions { display: flex; flex-wrap: wrap; gap: 10px; }
    .ag-live-handoff-actions button { border: 1px solid rgba(29,85,107,.14); background: #ffffff; color: #173749; }
    .ag-live-toolbar button:hover,
    .ag-live-handoff-actions button:hover { transform: translateY(-1px); box-shadow: 0 10px 16px rgba(22,33,29,.08); }
    .ag-live-toolbar button[disabled],
    .ag-live-handoff-actions button[disabled] { opacity: .6; cursor: wait; transform: none; box-shadow: none; }
    .ag-live-note-grid { display: grid; gap: 10px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .ag-live-note-grid label { display: grid; gap: 6px; font-weight: 800; color: #173749; }
    .ag-live-note-grid span { font-size: .92rem; }
    .ag-live-note-grid textarea,
    .ag-live-note-grid select {
      width: 100%;
      border: 1px solid rgba(42,54,44,.14);
      border-radius: 14px;
      padding: 11px 12px;
      font: inherit;
      background: rgba(255,253,248,.98);
      color: #16211d;
      box-sizing: border-box;
    }
    .ag-live-note-grid textarea { resize: vertical; min-height: 86px; line-height: 1.5; }
    .ag-live-note-wide { grid-column: 1 / -1; }
    .ag-live-loop { display: grid; gap: 6px; padding-top: 8px; border-top: 1px solid rgba(42,54,44,.08); }
    .ag-live-loop code,
    .ag-live-card code {
      color: #16211d;
      background: rgba(245,240,230,.92);
      padding: .15em .4em;
      border-radius: 8px;
    }
    .ag-live-status { margin: 0; font-weight: 800; color: #1d556b; }
    .ag-live-log {
      margin: 0;
      white-space: pre-wrap;
      max-height: 220px;
      overflow: auto;
      background: #17211e;
      color: #fff8ea;
      border-radius: 18px;
      padding: 14px;
      font-family: "Cascadia Mono", Consolas, monospace;
      font-size: .92rem;
    }
    @media (max-width: 760px) {
      .ag-live-hero,
      .ag-live-grid,
      .ag-live-split,
      .ag-live-overview-grid,
      .ag-live-note-grid { grid-template-columns: 1fr; }
      .ag-live-note-wide { grid-column: auto; }
    }
  </style>
  <script>
    (() => {
      const statusEl = document.getElementById("ag-live-status");
      const logEl = document.getElementById("ag-live-log");
      const overviewEl = document.getElementById("ag-live-overview");
      const currentEl = document.getElementById("ag-live-current");
      const visualEl = document.getElementById("ag-live-visual");
      const handoffEl = document.getElementById("ag-live-handoff");
      const sessionEl = document.getElementById("ag-live-session");
      const currentButton = document.querySelector('[data-ag-action="run-current"]');
      const completeVisibleButton = document.getElementById("ag-live-complete-visible");
      const noteTitleEl = document.getElementById("ag-live-note-title");
      const noteHelpEl = document.getElementById("ag-live-note-help");
      const noteSummaryEl = document.getElementById("ag-live-note-summary");
      const noteArtifactsEl = document.getElementById("ag-live-note-artifacts");
      const noteOutputEl = document.getElementById("ag-live-note-output");
      const noteOutcomeEl = document.getElementById("ag-live-note-outcome");
      const buttons = Array.from(document.querySelectorAll("[data-ag-action]"));
      const storageKey = "agent-guardrails-live-result";
      const uiText = ${JSON.stringify(text)};

      function setBusy(busy) {
        for (const button of buttons) button.disabled = busy;
      }

      function showSavedResult() {
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (!raw) return;
          sessionStorage.removeItem(storageKey);
          const parsed = JSON.parse(raw);
          statusEl.textContent = parsed.status || uiText.ready;
          if (parsed.log) {
            logEl.hidden = false;
            logEl.textContent = parsed.log;
          }
        } catch {
          sessionStorage.removeItem(storageKey);
        }
      }

      function actionCopy(action, outcome) {
        if (action === "run-current") return uiText.runningCurrent;
        if (action === "complete-visible") return uiText.completingVisible;
        if (action === "run-next") return uiText.runningNext;
        if (action === "auto-loop") return uiText.runningLoop;
        if (action === "capture-note") return uiText.savingNote;
        if (action === "capture-note-rerun") return uiText.savingNoteAndRerun;
        if (action === "export-handoff") return uiText.exportingHandoff;
        if (action === "record-outcome" && outcome === "succeeded") return uiText.recordingHelped;
        if (action === "record-outcome" && outcome === "failed") return uiText.recordingFailed;
        return uiText.refreshing;
      }

      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }

      async function copyText(value, label) {
        const text = String(value || "").trim();
        if (!text) {
          statusEl.textContent = uiText.nothingToCopy;
          return;
        }
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
          } else {
            const area = document.createElement("textarea");
            area.value = text;
            document.body.appendChild(area);
            area.select();
            document.execCommand("copy");
            area.remove();
          }
          statusEl.textContent = uiText.copied(label);
        } catch (error) {
          statusEl.textContent = uiText.copyFailed;
        }
      }

      function notePayload() {
        return {
          summary: noteSummaryEl?.value || "",
          artifactPaths: noteArtifactsEl?.value || "",
          outputExcerpt: noteOutputEl?.value || "",
          outcome: noteOutcomeEl?.value || "observed"
        };
      }

      function seedNoteSurface(currentLoop, visualVerification) {
        const visible = Boolean(currentLoop?.isVisible || visualVerification);
        if (completeVisibleButton) completeVisibleButton.hidden = !visible;
        if (noteTitleEl) noteTitleEl.textContent = visible ? uiText.visibleLoop : uiText.noteTitle;
        if (noteHelpEl) {
          noteHelpEl.textContent = visible ? uiText.visibleNeedsEvidence : uiText.noteOutputPlaceholder;
        }
        if (noteSummaryEl && !noteSummaryEl.value) noteSummaryEl.placeholder = uiText.noteSummaryPlaceholder;
        if (noteArtifactsEl && !noteArtifactsEl.value) noteArtifactsEl.placeholder = uiText.noteArtifactsPlaceholder;
        if (noteOutputEl && !noteOutputEl.value) noteOutputEl.placeholder = uiText.noteOutputPlaceholder;
        if (noteOutcomeEl && visible && !noteOutcomeEl.dataset.userChanged) {
          noteOutcomeEl.value = "observed";
        }
      }

      function renderOverview(currentLoop, summary, bundle, visualVerification) {
        const cards = [
          currentLoop ? {
            eyebrow: uiText.currentLoop,
            title: currentLoop.label || uiText.currentStep,
            body: currentLoop.description || "",
            chips: [
              currentLoop.command ? uiText.commandLabel + ': ' + currentLoop.command : '',
              currentLoop.target ? uiText.targetLabel + ': ' + currentLoop.target : ''
            ].filter(Boolean)
          } : null,
          summary ? {
            eyebrow: uiText.agentHandoff,
            title: summary.label || uiText.agentHandoff,
            body: summary.summary || "",
            chips: [
              summary.mode ? uiText.modeLabel + ': ' + summary.mode : '',
              summary.nextCommand ? uiText.nextCommandLabel + ': ' + summary.nextCommand : ''
            ].filter(Boolean)
          } : null,
          bundle?.directory ? {
            eyebrow: uiText.handoffBundleTitle,
            title: uiText.handoffBundleSaved,
            body: bundle.directory,
            chips: [Array.isArray(bundle.files) ? uiText.handoffBundleFiles + ': ' + bundle.files.length : ''].filter(Boolean)
          } : (visualVerification ? {
            eyebrow: uiText.visibleLoop,
            title: visualVerification.target || uiText.visibleTargetEmpty,
            body: visualVerification.summary || "",
            chips: [
              visualVerification.command ? uiText.commandLabel + ': ' + visualVerification.command : '',
              visualVerification.state ? uiText.modeLabel + ': ' + visualVerification.state : ''
            ].filter(Boolean)
          } : null)
        ].filter(Boolean);

        if (cards.length === 0) {
          overviewEl.hidden = true;
          overviewEl.innerHTML = "";
          return;
        }

        overviewEl.hidden = false;
        overviewEl.innerHTML = [
          '<div class="ag-live-overview-grid">',
          ...cards.map(card => [
            '<div class="ag-live-glance">',
            '<span class="ag-live-eyebrow">' + escapeHtml(card.eyebrow) + '</span>',
            '<strong>' + escapeHtml(card.title) + '</strong>',
            card.body ? '<p>' + escapeHtml(card.body) + '</p>' : '',
            card.chips.length > 0 ? '<div class="ag-live-chip-row">' + card.chips.map(item => '<span class="ag-live-chip">' + escapeHtml(item) + '</span>').join('') + '</div>' : '',
            '</div>'
          ].join('')),
          '</div>'
        ].join('');
      }

      function renderCurrentLoop(currentLoop) {
        if (!currentLoop) {
          currentEl.hidden = true;
          currentEl.innerHTML = "";
          if (currentButton) currentButton.textContent = uiText.runCurrent;
          return;
        }
        if (currentButton) {
          currentButton.textContent = currentLoop.isVisible
            ? uiText.runCurrentVisible
            : currentLoop.command
              ? uiText.runCurrentProof
              : uiText.runCurrent;
        }
        const chips = [
          currentLoop.type ? '<span class="ag-live-chip">' + escapeHtml(currentLoop.type) + '</span>' : '',
          currentLoop.command ? '<span class="ag-live-chip">' + escapeHtml(uiText.commandLabel) + ': ' + escapeHtml(currentLoop.command) + '</span>' : '',
          currentLoop.target ? '<span class="ag-live-chip">' + escapeHtml(uiText.targetLabel) + ': ' + escapeHtml(currentLoop.target) + '</span>' : ''
        ].filter(Boolean).join('');
        const watchPoints = Array.isArray(currentLoop.watchPoints) && currentLoop.watchPoints.length > 0
          ? '<ul>' + currentLoop.watchPoints.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
          : '<p class="muted">' + escapeHtml(uiText.noWatchPoints) + '</p>';
        const evidencePaths = Array.isArray(currentLoop.evidencePaths) && currentLoop.evidencePaths.length > 0
          ? '<small>' + escapeHtml(uiText.evidenceLabel) + ': ' + currentLoop.evidencePaths.map(item => escapeHtml(item)).join('<br>') + '</small>'
          : '';
        currentEl.hidden = false;
        currentEl.innerHTML = [
          '<div class="ag-live-card-head"><strong>' + escapeHtml(uiText.currentStep) + '</strong><small>' + escapeHtml(currentLoop.isVisible ? uiText.visibleLoop : uiText.currentLoop) + '</small></div>',
          currentLoop.label ? '<p class="ag-live-lead"><strong>' + escapeHtml(currentLoop.label) + '</strong></p>' : '',
          chips ? '<div class="ag-live-chip-row">' + chips + '</div>' : '',
          currentLoop.description ? '<p>' + escapeHtml(currentLoop.description) + '</p>' : '',
          '<div class="ag-live-callout">',
          currentLoop.suggestedEvidence ? '<small>' + escapeHtml(uiText.suggestedEvidenceLabel) + ': ' + escapeHtml(currentLoop.suggestedEvidence) + '</small>' : '',
          evidencePaths,
          '</div>',
          '<small>' + escapeHtml(uiText.watchPointsLabel) + '</small>',
          watchPoints
        ].join('');
      }

      function renderVisualLoop(visualVerification, currentLoop) {
        const isVisible = Boolean(currentLoop?.isVisible || visualVerification);
        seedNoteSurface(currentLoop, visualVerification);
        if (!isVisible || !visualVerification) {
          visualEl.hidden = true;
          visualEl.innerHTML = "";
          return;
        }

        const chips = [
          visualVerification.target ? '<span class="ag-live-chip">' + escapeHtml(uiText.targetLabel) + ': ' + escapeHtml(visualVerification.target) + '</span>' : '',
          visualVerification.command ? '<span class="ag-live-chip">' + escapeHtml(uiText.commandLabel) + ': ' + escapeHtml(visualVerification.command) + '</span>' : '',
          visualVerification.state ? '<span class="ag-live-chip">' + escapeHtml(uiText.modeLabel) + ': ' + escapeHtml(visualVerification.state) + '</span>' : ''
        ].filter(Boolean).join('');
        const stepList = Array.isArray(visualVerification.steps) && visualVerification.steps.length > 0
          ? '<div class="ag-live-step-list">' + visualVerification.steps.map((step, index) => [
            '<div class="ag-live-step">',
            '<strong>' + escapeHtml(String(index + 1)) + '. ' + escapeHtml(step.instruction || step.code || uiText.visibleLoop) + '</strong>',
            step.expectedObservation ? '<small>' + escapeHtml(step.expectedObservation) + '</small>' : '',
            '</div>'
          ].join('')).join('') + '</div>'
          : '';
        const watchPoints = Array.isArray(visualVerification.watchPoints) && visualVerification.watchPoints.length > 0
          ? '<ul>' + visualVerification.watchPoints.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
          : '<p class="ag-live-muted">' + escapeHtml(uiText.noWatchPoints) + '</p>';
        const evidencePaths = Array.isArray(visualVerification.evidencePaths) && visualVerification.evidencePaths.length > 0
          ? '<ul>' + visualVerification.evidencePaths.map(item => '<li><code>' + escapeHtml(item) + '</code></li>').join('') + '</ul>'
          : '<p class="ag-live-muted">' + escapeHtml(uiText.noEvidencePath) + '</p>';

        visualEl.hidden = false;
        visualEl.innerHTML = [
          '<div class="ag-live-card-head"><strong>' + escapeHtml(uiText.visibleLoop) + '</strong><small>' + escapeHtml(visualVerification.target || uiText.visibleTargetEmpty) + '</small></div>',
          visualVerification.summary ? '<p class="ag-live-lead">' + escapeHtml(visualVerification.summary) + '</p>' : '',
          chips ? '<div class="ag-live-chip-row">' + chips + '</div>' : '',
          stepList,
          '<div class="ag-live-split">',
          '<div class="ag-live-callout"><strong>' + escapeHtml(uiText.visibleWatchTitle) + '</strong>' + watchPoints + '</div>',
          '<div class="ag-live-callout"><strong>' + escapeHtml(uiText.visibleEvidenceTitle) + '</strong>' + evidencePaths + '</div>',
          '</div>'
        ].join('');
      }

      function renderAutomationHandoff(summary, packages, bundle) {
        if (!summary) {
          handoffEl.hidden = true;
          handoffEl.innerHTML = "";
          return;
        }
        const chips = [
          summary.badge ? '<span class="ag-live-chip">' + escapeHtml(summary.badge) + '</span>' : '',
          summary.mode ? '<span class="ag-live-chip">' + escapeHtml(uiText.modeLabel) + ': ' + escapeHtml(summary.mode) + '</span>' : '',
          summary.nextCommand ? '<span class="ag-live-chip">' + escapeHtml(uiText.nextCommandLabel) + ': ' + escapeHtml(summary.nextCommand) + '</span>' : ''
        ].filter(Boolean).join('');
        const humanChecks = Array.isArray(summary.humanChecks) && summary.humanChecks.length > 0
          ? '<ul>' + summary.humanChecks.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
          : '';
        const stopConditions = Array.isArray(summary.stopConditions) && summary.stopConditions.length > 0
          ? '<ul>' + summary.stopConditions.map(item => '<li>' + escapeHtml(item) + '</li>').join('') + '</ul>'
          : '';
        const packageButtons = [
          packages?.generic?.text ? '<button type="button" data-ag-copy="generic">' + escapeHtml(uiText.copyAgentBrief) + '</button>' : '',
          packages?.codex?.text ? '<button type="button" data-ag-copy="codex">' + escapeHtml(uiText.copyCodexHandoff) + '</button>' : '',
          packages?.claudeCode?.text ? '<button type="button" data-ag-copy="claude">' + escapeHtml(uiText.copyClaudeHandoff) + '</button>' : '',
          '<button type="button" data-ag-trigger="export-handoff">' + escapeHtml(uiText.exportHandoff) + '</button>',
          bundle?.directory ? '<button type="button" data-ag-copy="bundle-path">' + escapeHtml(uiText.copyBundlePath) + '</button>' : '',
          '<button type="button" data-ag-copy="rerun">' + escapeHtml(uiText.copyRerun) + '</button>'
        ].filter(Boolean).join('');
        const bundleSummary = bundle?.directory
          ? [
            '<div class="ag-live-loop">',
            '<strong>' + escapeHtml(uiText.handoffBundleTitle) + '</strong>',
            '<small>' + escapeHtml(uiText.handoffBundleSaved) + ': <code>' + escapeHtml(bundle.directory) + '</code></small>',
            Array.isArray(bundle.files) && bundle.files.length > 0
              ? '<small>' + escapeHtml(uiText.handoffBundleFiles) + ':<br>' + bundle.files.map(item => escapeHtml(item)).join('<br>') + '</small>'
              : '',
            '</div>'
          ].join('')
          : '';
        handoffEl.hidden = false;
        handoffEl.innerHTML = [
          '<strong>' + escapeHtml(summary.label || uiText.agentHandoff) + '</strong>',
          chips ? '<div class="ag-live-chip-row">' + chips + '</div>' : '',
          summary.summary ? '<p>' + escapeHtml(summary.summary) + '</p>' : '',
          summary.humanRole ? '<small>' + escapeHtml(uiText.checkAtEnd) + ': ' + escapeHtml(summary.humanRole) + '</small>' : '',
          '<div class="ag-live-handoff-actions">',
          packageButtons,
          '</div>',
          bundleSummary,
          humanChecks ? '<small>' + escapeHtml(uiText.checkAtEnd) + '</small>' + humanChecks : '',
          stopConditions ? '<small>' + escapeHtml(uiText.stopAndHandBack) + '</small>' + stopConditions : ''
        ].join('');
        handoffEl.dataset.agBrief = packages?.generic?.text || summary.copyBrief || '';
        handoffEl.dataset.agCodex = packages?.codex?.text || '';
        handoffEl.dataset.agClaude = packages?.claudeCode?.text || '';
        handoffEl.dataset.agRerun = summary.rerunCommand || '';
        handoffEl.dataset.agBundlePath = bundle?.directory || '';
      }

      function renderLiveSession(session) {
        if (!session || !session.command) {
          sessionEl.hidden = true;
          sessionEl.innerHTML = "";
          return;
        }
        const chips = [
          session.code ? '<span class="ag-live-chip">' + escapeHtml(uiText.proofLabel) + ': ' + escapeHtml(session.code) + '</span>' : '',
          session.surface ? '<span class="ag-live-chip">' + escapeHtml(uiText.surfaceLabel) + ': ' + escapeHtml(session.surface) + '</span>' : '',
          session.proofNoteState === 'captured' ? '<span class="ag-live-chip">' + escapeHtml(uiText.evidenceSaved) + '</span>' : '',
          session.recordedOutcome ? '<span class="ag-live-chip">' + escapeHtml(uiText.outcomeLabel) + ': ' + escapeHtml(session.recordedOutcome) + '</span>' : '',
          (!session.recordedOutcome && session.suggestedOutcome) ? '<span class="ag-live-chip">' + escapeHtml(uiText.suggestedLabel) + ': ' + escapeHtml(session.suggestedOutcome) + '</span>' : ''
        ].filter(Boolean).join('');
        const evidenceLines = Array.isArray(session.evidencePaths) && session.evidencePaths.length > 0
          ? '<small>' + escapeHtml(uiText.evidenceLabel) + ': ' + session.evidencePaths.map(item => escapeHtml(item)).join('<br>') + '</small>'
          : '<small>' + escapeHtml(uiText.noEvidencePath) + '</small>';
        const lastLoop = session.lastLoop && session.lastLoop.stepCount
          ? [
            '<div class="ag-live-loop">',
            '<strong>' + escapeHtml(uiText.lastShortLoop) + '</strong>',
            '<div class="ag-live-chip-row">',
            '<span class="ag-live-chip">' + escapeHtml(uiText.stepsLabel) + ': ' + session.lastLoop.stepCount + '</span>',
            session.lastLoop.stopLabel ? '<span class="ag-live-chip">' + escapeHtml(session.lastLoop.stopLabel) + '</span>' : '',
            session.lastLoop.automationState ? '<span class="ag-live-chip">' + escapeHtml(uiText.modeLabel) + ': ' + escapeHtml(session.lastLoop.automationState) + '</span>' : '',
            '</div>',
            session.lastLoop.nextCommand ? '<small>' + escapeHtml(uiText.nextCommandLabel) + ': <code>' + escapeHtml(session.lastLoop.nextCommand) + '</code></small>' : '<small>' + escapeHtml(uiText.noNextCommand) + '</small>',
            Array.isArray(session.lastLoop.commands) && session.lastLoop.commands.length > 0
              ? '<ul>' + session.lastLoop.commands.map(command => '<li><code>' + escapeHtml(command) + '</code></li>').join('') + '</ul>'
              : '',
            '</div>'
          ].join('')
          : '';
        sessionEl.hidden = false;
        sessionEl.innerHTML = [
          '<div class="ag-live-card-head"><strong>' + escapeHtml(session.title || uiText.lastProofRun) + '</strong><small>' + escapeHtml(uiText.lastProofRun) + '</small></div>',
          '<small>' + escapeHtml(uiText.commandLabel) + ': <code>' + escapeHtml(session.command) + '</code></small>',
          chips ? '<div class="ag-live-chip-row">' + chips + '</div>' : '',
          evidenceLines,
          lastLoop
        ].join('');
      }

      async function hydrateLiveSession() {
        try {
          const response = await fetch('/__agent_guardrails__/workbench/state');
          if (!response.ok) return;
          const payload = await response.json();
          renderOverview(payload.currentLoop || null, payload.automationHandoff || null, payload.handoffBundle || null, payload.visualVerification || null);
          renderCurrentLoop(payload.currentLoop || null);
          renderVisualLoop(payload.visualVerification || null, payload.currentLoop || null);
          renderAutomationHandoff(payload.automationHandoff || null, payload.handoffPackages || null, payload.handoffBundle || null);
          renderLiveSession(payload.liveSession);
        } catch {
          // Leave the page usable even if the state read fails.
        }
      }

      async function runAction(action, payload = {}) {
        setBusy(true);
        statusEl.textContent = actionCopy(action, payload.outcome);
        try {
          const response = await fetch("/__agent_guardrails__/workbench/" + action, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Live workbench action failed.");
          }
          sessionStorage.setItem(storageKey, JSON.stringify({
            status: payload.statusMessage,
            log: payload.log || ""
          }));
          window.location.reload();
        } catch (error) {
          statusEl.textContent = error.message || "Live workbench action failed.";
          logEl.hidden = false;
          logEl.textContent = error.stack || error.message || String(error);
        } finally {
          setBusy(false);
        }
      }

      buttons.forEach((button) => {
        button.addEventListener("click", () => runAction(
          button.dataset.agAction,
          button.dataset.agAction === "capture-note" || button.dataset.agAction === "capture-note-rerun" || button.dataset.agAction === "complete-visible"
            ? notePayload()
            : (button.dataset.agOutcome ? { outcome: button.dataset.agOutcome } : {})
        ));
      });
      noteOutcomeEl?.addEventListener("change", () => {
        noteOutcomeEl.dataset.userChanged = "true";
      });
      handoffEl.addEventListener("click", (event) => {
        const target = event.target.closest("[data-ag-copy]");
        const trigger = event.target.closest("[data-ag-trigger]");
        if (trigger) {
          runAction(trigger.dataset.agTrigger, {});
          return;
        }
        if (!target) return;
        if (target.dataset.agCopy === "generic") {
          copyText(handoffEl.dataset.agBrief || "", uiText.copyAgentBrief);
          return;
        }
        if (target.dataset.agCopy === "codex") {
          copyText(handoffEl.dataset.agCodex || "", uiText.copyCodexHandoff);
          return;
        }
        if (target.dataset.agCopy === "claude") {
          copyText(handoffEl.dataset.agClaude || "", uiText.copyClaudeHandoff);
          return;
        }
        if (target.dataset.agCopy === "bundle-path") {
          copyText(handoffEl.dataset.agBundlePath || "", uiText.copyBundlePath);
          return;
        }
        if (target.dataset.agCopy === "rerun") {
          copyText(handoffEl.dataset.agRerun || "", uiText.copyRerun);
        }
      });

      showSavedResult();
      hydrateLiveSession();
    })();
  </script>
`;
  return html.includes(marker) ? html.replace(marker, `${livePanel}\n${marker}`) : `${html}\n${livePanel}`;
}

function stripServerOnlyFields(workbench = {}) {
  const {
    liveServer,
    ...rest
  } = workbench || {};
  return rest;
}

async function buildCurrentWorkbench({ repoRoot, config, locale }) {
  const workbench = await buildOssProWorkbench({
    repoRoot,
    config,
    locale
  });

  const statePath = writeWorkbenchState(repoRoot, stripServerOnlyFields(workbench));
  return { ...workbench, statePath };
}

function getNextProofCommand(workbench = {}) {
  const view = resolveWorkbenchView(workbench) || {};
  const viewCommandAction = asArray(view.primaryActions).find(action => action.type === "command" && action.command);
  const nextProofAction = asArray(asArray(view.sections).find(section => section.id === "next-proof")?.actions)
    .find(action => action.type === "command" && action.command);
  return view?.agentLoop?.nextLoopPackage?.nextCommand
    || viewCommandAction?.command
    || nextProofAction?.command
    || workbench?.operatorWorkbench?.automationContract?.nextCommand
    || workbench?.operatorWorkbench?.primaryAction?.command
    || workbench?.nextAction?.command
    || null;
}

function runRepoCommand(command, repoRoot) {
  return new Promise((resolve) => {
    const shellCommand = process.platform === "win32"
      ? { file: process.env.ComSpec || "cmd.exe", args: ["/d", "/s", "/c", command] }
      : { file: "/bin/sh", args: ["-lc", command] };
    const child = spawn(shellCommand.file, shellCommand.args, {
      cwd: repoRoot,
      windowsHide: true,
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", chunk => {
      stderr += String(chunk);
    });
    child.on("close", code => {
      resolve({ command, exitCode: code ?? 0, stdout, stderr });
    });
    child.on("error", error => {
      resolve({ command, exitCode: 1, stdout, stderr: `${stderr}${error.message}` });
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function buildLiveWorkbenchPayload(workbench, liveSession, locale) {
  const panel = workbench?.panel || buildWorkbenchPanelModel(resolveWorkbenchView(workbench), { locale });
  return {
    ...stripServerOnlyFields(workbench),
    ...(panel ? { panel } : {}),
    currentLoop: summarizeCurrentLoop(workbench),
    visualVerification: summarizeVisualVerification(workbench),
    automationHandoff: summarizeAutomationHandoff(workbench),
    handoffPackages: buildExecutionHandoffPackages(workbench, locale),
    handoffBundle: summarizeHandoffBundle(liveSession?.lastHandoffBundle),
    liveSession: summarizeLiveSession(liveSession, locale)
  };
}

async function startLiveWorkbenchServer({ repoRoot, config, locale }) {
  const text = liveWorkbenchText(locale);
  const liveSession = {
    lastProofRun: null,
    lastLoop: null,
    lastHandoffBundle: null
  };
  const server = createServer(async (req, res) => {
    (async () => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/") {
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const baseHtml = resolveWorkbenchView(workbench)
          ? renderContractWorkbenchDocument(workbench, locale)
          : workbench.html || "<!doctype html><html><body><main><h1>Workbench unavailable</h1></main></body></html>";
        const liveHtml = injectLiveWorkbenchClient(baseHtml, locale);
        sendHtml(res, 200, liveHtml);
        return;
      }

      if (req.method === "GET" && url.pathname === "/__agent_guardrails__/workbench/state") {
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        sendJson(res, 200, buildLiveWorkbenchPayload(workbench, liveSession, locale));
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/refresh") {
        await executeCheck({
          repoRoot,
          flags: { review: true },
          locale,
          suppressExitCode: true
        });
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        sendJson(res, 200, {
          ok: true,
          statusMessage: text.refreshedStatus,
          log: `${text.refreshLogPrefix}\n${text.nextCommandLabel}: ${workbench.nextAction?.command || workbench.nextAction?.label || "none"}`,
          ...buildLiveWorkbenchPayload(workbench, liveSession, locale),
          workbench: stripServerOnlyFields(workbench)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/rerun") {
        const refreshed = await rerunLiveWorkbenchAnswer({
          repoRoot,
          config,
          locale,
          liveSession
        });
        sendJson(res, 200, {
          ok: true,
          statusMessage: text.rerunDone,
          log: `${text.refreshLogPrefix}\n${text.nextCommandLabel}: ${refreshed.nextAction?.command || refreshed.nextAction?.label || "none"}`,
          ...buildLiveWorkbenchPayload(refreshed, liveSession, locale),
          workbench: stripServerOnlyFields(refreshed)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/run-next") {
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const command = getNextProofCommand(workbench);
        if (!command) {
          sendJson(res, 400, { error: "No next proof command is available right now." });
          return;
        }
        liveSession.lastLoop = null;
        const executed = await executeLiveProofStep({
          repoRoot,
          config,
          locale,
          workbenchBefore: workbench,
          liveSession
        });
        sendJson(res, 200, {
          ok: executed.commandResult.exitCode === 0,
          statusMessage: executed.proofCapture?.state === "captured"
            ? (executed.proofOutcome?.state === "recorded"
              ? text.ranNextSavedRecorded
              : text.ranNextSaved)
            : (executed.commandResult.exitCode === 0
              ? text.ranNext
              : text.ranNextWithErrors),
          log: executed.log,
          commandResult: executed.commandResult,
          proofCapture: executed.proofCapture,
          proofOutcome: executed.proofOutcome,
          suggestedOutcome: executed.suggestedOutcome,
          ...buildLiveWorkbenchPayload(executed.refreshed, liveSession, locale),
          workbench: stripServerOnlyFields(executed.refreshed)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/run-current") {
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const currentLoop = summarizeCurrentLoop(workbench);
        if (!currentLoop?.command) {
          sendJson(res, 400, { error: "No current loop command is available right now." });
          return;
        }
        liveSession.lastLoop = null;
        const executed = await executeLiveProofStep({
          repoRoot,
          config,
          locale,
          workbenchBefore: workbench,
          liveSession
        });
        sendJson(res, 200, {
          ok: executed.commandResult.exitCode === 0,
          statusMessage: currentLoop.isVisible
            ? (executed.proofCapture?.state === "captured" ? text.noteSavedAndRerun : text.rerunDone)
            : (executed.proofCapture?.state === "captured"
              ? (executed.proofOutcome?.state === "recorded"
                ? text.ranNextSavedRecorded
                : text.ranNextSaved)
              : (executed.commandResult.exitCode === 0
                ? text.ranNext
                : text.ranNextWithErrors)),
          log: executed.log,
          commandResult: executed.commandResult,
          proofCapture: executed.proofCapture,
          proofOutcome: executed.proofOutcome,
          suggestedOutcome: executed.suggestedOutcome,
          ...buildLiveWorkbenchPayload(executed.refreshed, liveSession, locale),
          workbench: stripServerOnlyFields(executed.refreshed)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/auto-loop") {
        const initialWorkbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        if (!getNextProofCommand(initialWorkbench)) {
          sendJson(res, 400, { error: "No next proof command is available right now." });
          return;
        }

        const loopResult = await runLiveAutoLoop({
          repoRoot,
          config,
          locale,
          liveSession
        });
        sendJson(res, 200, {
          ok: loopResult.liveSession?.lastLoop?.stopReason !== "command_failed",
          statusMessage: `${text.shortLoopStatus(loopResult.liveSession?.lastLoop?.stepCount || 0)} ${loopResult.liveSession?.lastLoop?.stopLabel || ""}`.trim(),
          log: loopResult.log,
          ...buildLiveWorkbenchPayload(loopResult.workbench, liveSession, locale),
          liveSession: loopResult.liveSession,
          workbench: stripServerOnlyFields(loopResult.workbench)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/capture-note") {
        const body = await parseRequestBody(req);
        if (!hasManualNoteInput(body)) {
          sendJson(res, 400, { error: text.visibleNeedsEvidence });
          return;
        }
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const proofCapture = await captureManualEvidenceNote({
          repoRoot,
          workbench,
          liveSession,
          payload: body
        });

        if (!proofCapture) {
          sendJson(res, 400, { error: "This installed Pro package does not support evidence capture yet." });
          return;
        }
        if (proofCapture.state === "error") {
          sendJson(res, 400, { error: proofCapture.error || "Failed to capture the evidence note." });
          return;
        }

        updateLiveSessionFromManualNote({
          liveSession,
          workbench,
          payload: body,
          note: proofCapture
        });
        sendJson(res, 200, {
          ok: proofCapture.state === "captured",
          statusMessage: text.noteSaved,
          log: proofCapture.evidencePath
            ? `${text.evidenceLabel}:\n${proofCapture.evidencePath}`
            : "",
          proofCapture,
          ...buildLiveWorkbenchPayload(workbench, liveSession, locale),
          workbench: stripServerOnlyFields(workbench)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/capture-note-rerun") {
        const body = await parseRequestBody(req);
        if (!hasManualNoteInput(body)) {
          sendJson(res, 400, { error: text.visibleNeedsEvidence });
          return;
        }
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const proofCapture = await captureManualEvidenceNote({
          repoRoot,
          workbench,
          liveSession,
          payload: body
        });

        if (!proofCapture) {
          sendJson(res, 400, { error: "This installed Pro package does not support evidence capture yet." });
          return;
        }
        if (proofCapture.state === "error") {
          sendJson(res, 400, { error: proofCapture.error || "Failed to capture the evidence note." });
          return;
        }

        updateLiveSessionFromManualNote({
          liveSession,
          workbench,
          payload: body,
          note: proofCapture
        });
        const refreshed = await rerunLiveWorkbenchAnswer({
          repoRoot,
          config,
          locale,
          liveSession
        });
        sendJson(res, 200, {
          ok: true,
          statusMessage: text.noteSavedAndRerun,
          log: [
            proofCapture.evidencePath ? `${text.evidenceLabel}:\n${proofCapture.evidencePath}` : "",
            `${text.refreshLogPrefix}\n${text.nextCommandLabel}: ${refreshed.nextAction?.command || refreshed.nextAction?.label || "none"}`
          ].filter(Boolean).join("\n\n"),
          proofCapture,
          ...buildLiveWorkbenchPayload(refreshed, liveSession, locale),
          workbench: stripServerOnlyFields(refreshed)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/complete-visible") {
        const body = await parseRequestBody(req);
        if (!hasManualNoteInput(body)) {
          sendJson(res, 400, { error: text.visibleNeedsEvidence });
          return;
        }
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const currentLoop = summarizeCurrentLoop(workbench);
        const visualVerification = summarizeVisualVerification(workbench);
        if (!currentLoop?.isVisible && !visualVerification) {
          sendJson(res, 400, { error: "No visible verification loop is available right now." });
          return;
        }

        const proofCapture = await captureManualEvidenceNote({
          repoRoot,
          workbench,
          liveSession,
          payload: {
            ...body,
            outcome: body.outcome || "observed"
          }
        });

        if (!proofCapture) {
          sendJson(res, 400, { error: "This installed Pro package does not support evidence capture yet." });
          return;
        }
        if (proofCapture.state === "error") {
          sendJson(res, 400, { error: proofCapture.error || "Failed to capture the visible verification note." });
          return;
        }

        updateLiveSessionFromManualNote({
          liveSession,
          workbench,
          payload: body,
          note: proofCapture
        });
        const refreshed = await rerunLiveWorkbenchAnswer({
          repoRoot,
          config,
          locale,
          liveSession
        });
        sendJson(res, 200, {
          ok: true,
          statusMessage: text.visibleDone,
          log: [
            proofCapture.evidencePath ? `${text.evidenceLabel}:\n${proofCapture.evidencePath}` : "",
            `${text.refreshLogPrefix}\n${text.nextCommandLabel}: ${refreshed.nextAction?.command || refreshed.nextAction?.label || "none"}`
          ].filter(Boolean).join("\n\n"),
          proofCapture,
          ...buildLiveWorkbenchPayload(refreshed, liveSession, locale),
          workbench: stripServerOnlyFields(refreshed)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/export-handoff") {
        const workbench = await buildCurrentWorkbench({ repoRoot, config, locale });
        const handoffBundle = writeHandoffBundle({
          repoRoot,
          workbench,
          liveSession,
          locale
        });
        liveSession.lastHandoffBundle = handoffBundle;
        sendJson(res, 200, {
          ok: true,
          statusMessage: `${text.handoffBundleDone} ${handoffBundle.directory}`,
          log: [
            `${text.handoffBundleSaved}: ${handoffBundle.directory}`,
            `${text.handoffBundleFiles}:`,
            ...handoffBundle.files.map(filePath => `- ${filePath}`)
          ].join("\n"),
          handoffBundle: summarizeHandoffBundle(handoffBundle),
          ...buildLiveWorkbenchPayload(workbench, liveSession, locale),
          workbench: stripServerOnlyFields(workbench)
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/__agent_guardrails__/workbench/record-outcome") {
        const body = await parseRequestBody(req);
        const outcome = String(body.outcome || "").trim().toLowerCase();
        if (!["succeeded", "failed"].includes(outcome)) {
          sendJson(res, 400, { error: "Outcome must be succeeded or failed." });
          return;
        }
        if (!liveSession.lastProofRun?.command) {
          sendJson(res, 400, { error: "Run the next proof first so the workbench knows which proof to record." });
          return;
        }

        const proofOutcome = await recordLiveProofOutcome({
          repoRoot,
          liveSession,
          outcome,
          reason: outcome === "succeeded"
            ? "The operator confirmed that the live workbench proof helped after the refreshed answer."
            : "The operator confirmed that the live workbench proof did not help after the refreshed answer."
        });

        if (!proofOutcome) {
          sendJson(res, 400, { error: "This installed Pro package does not support recording proof outcomes yet." });
          return;
        }

        if (proofOutcome.state === "error") {
          sendJson(res, 400, { error: proofOutcome.error || "Failed to record the proof outcome." });
          return;
        }

        const refreshed = await buildCurrentWorkbench({ repoRoot, config, locale });
        liveSession.lastProofRun = {
          ...liveSession.lastProofRun,
          recordedOutcome: outcome
        };
        sendJson(res, 200, {
          ok: proofOutcome.state === "recorded",
          statusMessage: outcome === "succeeded"
            ? text.recordedHelped
            : text.recordedFailed,
          log: liveSession.lastProofRun?.evidencePaths?.length
            ? `${text.evidenceLabel}:\n${liveSession.lastProofRun.evidencePaths.join("\n")}`
            : "",
          proofOutcome,
          ...buildLiveWorkbenchPayload(refreshed, liveSession, locale),
          workbench: stripServerOnlyFields(refreshed)
        });
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    })().catch((error) => {
      sendJson(res, 500, {
        error: error?.message || "Live workbench request failed."
      });
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const liveUrl = `http://127.0.0.1:${port}/`;
  return { server, liveUrl };
}

function printWorkbench(workbench) {
  console.log("Agent Guardrails Pro");
  console.log(`- Operator workbench: ${workbench?.state || "unavailable"}`);

  if (workbench?.panel && !workbench?.nativePanelRendered) {
    console.log("");
    console.log(renderWorkbenchPanelText(workbench.panel));
    console.log("");
  }

  if (workbench?.nativePanelRendered) {
    console.log("- Native panel renderer: rendered");
  } else if (workbench?.nativePanelError) {
    console.log(`- Native panel renderer: unavailable (${workbench.nativePanelError})`);
  }

  if (workbench?.viewPath) {
    console.log(`- Local view contract: ${workbench.viewPath}`);
  }

  if (workbench?.panelPath) {
    console.log(`- Local native panel model: ${workbench.panelPath}`);
  }

  if (workbench?.outputPath) {
    console.log(`- Local HTML: ${workbench.outputPath}`);
  }

  if (workbench?.statePath) {
    console.log(`- Local JSON: ${workbench.statePath}`);
  }

  if (workbench?.liveUrl) {
    console.log(`- Live URL: ${workbench.liveUrl}`);
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

  if (activation.error === "PRO_DEVICE_LIMIT_REACHED" || activation.instanceLimit != null) {
    const activeCount = activation.activeInstanceCount ?? activation.activeDeviceCount ?? activation.activeDevices;
    const limit = activation.instanceLimit ?? activation.deviceLimit;
    if (limit != null) {
      const usage = activeCount != null ? `${activeCount}/${limit}` : String(limit);
      console.log(`- Device limit: ${usage} active devices`);
    }
    const currentDevice = activation.instanceId || activation.instanceName;
    if (currentDevice) {
      console.log(`- Current device: ${currentDevice}`);
    }
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
  const resolvedLocale = flags.lang || locale;
  const workbench = await buildCurrentWorkbench({
    repoRoot,
    config,
    locale: resolvedLocale
  });

  const view = resolveWorkbenchView(workbench);
  if (view) {
    workbench.viewPath = writeWorkbenchView(repoRoot, view);
    const panel = buildWorkbenchPanelModel(view, { locale: resolvedLocale });
    if (panel) {
      workbench.panel = panel;
      workbench.panelPath = writeWorkbenchPanel(repoRoot, panel);
    }
  }

  if (workbench.html && !view) {
    workbench.outputPath = writeWorkbenchHtml(repoRoot, workbench.html);
  }

  if ((flags["native-panel"] || flags.native) && workbench.panelPath && !flags.json) {
    try {
      await renderNativeWorkbenchPanel(workbench.panelPath);
      workbench.nativePanelRendered = true;
    } catch (error) {
      workbench.nativePanelError = error?.message || "Rust native panel renderer failed";
    }
  }

  if (flags.live || (flags.open && view)) {
    const live = await startLiveWorkbenchServer({ repoRoot, config, locale: resolvedLocale });
    workbench.liveServer = live.server;
    workbench.liveUrl = live.liveUrl;
    if (flags.open) {
      openLocalFile(workbench.liveUrl);
      workbench.opened = true;
    }
  } else if (flags.open && workbench.outputPath) {
    openLocalFile(workbench.outputPath);
    workbench.opened = true;
  }

  if (flags.json) {
    console.log(JSON.stringify(stripServerOnlyFields(workbench), null, 2));
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
  const instanceId = flags["instance-id"] || flags.instanceId || "";
  const activation = await buildOssProActivation({
    repoRoot,
    config,
    locale: flags.lang || locale,
    licenseKey,
    instanceName,
    instanceId
  });

  activation.configUpdated = false;

  if (flags.json) {
    console.log(JSON.stringify(activation, null, 2));
    return activation;
  }

  printActivation(activation);
  return activation;
}
