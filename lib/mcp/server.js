import { executeCheck } from "../commands/check.js";
import {
  bootstrapTaskSession,
  readRepoGuardrails,
  summarizeReviewRisks
} from "../runtime/service.js";

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
