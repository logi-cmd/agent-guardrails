/**
 * OpenCode Plugin — agent-guardrails
 *
 * Place in .opencode/plugins/guardrails.js
 * Listens to file.edited events and runs guardrail check.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Read daemon-result.json directly from disk.
 * Returns null if file missing, stale, or daemon still running.
 * @param {string} projectDir - Project directory path
 * @param {number} maxAgeMs - Maximum age in ms before result is considered stale
 * @returns {object|null} Parsed daemon result or null
 */
function readDaemonResult(projectDir, maxAgeMs = 30000) {
  const resultPath = path.join(projectDir, ".agent-guardrails", "daemon-result.json");
  try {
    if (!fs.existsSync(resultPath)) return null;
    const raw = fs.readFileSync(resultPath, "utf8");
    const data = JSON.parse(raw);
    const age = Date.now() - new Date(data.timestamp).getTime();
    if (isNaN(age) || age > maxAgeMs) return null;
    if (data.status === "running") return null;
    return data;
  } catch {
    return null;
  }
}

export default async function guardrailsPlugin({ client, $ }) {
  // Debug: log when plugin loads
  await client.app.log({
    body: {
      service: "guardrails-plugin",
      level: "info",
      message: "🛡️ guardrails plugin loaded",
    },
  });

  return {
    event: async ({ event }) => {
      if (event.type !== "file.edited") return;
      
      try {
        await client.app.log({
          body: {
            service: "guardrails-plugin",
            level: "info",
            message: "🛡️ file.edited event fired: " + JSON.stringify(event.payload || {}),
          },
        });

        let checkData = readDaemonResult(process.cwd());
        if (!checkData) {
          try {
            const result = await $`agent-guardrails check --json`;
            checkData = JSON.parse(result.stdout || "{}");
          } catch {
            return;
          }
        }
        await client.app.log({
          body: {
            service: "guardrails-plugin",
            level: "info",
            message: "🛡️ guardrails check completed, checkData: " + (checkData ? "present" : "null"),
          },
        });

        const findings = checkData.result?.findings || checkData.findings || [];
        const errors = findings
          .filter((f) => f.severity === "error")
          .map((f) => `[${f.code}] ${f.message}`);

        if (errors.length > 0) {
          await client.app.log({
            body: {
              service: "guardrails-plugin",
              level: "error",
              message: "🛡️ Guardrails errors found: " + errors.length,
            },
          });

          // Send error message to current session
          try {
            const sessions = await client.session.list();
            const currentSession = sessions.data?.[0];
            if (currentSession?.id) {
              await client.session.prompt({
                path: { id: currentSession.id },
                body: {
                  noReply: true,
                  parts: [{
                    type: "text",
                    text: `🛡️ **Guardrails 检测到 ${errors.length} 个错误：**\n\n${errors.map((e, i) => `${i + 1}. ${e}`).join("\n")}\n\n请修复后再继续。`
                  }]
                }
              });
            }
          } catch (e) {
            await client.app.log({
              body: { service: "guardrails-plugin", level: "error", message: "🛡️ failed to send session message: " + (e?.message || String(e)) },
            });
          }
          return;
        }

        const warnings = findings
          .filter((f) => f.severity === "warning")
          .map((f) => `[${f.code}] ${f.message}`);

        if (warnings.length > 0) {
          await client.app.log({
            body: {
              service: "guardrails-plugin",
              level: "warn",
              message: "🛡️ Guardrails warnings found: " + warnings.length,
            },
          });

          // Send warning message to current session
          try {
            const sessions = await client.session.list();
            const currentSession = sessions.data?.[0];
            if (currentSession?.id) {
              await client.session.prompt({
                path: { id: currentSession.id },
                body: {
                  noReply: true,
                  parts: [{
                    type: "text",
                    text: `🛡️ **Guardrails 警告 (${warnings.length})：**\n\n${warnings.map((w, i) => `${i + 1}. ${w}`).join("\n")}`
                  }]
                }
              });
            }
          } catch (e) {
            await client.app.log({
              body: { service: "guardrails-plugin", level: "error", message: "🛡️ failed to send session message: " + (e?.message || String(e)) },
            });
          }
        }
      } catch (e) {
        await client.app.log({
          body: {
            service: "guardrails-plugin",
            level: "error",
            message: "🛡️ guardrails plugin error: " + (e?.message || String(e)),
          },
        });
      }
    },
  };
}
