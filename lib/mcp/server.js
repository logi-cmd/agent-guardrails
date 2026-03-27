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

const PROTOCOL_VERSION = "2024-11-05";

const TOOL_DEFINITIONS = [
  {
    name: "read_repo_guardrails",
    description: "Read the repo-local guardrail config, defaults, and policy summary.",
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
    description: "Bootstrap an agent-native task loop, write the runtime-backed contract, and seed evidence files.",
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
    name: "finish_agent_native_loop",
    description: "Finalize an agent-native loop by updating evidence, running check, and returning a reviewer summary.",
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
    description: "Run the current guardrail check and return the structured result.",
    inputSchema: {
      type: "object",
      properties: {
        repoRoot: { type: "string", description: "Absolute path to the repository root." },
        baseRef: { type: "string", description: "Optional git base ref for diff-based checks." },
        commandsRun: {
          type: "array",
          items: { type: "string" },
          description: "Commands that actually ran for the task."
        },
        contractPath: { type: "string", description: "Optional custom task contract path." },
        review: { type: "boolean", description: "Optional review-mode hint for downstream consumers." }
      },
      additionalProperties: false
    }
  },
  {
    name: "summarize_review_risks",
    description: "Summarize a prior guardrail check result into status, top risks, and next actions.",
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
    description: "Parse a rough/fuzzy task description and generate a suggested task contract with inferred scope, test commands, and risk level. Use this when users provide vague or imprecise task descriptions.",
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
    description: "Read the latest daemon check result and status. Returns daemon running state, check count, and the structured result of the most recent guardrail check. Call this after code changes to check if the daemon detected any issues.",
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
    description: "Generate a human-readable explanation of the latest changes. Returns a plain-text summary of what was changed and why, based on the task contract and file list.",
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
    description: "Query the code archaeology notes for the current or a past session. Returns a structured list of change reasons, introducing tasks, and dependency notes accumulated over the task history.",
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
      throw createError(-32010, "Missing .agent-guardrails/config.json in the requested repo.");
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

    return createJsonResult(result);
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

    return createJsonResult(result);
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

    // 获取仓库上下文
    const fs = await import("node:fs");
    const path = await import("node:path");

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

    // 解析意图
    const parsed = parseRoughIntent(task, { fileTree, packageJson, files: fileTree });
    const suggestionText = generateSuggestionText(parsed, locale);

    // 根据模式返回不同结果
    if (mode === "auto" && parsed.confidence >= 0.6) {
      // 自动模式：置信度足够高，自动接受
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

    // suggest 模式：返回建议供确认
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
    const { generateChangeExplanation } = await import("../chat/change-explainer.js");
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const locale = args.locale || "en";
    const t = createTranslator(locale).t;

    const sessionResult = bootstrapTaskSession({ repoRoot, flags: {}, locale });
    const changedFiles = sessionResult?.session?.changedFiles || [];
    const taskContract = sessionResult?.session?.taskContract || {};

    const explanation = generateChangeExplanation({
      changedFiles: changedFiles.map(f => typeof f === "string" ? { path: f, type: "unknown" } : f),
      taskContract,
      findings: [],
      locale
    });

    return createJsonResult({
      explanation: explanation || t("findings.noFindings", {}),
      fileCount: changedFiles.length,
      task: taskContract.task || ""
    });
  }

  if (name === "query_archaeology") {
    const repoRoot = args.repoRoot || defaultRepoRoot;
    const { getSession } = await import("../chat/session.js");
    const sessionId = args.sessionId || null;

    const session = sessionId ? getSession(sessionId) : getSession(repoRoot);
    const notes = session?.archaeologyNotes || [];

    return createJsonResult({
      sessionId: session?.sessionId || null,
      notes: notes,
      noteCount: notes.length
    });
  }

  throw createError(-32601, `Unknown tool "${name}".`);
}

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

export { callTool };

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
