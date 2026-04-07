/**
 * Human-output formatter — turns structured check / review / session
 * results into user-friendly, non-jargon text suitable for chat tools
 * and desktop apps.
 *
 * Supports en and zh-CN via the project i18n system.
 */

import { createTranslator } from "../i18n.js";

// ---- verdict formatting ----

function formatVerdictEn(verdict) {
  const map = {
    pass: "✅ Check passed — safe to merge.",
    fail: "❌ Check failed — do not merge yet.",
    warn: "⚠️ Check passed with warnings — review recommended.",
    unknown: "ℹ️ Could not determine a verdict."
  };
  return map[verdict] || map.unknown;
}

function formatVerdictZh(verdict) {
  const map = {
    pass: "✅ 检查通过，可以安全合并。",
    fail: "❌ 检查未通过，请勿合并。",
    warn: "⚠️ 检查通过但有警告，建议人工复查。",
    unknown: "ℹ️ 无法判定结果。"
  };
  return map[verdict] || map.unknown;
}

// ---- scope / risk detail ----

function formatScopeEn(scope) {
  if (!scope) return "";
  const lines = [];
  if (scope.changedFiles) {
    lines.push(`Files changed: ${scope.changedFiles.join(", ")}`);
  }
  if (scope.intendedFiles) {
    lines.push(`Expected files: ${Array.isArray(scope.intendedFiles) ? scope.intendedFiles.join(", ") : scope.intendedFiles}`);
  }
  if (scope.violations && scope.violations.length > 0) {
    lines.push(`⚠️ Out-of-scope files: ${scope.violations.join(", ")}`);
  }
  return lines.join("\n");
}

function formatScopeZh(scope) {
  if (!scope) return "";
  const lines = [];
  if (scope.changedFiles) {
    lines.push(`改动文件：${scope.changedFiles.join("、")}`);
  }
  if (scope.intendedFiles) {
    lines.push(`预期文件：${Array.isArray(scope.intendedFiles) ? scope.intendedFiles.join("、") : scope.intendedFiles}`);
  }
  if (scope.violations && scope.violations.length > 0) {
    lines.push(`⚠️ 越界文件：${scope.violations.join("、")}`);
  }
  return lines.join("\n");
}

function formatRiskEn(riskLevel) {
  const map = {
    low: "🟢 Risk: low",
    standard: "🟡 Risk: standard",
    medium: "🟠 Risk: medium",
    high: "🔴 Risk: high — manual review recommended",
    critical: "🔴 Risk: critical — do not merge"
  };
  return map[riskLevel] || `Risk: ${riskLevel}`;
}

function formatRiskZh(riskLevel) {
  const map = {
    low: "🟢 风险：低",
    standard: "🟡 风险：一般",
    medium: "🟠 风险：中",
    high: "🔴 风险：高 — 建议人工复查",
    critical: "🔴 风险：严重 — 请勿合并"
  };
  return map[riskLevel] || `风险：${riskLevel}`;
}

// ---- semantic findings ----

function formatFindingsEn(findings, score, scoreVerdict) {
  if (!findings || findings.length === 0) return "";
  const lines = [];
  if (score !== undefined && score !== null) {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    lines.push(`📊 Trust Score: ${"█".repeat(filled)}${"░".repeat(empty)} ${score}/100 (${scoreVerdict || "unknown"})`);
    lines.push("");
  }
  for (const f of findings) {
    const icon = f.severity === "error" ? "❌" : "⚠️";
    const desc = f.message || f.code || "unknown issue";
    const files = f.file ? ` (${f.file})` : "";
    lines.push(`${icon} ${desc}${files}`);
  }
  return lines.join("\n");
}

function formatFindingsZh(findings, score, scoreVerdict) {
  if (!findings || findings.length === 0) return "";
  const lines = [];
  if (score !== undefined && score !== null) {
    const filled = Math.round(score / 10);
    const empty = 10 - filled;
    lines.push(`📊 信任评分: ${"█".repeat(filled)}${"░".repeat(empty)} ${score}/100 (${scoreVerdict || "未知"})`);
    lines.push("");
  }
  for (const f of findings) {
    const icon = f.severity === "error" ? "❌" : "⚠️";
    const desc = f.message || f.code || "未知问题";
    const files = f.file ? `（${f.file}）` : "";
    lines.push(`${icon} ${desc}${files}`);
  }
  return lines.join("\n");
}

