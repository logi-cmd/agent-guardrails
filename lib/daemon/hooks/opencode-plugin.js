/**
 * OpenCode Plugin — agent-guardrails
 *
 * Place in .opencode/plugins/guardrails.js
 * Listens to file.edited events and runs guardrail check.
 */

export default function guardrailsPlugin() {
  return async ({ $, client }) => ({
    "file.edited": async (input) => {
      try {
        const result = await $`agent-guardrails check --json`;
        if (result.exitCode === 0) return;

        let data;
        try { data = JSON.parse(result.stdout || "{}"); } catch { return; }

        const errors = (data.findings || [])
          .filter(f => f.severity === "error")
          .map(f => `[${f.code}] ${f.message}`);

        if (errors.length > 0) {
          await client.app.log({
            body: { level: "error", message: "🛡️ Guardrails:\n" + errors.join("\n") }
          });
        }
      } catch { /* silent */ }
    }
  });
}
