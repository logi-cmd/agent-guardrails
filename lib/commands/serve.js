import http from "node:http";
import { callTool } from "../mcp/server.js";
import { routeIntent } from "../chat/intent-router.js";
import { formatHumanOutput } from "../chat/human-output.js";
import { getSession, updateSession } from "../chat/session.js";
import { createTranslator, resolveLocale } from "../i18n.js";

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload, "utf8")
  });
  res.end(payload);
}

export function bodyReadErrorResponse(error) {
  const isTooLarge = /too large/i.test(error?.message || "");
  return {
    status: isTooLarge ? 413 : 400,
    body: { error: isTooLarge ? "Request body too large" : "Invalid JSON" }
  };
}

function sendBodyReadError(res, error) {
  const response = bodyReadErrorResponse(error);
  sendJson(res, response.status, response.body);
}

export function formatToolFailure(toolName, err) {
  return `Tool ${toolName} failed: ${err?.message || err}`;
}

export function readBody(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;

    req.on("data", (chunk) => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        reject(new Error("Request body too large"));
        req.destroy?.();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

export function getServeHostWarning(host) {
  const normalized = String(host || "").trim().toLowerCase();
  if (!normalized || LOOPBACK_HOSTS.has(normalized)) return null;

  return "Warning: agent-guardrails serve is listening on non-loopback network interfaces. Only use this on trusted networks.";
}

async function handleChat(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendBodyReadError(res, error);
    return;
  }

  const locale = resolveLocale(body.locale || null) || "en";
  const { t } = createTranslator(locale);
  const repoRoot = body.repoRoot || process.cwd();
  const message = body.message || "";
  const sessionId = body.sessionId || null;

  if (!message) {
    sendJson(res, 200, {
      reply: formatHumanOutput(null, null, locale),
      sessionId: sessionId || null
    });
    return;
  }

  const session = getSession(sessionId, { repoRoot, locale });
  updateSession(session.id, { repoRoot, locale });

  const intent = routeIntent(message);
  if (!intent) {
    sendJson(res, 200, {
      reply: formatHumanOutput(null, null, locale),
      sessionId: session.id
    });
    return;
  }

  const args = {
    ...intent.args,
    repoRoot: session.data.repoRoot
  };

  let toolResult;
  try {
    toolResult = await callTool(intent.tool, args, session.data.repoRoot);
  } catch (err) {
    sendJson(res, 500, {
      reply: formatToolFailure(intent.tool, err),
      sessionId: session.id
    });
    return;
  }

  const resultData = toolResult?.structuredContent || toolResult || {};
  const reply = formatHumanOutput(intent.tool, resultData, locale);

  sendJson(res, 200, {
    reply,
    sessionId: session.id,
    tool: intent.tool,
    rawResult: resultData
  });
}

async function handleToolCall(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendBodyReadError(res, error);
    return;
  }

  const locale = resolveLocale(body.locale || null) || "en";
  const repoRoot = body.repoRoot || process.cwd();
  const toolName = req.url?.split("/").pop();

  if (!toolName) {
    sendJson(res, 400, { error: "Tool name required in URL path" });
    return;
  }

  const { ...args } = body;

  let toolResult;
  try {
    toolResult = await callTool(toolName, args, repoRoot);
  } catch (err) {
    sendJson(res, 500, {
      error: formatToolFailure(toolName, err)
    });
    return;
  }

  const resultData = toolResult?.structuredContent || toolResult || {};
  const reply = formatHumanOutput(toolName, resultData, locale);

  sendJson(res, 200, {
    reply,
    tool: toolName,
    rawResult: resultData
  });
}

async function handleHealth(req, res) {
  const { readOwnPackageJson } = await import("../utils.js");
  const pkg = readOwnPackageJson();
  const { activeSessionCount } = await import("../chat/session.js");

  sendJson(res, 200, {
    status: "ok",
    version: pkg.version,
    activeSessions: activeSessionCount(),
    // Expose available endpoints for discovery
    endpoints: {
      chat: "/api/chat",
      tools: "/api/tools/:name",
      health: "/api/health",
      explain: "/api/explain",
      archaeology: "/api/archaeology"
    }
  });
}

async function handleExplain(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendBodyReadError(res, error);
    return;
  }

  const locale = resolveLocale(body.locale || null) || "en";
  const repoRoot = body.repoRoot || process.cwd();
  // sessionId is not required for explain_change per spec, but we keep it for compatibility
  // and potential future use in the MCP tool if needed by the backend.
  const { sessionId } = body;

  try {
    const toolResult = await callTool("explain_change", { repoRoot, locale }, repoRoot);
    const resultData = toolResult?.structuredContent || toolResult || {};
    const reply = formatHumanOutput("explain_change", resultData, locale);
    sendJson(res, 200, {
      reply,
      tool: "explain_change",
      rawResult: resultData
    });
  } catch (err) {
    sendJson(res, 500, {
      error: formatToolFailure("explain_change", err)
    });
  }
}

async function handleArchaeology(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch (error) {
    sendBodyReadError(res, error);
    return;
  }

  const locale = resolveLocale(body.locale || null) || "en";
  const repoRoot = body.repoRoot || process.cwd();
  const sessionId = body.sessionId || null;

  try {
    const toolResult = await callTool("query_archaeology", { repoRoot, sessionId, locale }, repoRoot);
    const resultData = toolResult?.structuredContent || toolResult || {};
    const reply = formatHumanOutput("query_archaeology", resultData, locale);
    sendJson(res, 200, {
      reply,
      tool: "query_archaeology",
      rawResult: resultData
    });
  } catch (err) {
    sendJson(res, 500, {
      error: formatToolFailure("query_archaeology", err)
    });
  }
}

function handleRequest(req, res) {
  if (req.method === "GET" && req.url === "/api/health") {
    handleHealth(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/chat") {
    handleChat(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/explain") {
    handleExplain(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/archaeology") {
    handleArchaeology(req, res);
    return;
  }

  if (req.method === "POST" && req.url?.startsWith("/api/tools/")) {
    handleToolCall(req, res);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

export async function runServe({ positional = [], flags = {}, locale = null } = {}) {
  const port = parseInt(flags.port || flags.p || "3456", 10);
  const host = flags.host || "127.0.0.1";
  const resolvedLocale = resolveLocale(locale) || "en";
  const { t } = createTranslator(resolvedLocale);

  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(t("chat.invalidPort", { value: String(flags.port || flags.p) }));
  }

  const hostWarning = getServeHostWarning(host);
  if (hostWarning) {
    console.warn(hostWarning);
  }

  const server = http.createServer(handleRequest);

  await new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const displayHost = addr.family === "IPv6" ? `[${addr.address}]` : addr.address;
      console.log(t("chat.serverStarted", { url: `http://${displayHost}:${addr.port}` }));
      console.log(t("chat.endpoints"));
      console.log(`  POST /api/chat       - ${t("chat.chatEndpoint")}`);
      console.log(`  POST /api/tools/:name - ${t("chat.toolsEndpoint")}`);
      console.log(`  GET  /api/health     - ${t("chat.healthEndpoint")}`);
      console.log();
      console.log(t("chat.pressCtrlC"));
      resolve();
    });
  });

  await new Promise((resolve, reject) => {
    server.on("close", resolve);
    process.on("SIGINT", () => {
      console.log(`\n${t("chat.shuttingDown")}`);
      server.close(() => resolve());
    });
    process.on("SIGTERM", () => {
      server.close(() => resolve());
    });
  });
}