// ---- validation ----

function formatValidationEn(validation) {
  if (!validation) return "";
  const lines = [];
  if (validation.commandsRun && validation.commandsRun.length > 0) {
    lines.push(`Commands run: ${validation.commandsRun.join(", ")}`);
  }
  if (validation.testsPassed !== undefined) {
    lines.push(`Tests: ${validation.testsPassed} passed, ${validation.testsFailed || 0} failed`);
  }
  if (validation.missingCommands && validation.missingCommands.length > 0) {
    lines.push(`⚠️ Required commands not run: ${validation.missingCommands.join(", ")}`);
  }
  return lines.join("\n");
}

function formatValidationZh(validation) {
  if (!validation) return "";
  const lines = [];
  if (validation.commandsRun && validation.commandsRun.length > 0) {
    lines.push(`已执行命令：${validation.commandsRun.join("、")}`);
  }
  if (validation.testsPassed !== undefined) {
    lines.push(`测试结果：${validation.testsPassed} 通过，${validation.testsFailed || 0} 失败`);
  }
  if (validation.missingCommands && validation.missingCommands.length > 0) {
    lines.push(`⚠️ 未执行的必要命令：${validation.missingCommands.join("、")}`);
  }
  return lines.join("\n");
}

// ---- next actions ----

function formatNextActionsEn(nextActions) {
  if (!nextActions || nextActions.length === 0) return "";
  const lines = ["Next steps:"];
  for (let i = 0; i < nextActions.length; i++) {
    lines.push(`  ${i + 1}. ${nextActions[i]}`);
  }
  return lines.join("\n");
}

function formatNextActionsZh(nextActions) {
  if (!nextActions || nextActions.length === 0) return "";
  const lines = ["下一步："];
  for (let i = 0; i < nextActions.length; i++) {
    lines.push(`  ${i + 1}. ${nextActions[i]}`);
  }
  return lines.join("\n");
}

// ---- rough-intent suggestion ----

function formatSuggestionEn(result) {
  if (!result) return "";
  const lines = [];
  if (result.display && result.display.title) {
    lines.push(`📋 ${result.display.title}`);
  }
  if (result.taskType) {
    lines.push(`Task type: ${result.taskType} (confidence: ${Math.round((result.confidence || 0) * 100)}%)`);
  }
  if (result.inferred) {
    if (result.inferred.allowedPaths) {
      lines.push(`Suggested scope: ${result.inferred.allowedPaths.join(", ")}`);
    }
    if (result.inferred.requiredCommands) {
      lines.push(`Required commands: ${result.inferred.requiredCommands.join(", ")}`);
    }
    if (result.inferred.riskLevel) {
      lines.push(formatRiskEn(result.inferred.riskLevel));
    }
  }
  if (result.actions && result.actions.length > 0) {
    lines.push(result.actions.map((a) => `  [${a.type}] ${a.label}`).join("\n"));
  }
  return lines.join("\n");
}

function formatSuggestionZh(result) {
  if (!result) return "";
  const lines = [];
  if (result.display && result.display.title) {
    lines.push(`📋 ${result.display.title}`);
  }
  if (result.taskType) {
    lines.push(`任务类型：${result.taskType}（置信度：${Math.round((result.confidence || 0) * 100)}%）`);
  }
  if (result.inferred) {
    if (result.inferred.allowedPaths) {
      lines.push(`建议范围：${result.inferred.allowedPaths.join("、")}`);
    }
    if (result.inferred.requiredCommands) {
      lines.push(`必要命令：${result.inferred.requiredCommands.join("、")}`);
    }
    if (result.inferred.riskLevel) {
      lines.push(formatRiskZh(result.inferred.riskLevel));
    }
  }
  if (result.actions && result.actions.length > 0) {
    lines.push(result.actions.map((a) => `  [${a.type}] ${a.label}`).join("\n"));
  }
  return lines.join("\n");
}

// ---- public formatter ----

/**
 * Format a structured tool result into human-friendly text.
 *
 * @param {string} toolName - MCP tool name that produced the result
 * @param {object} result - structured result from callTool
 * @param {string} [locale="en"]
 * @returns {string}
 */
