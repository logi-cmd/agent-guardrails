import fs from "node:fs";
import path from "node:path";
import { executeCheck } from "../commands/check.js";
import { createTranslator } from "../i18n.js";
import {
  finishAgentNativeLoop,
  startAgentNativeLoop
} from "../runtime/agent-loop.js";
import {
  bootstrapTaskSession,
  readRepoGuardrails,
  summarizeReviewRisks
} from "../runtime/service.js";
import {
  parseRoughIntent,
  generateSuggestionText
} from "../rough-intent/index.js";
import { isDaemonRunning, getDaemonConfig } from "../commands/daemon.js";
import { generateChangeExplanation, generateArchaeologyNote } from "../chat/change-explainer.js";
import { loadArchaeology } from "../chat/archaeology-store.js";

const PROTOCOL_VERSION = "2024-11-05";

const TOOL_DEFINITIONS = [
  {
    name: "read_repo_guardrails",
    description: "Call this FIRST when starting work in a repo. Reads repo guardrail config, allowed paths, protected paths, and policy summary. Use before planning any changes.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." }
      },
      additionalProperties: false
    }
  },
  {
    name: "suggest_task_contract",
    description: "Bootstrap a task contract and runtime session from a natural-language task request.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        taskRequest: { type: "string", description: "Natural-language task description." },
        selectedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Optional selected files relevant to the task."
        },
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Optional already-known changed files for the task."
        },
        overrides: {
          type: "object",
          description: "Optional contract overrides using the same keys as CLI flags.",
          additionalProperties: true
        }
      },
      required: ["taskRequest"],
      additionalProperties: false
    }
  },
  {
    name: "start_agent_native_loop",
    description: "Call this when beginning a task. Creates a bounded task contract from the user's request, writes it to disk, and seeds evidence files. Returns contract details with initial guardrail status. MUST call this before making any code changes.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        taskRequest: { type: "string", description: "Natural-language task description." },
        selectedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Optional selected files relevant to the task."
        },
        changedFiles: {
          type: "array",
          items: { type: "string" },
          description: "Optional already-known changed files for the task."
        },
        overrides: {
          type: "object",
          description: "Optional contract overrides using the same keys as CLI flags.",
          additionalProperties: true
        },
        contractPath: {
          type: "string",
          description: "Optional custom task contract path to write."
        },
        writeFiles: {
          type: "boolean",
          description: "Whether to write the task contract and starter evidence files."
        }
      },
      required: ["taskRequest"],
      additionalProperties: false
    }
  },
  {
    name: "check_after_edit",
    description: "REQUIRED: Call this IMMEDIATELY after EVERY file edit (Write, Edit, MultiEdit). Returns lightweight status + any guardrail violations found. Uses daemon cache for speed (< 2s). DO NOT proceed with more edits until you see the result.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." }
      },
      additionalProperties: false
    }
  },
  {
    name: "finish_agent_native_loop",
    description: "Call this when task is COMPLETE. Runs final guardrail check, writes evidence, and returns a reviewer-friendly summary with scope, risk, and next actions. MUST call this before telling the user the task is done.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        contractPath: { type: "string", description: "Optional custom task contract path." },
        baseRef: { type: "string", description: "Optional git base ref for diff-based checks." },
        commandsRun: {
          type: "array",
          items: { type: "string" },
          description: "Commands that actually ran for the task."
        },
        evidence: {
          type: "object",
          description: "Optional evidence payload to write before finishing the loop.",
          properties: {
            task: { type: "string" },
            commandsRun: {
              type: "array",
              items: { type: "string" }
            },
            notableResults: {
              type: "array",
              items: { type: "string" }
            },
            reviewNotes: {
              type: "array",
              items: { type: "string" }
            },
            residualRisk: { type: "string" }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "run_guardrail_check",
    description: "Run a full guardrail check. Use when you need detailed check results (e.g., before commit, or when check_after_edit reports warnings). Returns all findings with file-level details.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        baseRef: { type: "string", description: "Optional git base ref for diff-based check." },
        commandsRun: {
          type: "array",
          items: { type: "string" },
          description: "Commands that actually ran for the task."
        },
        contractPath: { type: "string", description: "Optional custom task contract path." },
        review: { type: "boolean", description: "Set true for reviewer-oriented summary." }
      },
      additionalProperties: false
    }
  },
  {
    name: "summarize_review_risks",
    description: "Summarize a guardrail check result into status, top risks, and next actions. Call after run_guardrail_check when you need a concise risk summary.",
    inputSchema: {
      type: "object",
      properties: {
        checkResult: {
          type: "object",
          description: "Structured result from run_guardrail_check or check --json.",
          additionalProperties: true
        }
      },
      required: ["checkResult"],
      additionalProperties: false
    }
  },
  {
    name: "plan_rough_intent",
    description: "Call this when the user provides a vague or imprecise task description. Parses the intent and suggests a concrete task contract with scope, test commands, and risk level.",
    inputSchema: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "The rough task description in natural language (can be vague or fuzzy)."
        },
        repoRoot: {
          type: "string",
          description: "Absolute path to the repository root."
        },
        mode: {
          type: "string",
          enum: ["suggest", "auto", "strict"],
          description: "suggest = return suggestion for confirmation, auto = auto-accept if confidence >= 0.6, strict = always require confirmation"
        },
        locale: {
          type: "string",
          enum: ["en", "zh-CN"],
          description: "Language for the response text."
        }
      },
      required: ["task"],
      additionalProperties: false
    }
  },
  {
    name: "read_daemon_status",
    description: "Check if the guardrails daemon is running and get its latest check result. Use when you want to know background check status without triggering a new check.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: {
          type: "string",
          description: "Absolute path to the repository root."
        }
      },
      additionalProperties: false
    }
  },
  {
    name: "explain_change",
    description: "Generate a human-readable explanation of what was changed and why. Call after finishing edits to get a change summary for the user.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        locale: { type: "string", enum: ["en", "zh-CN"], description: "Language for the explanation text." }
      },
      required: ["repoRoot"],
      additionalProperties: false
    }
  },
  {
    name: "query_archaeology",
    description: "Query code archaeology notes to understand why code exists. Use when you need historical context about past changes before modifying unfamiliar code.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        sessionId: { type: "string", description: "Optional session ID to query archaeology for a specific session." }
      },
      required: ["repoRoot"],
      additionalProperties: false
    }
  }
];

