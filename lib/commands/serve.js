import http from "node:http";
import { callTool } from "../mcp/server.js";
import { routeIntent } from "../chat/intent-router.js";
import { formatHumanOutput } from "../chat/human-output.js";
import { getSession, updateSession } from "../chat/session.js";
import { createTranslator, resolveLocale } from "../i18n.js";

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload, "utf8")
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
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

async function handleChat(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
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
      reply: locale === "zh-CN"
        ? `❌ 调用工具 ${intent.tool} 失败：${err.message || err}`
        : `❌ Tool ${intent.tool} failed: ${err.message || err}`,
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
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
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
      error: locale === "zh-CN"
        ? `❌ 调用工具 ${toolName} 失败：${err.message || err}`
        : `❌ Tool ${toolName} failed: ${err.message || err}`
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
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
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
      error: locale === "zh-CN" ? `❌ 调用工具 explain_change 失败：${err.message || err}` : `❌ Tool explain_change failed: ${err.message || err}`
    });
  }
}

async function handleArchaeology(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, 400, { error: "Invalid JSON" });
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
      error: locale === "zh-CN" ? `❌ 调用工具 query_archaeology 失败：${err.message || err}` : `❌ Tool query_archaeology failed: ${err.message || err}`
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