export function formatHumanOutput(toolName, result, locale = "en") {
  const isZh = locale === "zh-CN";
  const r = (typeof result === "string") ? safeParse(result) : result || {};
  const data = r.structuredContent || r;

  // Welcome / help
  if (!toolName) {
    return isZh
      ? "我是 agent-guardrails 对话助手。你可以问我关于代码安全检查的问题。\n\n试试说：\n  - \"帮我规划一下加个登录功能\"\n  - \"检查一下改动安全吗\"\n  - \"有什么风险\"\n  - \"看看仓库规则\""
      : "I'm the agent-guardrails chat assistant. Ask me about code safety checks.\n\nTry:\n  - \"Plan adding a login feature\"\n  - \"Is this change safe?\"\n  - \"What are the risks?\"\n  - \"Show me the repo rules\"";
  }

  // Errors
  if (r.error || r.code) {
    const msg = r.message || r.error?.message || "Unknown error";
    return isZh ? `❌ 错误：${msg}` : `❌ Error: ${msg}`;
  }

  // Tool-specific formatting
    switch (toolName) {
      case "plan_rough_intent":
        return isZh ? formatSuggestionZh(data) : formatSuggestionEn(data);

      case "explain_change": {
        const explanation = data.explanation || "";
        const task = data.task || "";
        const fileCount = data.fileCount || 0;
        if (isZh) {
          const parts = [`📝 变更解释`];
          if (task) parts.push(`任务：${task}`);
          if (explanation) parts.push(explanation);
          if (fileCount > 0) parts.push(`涉及 ${fileCount} 个文件`);
          return parts.filter(Boolean).join("\n");
        }
        const parts = ["📝 Change Explanation"];
        if (task) parts.push(`Task: ${task}`);
        if (explanation) parts.push(explanation);
        if (fileCount > 0) parts.push(`${fileCount} file(s) affected`);
        return parts.filter(Boolean).join("\n");
      }

      case "query_archaeology": {
        const notes = data.notes || [];
        const noteCount = data.noteCount || 0;
        if (isZh) {
          const parts = ["📚 代码考古记录"];
          if (noteCount > 0) {
            parts.push(`共 ${noteCount} 条记录：`);
            notes.forEach((note, i) => parts.push(`  ${i + 1}. ${note}`));
          } else {
            parts.push("暂无考古记录。");
          }
          return parts.join("\n");
        }
        const parts = ["📚 Code Archaeology"];
        if (noteCount > 0) {
          parts.push(`${noteCount} record(s):`);
          notes.forEach((note, i) => parts.push(`  ${i + 1}. ${note}`));
        } else {
          parts.push("No archaeology records yet.");
        }
        return parts.join("\n");
      }

    case "run_guardrail_check":
    case "finish_agent_native_loop": {
      const verdict = data.verdict || data.trustVerdict;
      const parts = [
        isZh ? formatVerdictZh(verdict) : formatVerdictEn(verdict),
        "",
        isZh ? formatScopeZh(data.scope) : formatScopeEn(data.scope),
        isZh ? formatValidationZh(data.validation) : formatValidationEn(data.validation),
        isZh ? formatFindingsZh(data.findings, data.score, data.scoreVerdict) : formatFindingsEn(data.findings, data.score, data.scoreVerdict),
        isZh ? formatRiskZh(data.riskLevel) : formatRiskEn(data.riskLevel),
        "",
        isZh ? formatNextActionsZh(data.nextActions) : formatNextActionsEn(data.nextActions)
      ];
      return parts.filter(Boolean).join("\n");
    }

    case "summarize_review_risks":
      return isZh
        ? formatSummaryZh(data)
        : formatSummaryEn(data);

    case "read_repo_guardrails":
      return isZh ? formatRepoGuardrailsZh(data) : formatRepoGuardrailsEn(data);

    case "read_daemon_status":
      return isZh ? formatDaemonStatusZh(data) : formatDaemonStatusEn(data);

    case "start_agent_native_loop":
      return isZh
        ? `🚀 任务已启动。\n\n任务描述：${data.task || data.taskRequest || "（未指定）"}\n契约文件：${data.contractPath || "（自动生成）"}\n\n现在可以让 AI 在声明范围内工作，完成后说"做完了"。`
        : `🚀 Task started.\n\nTask: ${data.task || data.taskRequest || "(not specified)"}\nContract: ${data.contractPath || "(auto-generated)"}\n\nLet the AI work within the declared scope, then say "done" to finish.`;

    case "suggest_task_contract":
      return isZh
        ? `📋 任务契约已建议。\n\n任务：${data.task || "（未指定）"}\n范围：${Array.isArray(data.allowedPaths) ? data.allowedPaths.join("、") : "（默认）"}\n\n确认后可说"开始做"。`
        : `📋 Task contract suggested.\n\nTask: ${data.task || "(not specified)"}\nScope: ${Array.isArray(data.allowedPaths) ? data.allowedPaths.join(", ") : "(default)"}\n\nConfirm and say "start" to begin.`;

    default: {
      // Generic JSON fallback
      const text = typeof r === "object" ? JSON.stringify(r, null, 2) : String(r);
      return isZh ? `结果：\n${text}` : `Result:\n${text}`;
    }
  }
}