function encodeMessage(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, payload]);
}

function createJsonResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

function createHumanReadableJsonResult(data, humanSummary) {
  return {
    content: [
      {
        type: "text",
        text: humanSummary
      },
      {
        type: "text",
        text: JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
}

function createError(code, message, data = undefined) {
  return { code, message, ...(data === undefined ? {} : { data }) };
}

function toFlagValue(items = []) {
  return items.map((item) => String(item).trim()).filter(Boolean).join(",");
}

async function callTool(name, args, defaultRepoRoot) {
  if (name === "read_repo_guardrails") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const result = readRepoGuardrails(repoRoot);
    if (!result) {
      throw createError(-32010, "Missing .agent-guardrails/config.json in the requested repo.");
    }
    return createJsonResult(result);
  }

  if (name === "suggest_task_contract") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const taskRequest = String(args.taskRequest || "").trim();
    if (!taskRequest) {
      throw createError(-32602, "taskRequest is required.");
    }

    const overrides = { ...(args.overrides ?? {}), task: taskRequest };
    const result = bootstrapTaskSession({
      repoRoot,
      flags: overrides,
      selectedFiles: Array.isArray(args.selectedFiles) ? args.selectedFiles : [],
      changedFiles: Array.isArray(args.changedFiles) ? args.changedFiles : []
    });

    if (!result) {
      throw createError(-32010, "Missing task contract for the requested repo.");
    }

    return createJsonResult(result);
  }

  if (name === "start_agent_native_loop") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const taskRequest = String(args.taskRequest || "").trim();
    if (!taskRequest) {
      throw createError(-32602, "taskRequest is required.");
    }

    const result = startAgentNativeLoop({
      repoRoot,
      taskRequest,
      selectedFiles: Array.isArray(args.selectedFiles) ? args.selectedFiles : [],
      changedFiles: Array.isArray(args.changedFiles) ? args.changedFiles : [],
      overrides: args.overrides ?? {},
      contractPath: args.contractPath ? String(args.contractPath) : undefined,
      writeFiles: args.writeFiles !== false,
      locale: "en"
    });

    if (!result) {
      throw createError(-32010, "Missing .agent-guardrails/config.json in the requested repo.");
    }

    const contract = result.contract || {};
    const session = result.session || {};
    const loop = result.loop || {};
    const guardrails = result.guardrails || {};
    const policy = guardrails.policy || {};
    const lines = [];
    lines.push(`✅ **Task bootstrapped:** "${taskRequest}"`);
    lines.push(`📋 **Contract:** ${contract.task || taskRequest}`);
    if (contract.allowedPaths && contract.allowedPaths.length > 0) {
      lines.push(`📂 **Allowed paths:** ${contract.allowedPaths.join(", ")}`);
    }
    if (contract.intendedFiles && contract.intendedFiles.length > 0) {
      lines.push(`🎯 **Intended files:** ${contract.intendedFiles.join(", ")}`);
    }
    if (contract.riskLevel) {
      lines.push(`⚠️ **Risk level:** ${contract.riskLevel}`);
    }
    if (contract.requiredCommands && contract.requiredCommands.length > 0) {
      lines.push(`🔧 **Required commands:** ${contract.requiredCommands.join(", ")}`);
    }
    if (policy.maxChangedFilesPerTask) {
      lines.push(`📏 **Max changed files:** ${policy.maxChangedFilesPerTask}`);
    }
    if (loop.nextActions && loop.nextActions.length > 0) {
      lines.push(`📝 **Next actions:**`);
      for (const action of loop.nextActions.slice(0, 5)) {
        lines.push(`  - ${action}`);
      }
    }
    lines.push(`🔄 **Loop status:** ${loop.status || "bootstrapped"}`);
    lines.push(``);
    lines.push(`⚠️ **IMPORTANT:** After EVERY file edit, call \`check_after_edit\` to verify changes stay within scope. Before telling the user the task is done, call \`finish_agent_native_loop\`.`);

    const humanSummary = lines.join("\n");
    return createHumanReadableJsonResult(result, humanSummary);
  }

  if (name === "check_after_edit") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const cachePath = path.join(repoRoot, ".agent-guardrails", "daemon-result.json");
    let cacheData = null;
    let cacheAge = null;
    const MAX_CACHE_AGE_MS = 30_000;

    try {
      if (fs.existsSync(cachePath)) {
        const raw = fs.readFileSync(cachePath, "utf8");
        cacheData = JSON.parse(raw);
        if (cacheData && cacheData.timestamp) {
          cacheAge = Date.now() - cacheData.timestamp;
        }
      }
    } catch { /* ignore */ }

    const freshCache = cacheAge !== null && cacheAge < MAX_CACHE_AGE_MS;
    let data;
    let humanSummary;

    if (freshCache && cacheData) {
      const findings = Array.isArray(cacheData.findings) ? cacheData.findings : [];
      const errors = findings.filter(f => f && (f.severity === "error" || f.severity === "high"));
      const warnings = findings.filter(f => f && f.severity === "warning");
      const newFindings = findings.map(f => ({
        severity: f.severity || "info",
        rule: f.rule || f.id || "unknown",
        message: f.message || f.description || ""
      }));

      if (errors.length > 0) {
        const lns = [];
        lns.push("❌ Issues detected — fix before proceeding.");
        lns.push("");
        lns.push(`📊 Findings: ${errors.length} error${errors.length !== 1 ? "s" : ""}, ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`);
        lns.push("❌ Errors:");
        for (const e of errors.slice(0, 5)) {
          lns.push(`  - ${e.rule || e.id || "unknown"}: ${e.message || e.description || ""}`);
        }
        if (warnings.length > 0) {
          lns.push("⚠️ Warnings:");
          for (const w of warnings.slice(0, 5)) {
            lns.push(`  - ${w.rule || w.id || "unknown"}: ${w.message || w.description || ""}`);
          }
        }
        lns.push("");
        lns.push("🏃 Fix these issues before continuing with more edits.");

        data = { status: "issues", newFindings, cacheAge: Math.round(cacheAge / 1000) };
        humanSummary = lns.join("\n");
      } else {
        const lns = [];
        lns.push("✅ All clear — no guardrail violations found.");
        lns.push("");
        lns.push(`📊 Findings: ${errors.length} errors, ${warnings.length} warnings`);
        lns.push("📂 Scope: all changes within allowed paths");
        lns.push(`⏱️ Cache: fresh (${Math.round(cacheAge / 1000)}s ago)`);

        data = { status: "clean", newFindings, cacheAge: Math.round(cacheAge / 1000) };
        humanSummary = lns.join("\n");
      }
    } else {
      const result = await executeCheck({ repoRoot, flags: {}, locale: "en", suppressExitCode: true });
      const findings = Array.isArray(result?.findings) ? result.findings : [];
      const errors = findings.filter(f => f && (f.severity === "error" || f.severity === "high"));
      const warnings = findings.filter(f => f && f.severity === "warning");
      const newFindings = findings.map(f => ({
        severity: f.severity || "info",
        rule: f.rule || f.id || "unknown",
        message: f.message || f.description || ""
      }));

      if (errors.length > 0) {
        const lns = [];
        lns.push("❌ Issues detected — fix before proceeding.");
        lns.push("");
        lns.push(`📊 Findings: ${errors.length} error${errors.length !== 1 ? "s" : ""}, ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`);
        lns.push("❌ Errors:");
        for (const e of errors.slice(0, 5)) {
          lns.push(`  - ${e.rule || e.id || "unknown"}: ${e.message || e.description || ""}`);
        }
        if (warnings.length > 0) {
          lns.push("⚠️ Warnings:");
          for (const w of warnings.slice(0, 5)) {
            lns.push(`  - ${w.rule || w.id || "unknown"}: ${w.message || w.description || ""}`);
          }
        }
        lns.push("");
        lns.push("🏃 Fix these issues before continuing with more edits.");

        data = { status: "issues", newFindings, cacheAge: null };
        humanSummary = lns.join("\n");
      } else {
        const lns = [];
        lns.push("⚠️ No fresh daemon cache available — ran lightweight check.");
        lns.push("");
        lns.push(`📊 Findings: ${errors.length} errors, ${warnings.length} warnings`);
        lns.push("ℹ️ Tip: Start daemon with `agent-guardrails start` for instant post-edit feedback.");

        data = { status: cacheData ? "stale" : "no_config", newFindings, cacheAge: null };
        humanSummary = lns.join("\n");
      }
    }

    return createHumanReadableJsonResult(data, humanSummary);
  }

  if (name === "finish_agent_native_loop") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const result = await finishAgentNativeLoop({
      repoRoot,
      contractPath: args.contractPath ? String(args.contractPath) : undefined,
      baseRef: args.baseRef ? String(args.baseRef) : "",
      commandsRun: Array.isArray(args.commandsRun) ? args.commandsRun : [],
      evidence: args.evidence && typeof args.evidence === "object" ? args.evidence : null,
      locale: "en"
    });

    if (!result) {
      throw createError(-32010, "Missing task contract for the requested repo.");
    }

    const summary = result.reviewerSummary || {};
    const verdict = summary.verdict || "Unknown";
    const status = summary.status || "unknown";
    const verdictIcon = status === "pass" ? "✅" : "❌";
    const lines = [];
    lines.push(`${verdictIcon} Task Complete — Verdict: ${verdict}`);
    lines.push("");
    lines.push(`📊 Status: ${status}`);

    const topRisks = Array.isArray(summary.topRisks) ? summary.topRisks.slice(0, 5) : [];
    if (topRisks.length > 0) {
      lines.push("⚠️ Top risks:");
      for (const risk of topRisks) {
        lines.push(`  - ${risk}`);
      }
    } else {
      lines.push("⚠️ Top risks: (none)");
    }

    const maintRisks = summary.futureMaintenanceRisks;
    if (maintRisks && typeof maintRisks === "string" && maintRisks.trim()) {
      lines.push("");
      lines.push("⚠️ Maintenance risks:");
      lines.push(`  - ${maintRisks}`);
    } else if (Array.isArray(maintRisks) && maintRisks.length > 0) {
      lines.push("");
      lines.push("⚠️ Maintenance risks:");
      for (const r of maintRisks) {
        lines.push(`  - ${r}`);
      }
    }

    const nextActions = Array.isArray(summary.nextActions) ? summary.nextActions : [];
    lines.push("");
    lines.push("🏃 Next steps:");
    if (nextActions.length > 0) {
      for (const action of nextActions) {
        lines.push(`  - ${action}`);
      }
    } else {
      lines.push("  - All checks passed");
    }

    if (summary.deployReadiness) {
      lines.push("");
      lines.push(`🚀 Deploy readiness: ${summary.deployReadiness}`);
    }

    const humanSummary = lines.join("\n");
    return createHumanReadableJsonResult(result, humanSummary);
  }

  if (name === "run_guardrail_check") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const flags = {};

    if (args.baseRef) {
      flags["base-ref"] = String(args.baseRef);
    }
    if (args.contractPath) {
      flags["contract-path"] = String(args.contractPath);
    }
    if (Array.isArray(args.commandsRun) && args.commandsRun.length > 0) {
      flags["commands-run"] = toFlagValue(args.commandsRun);
    }
    if (args.review === true) {
      flags.review = true;
    }

    const result = await executeCheck({
      repoRoot,
      flags,
      locale: "en",
      suppressExitCode: true
    });

    return createJsonResult(result);
  }

  if (name === "summarize_review_risks") {
    const checkResult = args.checkResult;
    if (!checkResult || typeof checkResult !== "object") {
      throw createError(-32602, "checkResult is required.");
    }

    return createJsonResult(summarizeReviewRisks(checkResult));
  }

  if (name === "plan_rough_intent") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const task = String(args.task || "").trim();
    const mode = args.mode || "suggest";
    const locale = args.locale || "en";
    const t = createTranslator(locale).t;

    if (!task) {
      throw createError(-32602, "task is required.");
    }

    const fileTree = [];
    function walkDir(dir, base = '') {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const fullPath = path.join(dir, entry.name);
          const relativePath = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            walkDir(fullPath, relativePath);
          } else {
            fileTree.push(relativePath);
          }
        }
      } catch {
        // ignore
      }
    }
    walkDir(repoRoot);

    let packageJson = null;
    try {
      const pkgPath = path.join(repoRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      }
    } catch {
      // ignore
    }

    const parsed = parseRoughIntent(task, { fileTree, packageJson, files: fileTree, repoRoot });
    const suggestionText = generateSuggestionText(parsed, locale);

    if (mode === "auto" && parsed.confidence >= 0.6) {
      return createJsonResult({
        status: "auto_accepted",
        confidence: parsed.confidence,
        contract: {
          task: parsed.task,
          taskType: parsed.taskType,
          allowedPaths: parsed.inferred.allowedPaths,
          requiredCommands: parsed.inferred.requiredCommands,
          riskLevel: parsed.inferred.riskLevel,
          guardRules: parsed.inferred.guardRules,
          evidencePath: parsed.inferred.evidencePath
        },
        message: t("roughIntent.autoAccepted", { confidence: (parsed.confidence * 100).toFixed(0) })
      });
    }

    return createJsonResult({
      status: "suggestion",
      task: parsed.task,
      taskType: parsed.taskType,
      confidence: parsed.confidence,
      inferred: {
        allowedPaths: parsed.inferred.allowedPaths,
        requiredCommands: parsed.inferred.requiredCommands,
        riskLevel: parsed.inferred.riskLevel,
        guardRules: parsed.inferred.guardRules,
        evidencePath: parsed.inferred.evidencePath
      },
      sources: parsed.sources,
      display: suggestionText,
      actions: [
        { type: "accept", label: suggestionText.actions.confirm },
        { type: "modify", label: suggestionText.actions.modify },
        { type: "reject", label: suggestionText.actions.cancel }
      ],
      message: t("roughIntent.detectedTask", { taskType: parsed.taskType, confidence: (parsed.confidence * 100).toFixed(0) })
    });
  }

  if (name === "read_daemon_status") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const { isDaemonRunning, getDaemonConfig } = await import("../commands/daemon.js");
    const status = isDaemonRunning(repoRoot);
    const config = getDaemonConfig(repoRoot);

    const resultPath = path.join(repoRoot, ".agent-guardrails", "daemon-result.json");
    let lastResult = null;
    try {
      if (fs.existsSync(resultPath)) {
        lastResult = JSON.parse(fs.readFileSync(resultPath, "utf8"));
      }
    } catch { /* ignore */ }

    return createJsonResult({
      running: status.running,
      pid: status.pid || null,
      startTime: status.startTime || null,
      checksRun: status.checksRun || 0,
      lastCheck: status.lastCheck || null,
      config: {
        watchPaths: config.watchPaths,
        checkInterval: config.checkInterval,
        blockOnHighRisk: config.blockOnHighRisk
      },
      lastResult
    });
  }

  if (name === "explain_change") {
    const { generateChangeExplanation, generateArchaeologyNote } = await import("../chat/change-explainer.js");
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const locale = args.locale || "en";

    const sessionResult = bootstrapTaskSession({ repoRoot, flags: {}, locale });
    const changedFiles = sessionResult?.session?.changedFiles || [];
    const taskContract = sessionResult?.session?.taskContract || {};

    const explanation = generateChangeExplanation({
      changedFiles: changedFiles.map(f => typeof f === "string" ? { path: f, type: "unknown" } : f),
      taskContract,
      findings: [],
      locale,
      repoRoot
    });

    const archaeologyNote = generateArchaeologyNote({
      changedFiles: changedFiles.map(f => typeof f === "string" ? { path: f, type: "unknown" } : f),
      taskContract,
      sessionId: taskContract.session?.sessionId,
      repoRoot
    });

    if (explanation && typeof explanation === "object" && explanation.summary) {
      return createJsonResult({
        summary: explanation.summary,
        files: explanation.files,
        categories: explanation.categories,
        riskIndicators: explanation.riskIndicators,
        fileCount: changedFiles.length,
        task: taskContract.task || "",
        archaeology: archaeologyNote
      });
    }

    return createJsonResult({
      explanation: explanation || "No changes detected.",
      fileCount: changedFiles.length,
      task: taskContract.task || ""
    });
  }

  if (name === "query_archaeology") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const { loadArchaeology } = await import("../chat/archaeology-store.js");
    const sessionId = args.sessionId || null;

    const { notes, noteCount } = loadArchaeology(repoRoot);

    return createJsonResult({
      sessionId,
      notes,
      noteCount
    });
  }

  throw createError(-32601, `Unknown tool "${name}".`);
}

