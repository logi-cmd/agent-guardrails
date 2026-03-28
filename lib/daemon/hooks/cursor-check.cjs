#!/usr/bin/env node
/**
 * Cursor afterFileEdit Hook — agent-guardrails
 *
 * Synchronously runs guardrail check after each file edit.
 * Cross-platform (Windows/Linux/macOS) — uses spawnSync with shell:true.
 * exit 2 + stderr → Cursor shows the error in Hooks Output Channel.
 */

const { spawnSync } = require("node:child_process");

// Lightweight local i18n for CommonJS hooks (no ESM imports)
const LOCALE = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES = {
  en: {
    checkHeader: "🛡️ agent-guardrails check:\n",
    guardHeader: "Guardrails Check Report",
    guardErrorLine: "❌ [{code}] {message}",
    guardWarnLine: "⚠️  WARN: [{code}] {message}"
  },
  "zh-CN": {
    checkHeader: "🛡️ agent-guardrails 检查：\n",
    guardHeader: "Guardrails 检查报告",
    guardErrorLine: "❌ [{code}] {message}",
    guardWarnLine: "⚠️  警告: [{code}] {message}"
  }
};
function msg(key) {
  const m = MESSAGES[LOCALE] || MESSAGES.en;
  return m[key] || key;
}

const projectDir = process.env.CURSOR_PROJECT_DIR || process.cwd();

const result = spawnSync("agent-guardrails", ["check", "--json"], {
  cwd: projectDir,
  encoding: "utf8",
  timeout: 8000,
  windowsHide: true,
  shell: true
});

if (result.error) process.exit(0);

let data;
try { data = JSON.parse(result.stdout || "{}"); } catch { process.exit(0); }

const findings = data?.findings || [];
const errors = findings.filter(f => f.severity === "error");
const warns = findings.filter(f => f.severity === "warning");

if (errors.length > 0 || warns.length > 0) {
  process.stderr.write(`\n${msg("checkHeader")}`);
  // Print errors and warnings using i18n templates
  errors.forEach(f => {
    const line = msg("guardErrorLine").replace("{code}", f.code).replace("{message}", f.message);
    process.stderr.write(`  ${line}\n`);
  });
  warns.forEach(f => {
    const line = msg("guardWarnLine").replace("{code}", f.code).replace("{message}", f.message);
    process.stderr.write(`  ${line}\n`);
  });
  process.stderr.write("\n");
  if (errors.length > 0) process.exit(2);
}

process.exit(0);