// ---- helpers ----

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function formatSummaryEn(data) {
  if (!data) return "No summary available.";
  const parts = [];
  if (data.status) parts.push(`Status: ${data.status}`);
  if (data.topRisks && data.topRisks.length > 0) {
    parts.push("Top risks:", ...data.topRisks.map((r) => `  - ${r}`));
  }
  if (data.nextActions && data.nextActions.length > 0) {
    parts.push(formatNextActionsEn(data.nextActions));
  }
  return parts.join("\n");
}

function formatSummaryZh(data) {
  if (!data) return "暂无摘要。";
  const parts = [];
  if (data.status) parts.push(`状态：${data.status}`);
  if (data.topRisks && data.topRisks.length > 0) {
    parts.push("主要风险：", ...data.topRisks.map((r) => `  - ${r}`));
  }
  if (data.nextActions && data.nextActions.length > 0) {
    parts.push(formatNextActionsZh(data.nextActions));
  }
  return parts.join("\n");
}

function formatRepoGuardrailsEn(data) {
  if (!data) return "No guardrails config found.";
  const parts = ["Repo Guardrails:"];
  if (data.preset) parts.push(`  Preset: ${data.preset}`);
  if (data.allowedPaths) parts.push(`  Allowed paths: ${Array.isArray(data.allowedPaths) ? data.allowedPaths.join(", ") : data.allowedPaths}`);
  if (data.protectedPaths) parts.push(`  Protected paths: ${Array.isArray(data.protectedPaths) ? data.protectedPaths.join(", ") : data.protectedPaths}`);
  if (data.requiredCommands) parts.push(`  Required commands: ${Array.isArray(data.requiredCommands) ? data.requiredCommands.join(", ") : data.requiredCommands}`);
  return parts.join("\n");
}

function formatRepoGuardrailsZh(data) {
  if (!data) return "未找到 guardrails 配置。";
  const parts = ["仓库 Guardrails 配置："];
  if (data.preset) parts.push(`  预设：${data.preset}`);
  if (data.allowedPaths) parts.push(`  允许路径：${Array.isArray(data.allowedPaths) ? data.allowedPaths.join("、") : data.allowedPaths}`);
  if (data.protectedPaths) parts.push(`  保护路径：${Array.isArray(data.protectedPaths) ? data.protectedPaths.join("、") : data.protectedPaths}`);
  if (data.requiredCommands) parts.push(`  必要命令：${Array.isArray(data.requiredCommands) ? data.requiredCommands.join("、") : data.requiredCommands}`);
  return parts.join("\n");
}

function formatDaemonStatusEn(data) {
  if (!data) return "Daemon status unavailable.";
  const parts = [`Daemon: ${data.running ? "Running" : "Stopped"}`];
  if (data.pid) parts.push(`  PID: ${data.pid}`);
  if (data.checksRun) parts.push(`  Checks run: ${data.checksRun}`);
  if (data.lastCheck) parts.push(`  Last check: ${data.lastCheck}`);
  return parts.join("\n");
}

function formatDaemonStatusZh(data) {
  if (!data) return "守护进程状态不可用。";
  const parts = [`守护进程：${data.running ? "运行中" : "已停止"}`];
  if (data.pid) parts.push(`  PID：${data.pid}`);
  if (data.checksRun) parts.push(`  已运行检查：${data.checksRun}`);
  if (data.lastCheck) parts.push(`  上次检查：${data.lastCheck}`);
  return parts.join("\n");
}