export { callTool };


async function handleMessage(message, context) {
  if (message.method === "initialize") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: "agent-guardrails-mcp",
          version: "0.1.0"
        }
      }
    };
  }

  if (message.method === "ping") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {}
    };
  }

  if (message.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: message.id,
      result: {
        tools: TOOL_DEFINITIONS
      }
    };
  }

  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const name = String(params.name || "").trim();
    const args = params.arguments ?? {};
    const result = await callTool(name, args, context.repoRoot);
    return {
      jsonrpc: "2.0",
      id: message.id,
      result
    };
  }

  if (message.method === "notifications/initialized") {
    return null;
  }

  if (message.id !== undefined) {
    return {
      jsonrpc: "2.0",
      id: message.id,
      error: createError(-32601, `Method "${message.method}" not found.`)
    };
  }

  return null;
}

export async function startMcpServer({
  input = process.stdin,
  output = process.stdout,
  errorOutput = process.stderr,
  repoRoot = process.cwd()
} = {}) {
  const context = { repoRoot };
  let buffer = Buffer.alloc(0);

  input.on("data", async (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        break;
      }

      const headerText = buffer.slice(0, headerEnd).toString("utf8");
      const contentLengthLine = headerText
        .split("\r\n")
        .find((line) => /^Content-Length:/i.test(line));

      if (!contentLengthLine) {
        errorOutput.write("agent-guardrails-mcp: Missing Content-Length header.\n");
        buffer = Buffer.alloc(0);
        break;
      }

      const contentLength = Number(contentLengthLine.split(":")[1]?.trim() ?? "");
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (!Number.isFinite(contentLength) || contentLength < 0) {
        errorOutput.write("agent-guardrails-mcp: Invalid Content-Length header.\n");
        buffer = Buffer.alloc(0);
        break;
      }

      if (buffer.length < messageEnd) {
        break;
      }

      const payload = buffer.slice(messageStart, messageEnd).toString("utf8");
      buffer = buffer.slice(messageEnd);

      let message;
      try {
        message = JSON.parse(payload);
      } catch (parseError) {
        const response = {
          jsonrpc: "2.0",
          id: null,
          error: createError(-32700, "Parse error")
        };
        output.write(encodeMessage(response));
        continue;
      }

      try {
        const response = await handleMessage(message, context);
        if (response) {
          output.write(encodeMessage(response));
        }
      } catch (toolError) {
        const error = toolError?.code
          ? toolError
          : createError(-32603, toolError instanceof Error ? toolError.message : String(toolError));

        if (message.id !== undefined) {
          output.write(
            encodeMessage({
              jsonrpc: "2.0",
              id: message.id ?? null,
              error
            })
          );
        }
      }
    }
  });

  return new Promise((resolve) => {
    input.on("end", resolve);
    input.on("close", resolve);
  });
}

