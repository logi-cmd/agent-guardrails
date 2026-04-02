/**
 * OpenCode Plugin — agent-guardrails
 *
 * Auto-loaded from .opencode/plugins/guardrails.js
 * No registration in opencode.json needed.
 *
 * Limitation: tool.execute.before does NOT intercept subagent tool calls
 * spawned via the `task` tool.
 * See: https://github.com/anomalyco/opencode/issues/5894
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const PLUGIN_NAME = "guardrails-plugin";
const MAX_AGE_MS = 30000;

function log(client, level, message) {
  try {
    client?.app?.log({ body: { service: PLUGIN_NAME, level, message } });
  } catch {}
}

function loadConfig(projectDir) {
  const configPath = path.join(projectDir, ".agent-guardrails", "config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return null;
  }
}

function readDaemonResult(projectDir) {
  const resultPath = path.join(projectDir, ".agent-guardrails", "daemon-result.json");
  if (!fs.existsSync(resultPath)) return null;
  try {
    const raw = fs.readFileSync(resultPath, "utf8");
    const data = JSON.parse(raw);
    const age = Date.now() - new Date(data.timestamp).getTime();
    if (isNaN(age) || age > MAX_AGE_MS) return null;
    if (data.status === "running") return null;
    return data;
  } catch {
    return null;
  }
}

function checkScope(filePath, config) {
  if (!config) return { allowed: true };
  const allowedPaths = config.allowedPaths || config.checks?.allowedPaths;
  if (!allowedPaths || allowedPaths.length === 0) return { allowed: true };
  const normalized = filePath.replace(/\\/g, "/");
  const matched = allowedPaths.some((p) => {
    const pattern = p.replace(/\\/g, "/");
    return normalized.startsWith(pattern) || normalized.includes(pattern);
  });
  if (!matched) {
    return {
      allowed: false,
      reason: `File "${filePath}" is outside the declared scope. Allowed: ${allowedPaths.join(", ")}`,
    };
  }
  return { allowed: true };
}

function runCheck(projectDir, baseRef) {
  try {
    const result = execFileSync("npx", [
      "agent-guardrails", "check",
      "--base-ref", baseRef || "HEAD",
      "--json",
    ], { cwd: projectDir, timeout: 30000, encoding: "utf8" });
    if (!result) return null;
    return JSON.parse(result);
  } catch {
    return null;
  }
}

async function injectSessionMessage(client, message) {
  try {
    const sessions = await client.session.list();
    const currentSession = sessions.data?.[0];
    if (!currentSession?.id) return;
    await client.session.prompt({
      path: { id: currentSession.id },
      body: {
        noReply: true,
        parts: [{ type: "text", text: message }],
      },
    });
  } catch {}
}

function formatFindings(findings) {
  const errors = findings
    .filter((f) => f.severity === "error")
    .map((f) => `[${f.code}] ${f.message}`);
  const warnings = findings
    .filter((f) => f.severity === "warning")
    .map((f) => `[${f.code}] ${f.message}`);
  const parts = [];
  if (errors.length > 0) {
    parts.push(`**Guardrails detected ${errors.length} error(s):**\n\n${errors.join("\n")}\n\nPlease fix before continuing.`);
  }
  if (warnings.length > 0) {
    parts.push(`**Guardrails warnings (${warnings.length}):**\n\n${warnings.join("\n")}`);
  }
  return parts.length > 0 ? parts.join("\n\n") : null;
}

export const GuardrailsPlugin = async ({ project, client, $, directory, worktree }) => {
  const projectDir = directory || process.cwd();

  log(client, "info", "guardrails plugin loaded");

  return {
    "tool.execute.before": async (input) => {
      try {
        const toolName = input?.tool?.toLowerCase() || "";
        const isFileTool = ["write", "edit", "multiedit", "create"].some(
          (t) => toolName.includes(t)
        );
        if (!isFileTool) return;

        const filePath =
          input?.args?.file_path ||
          input?.args?.path ||
          input?.args?.filePath ||
          input?.args?.filename;

        if (!filePath) return;

        const config = loadConfig(projectDir);
        if (!config) return;

        const scopeResult = checkScope(filePath, config);
        if (!scopeResult.allowed) {
          log(client, "warn", `Blocked out-of-scope file: ${filePath}`);
          await injectSessionMessage(
            client,
            `**Guardrails blocked file operation:**\n\n${scopeResult.reason}\n\nThe file was not modified. Adjust your scope or choose an allowed file.`
          );
          throw new Error(scopeResult.reason);
        }
      } catch (e) {
        if (e?.message?.includes("outside the declared scope")) throw e;
        log(client, "error", `tool.execute.before error: ${e?.message || e}`);
      }
    },

    event: async ({ event }) => {
      try {
        if (event?.type !== "file.edited") return;
        const filePath = event?.payload?.filePath;
        if (!filePath) return;
        log(client, "info", `file.edited: ${filePath}`);

        let checkData = readDaemonResult(projectDir);
        if (!checkData) {
          checkData = runCheck(projectDir, "HEAD");
        }
        if (!checkData) return;

        const findings = checkData.result?.findings || checkData.findings || [];
        if (findings.length === 0) return;

        const message = formatFindings(findings);
        if (message) {
          await injectSessionMessage(client, message);
        }
      } catch (e) {
        log(client, "error", `file.edited error: ${e?.message || e}`);
      }
    },
  };
};
