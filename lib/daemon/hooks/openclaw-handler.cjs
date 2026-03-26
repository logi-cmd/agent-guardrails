/**
 * OpenClaw Hook Handler — agent-guardrails daemon-check
 *
 * Event: command:stop
 * Place in .openclaw/hooks/daemon-guardrail-check/handler.cjs
 * Pushes guardrail check results to the conversation when an agent command completes.
 */

const { spawnSync } = require("node:child_process");

module.exports = function ({ messages }) {
  const projectDir = process.env.OPENCLAW_PROJECT_DIR || process.cwd();

  const result = spawnSync("agent-guardrails", ["check", "--json"], {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
    shell: true
  });

  if (result.error) return;

  let data;
  try { data = JSON.parse(result.stdout || "{}"); } catch { return; }

  const findings = data?.findings || [];
  if (findings.length === 0) return;

  const errors = findings.filter(f => f.severity === "error");
  const warns = findings.filter(f => f.severity === "warning");

  if (errors.length > 0 || warns.length > 0) {
    let report = "🛡️ **Guardrails Check Report**\n\n";
    if (errors.length > 0) {
      report += `**Errors (${errors.length}):**\n`;
      errors.forEach(f => { report += `- [${f.code}] ${f.message}\n`; });
      report += "\n";
    }
    if (warns.length > 0) {
      report += `**Warnings (${warns.length}):**\n`;
      warns.forEach(f => { report += `- [${f.code}] ${f.message}\n`; });
    }

    messages.push({ role: "system", content: report });
  }
};
