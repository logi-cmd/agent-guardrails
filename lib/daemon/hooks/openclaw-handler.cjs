/**
 * OpenClaw Hook Handler — agent-guardrails daemon-check
 *
 * Event: command:stop
 * Place in .openclaw/hooks/daemon-guardrail-check/handler.cjs
 * Pushes guardrail check results to the conversation when an agent command completes.
 */

const { spawnSync } = require("node:child_process");

// Lightweight i18n for this CommonJS hook
const LOCALE_OC = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES_OC = {
  en: { guardHeader: "Guardrails Check Report", errorsHeader: "Errors", warningsHeader: "Warnings" },
  "zh-CN": { guardHeader: "Guardrails 检查报告", errorsHeader: "错误", warningsHeader: "警告" }
};
function msgOC(key) {
  const m = MESSAGES_OC[LOCALE_OC] || MESSAGES_OC["en"];
  return m[key] || key;
}

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
    let report = `🛡️ **${msgOC("guardHeader")}**\n\n`;
    if (errors.length > 0) {
      report += `**${msgOC("errorsHeader")} (${errors.length}):**\n`;
      errors.forEach(f => { report += `- [${f.code}] ${f.message}\n`; });
      report += "\n";
    }
    if (warns.length > 0) {
      report += `**${msgOC("warningsHeader")} (${warns.length}):**\n`;
      warns.forEach(f => { report += `- [${f.code}] ${f.message}\n`; });
    }

    messages.push({ role: "system", content: report });
  }
};
