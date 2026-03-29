/**
 * OpenCode Plugin — agent-guardrails
 *
 * Place in .opencode/plugins/guardrails.js
 * Listens to file.edited events and runs guardrail check.
 */

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

        const result = await $`agent-guardrails check --json`;
        await client.app.log({
          body: {
            service: "guardrails-plugin",
            level: "info",
            message: "🛡️ guardrails check completed, exitCode: " + result.exitCode,
          },
        });

        if (result.exitCode === 0) return;

        let data;
        try {
          data = JSON.parse(result.stdout || "{}");
        } catch {
          await client.app.log({
            body: {
              service: "guardrails-plugin",
              level: "error",
              message: "🛡️ failed to parse JSON output",
            },
          });
          return;
        }

        const errors = (data.findings || [])
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

        const warnings = (data.findings || [])
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
