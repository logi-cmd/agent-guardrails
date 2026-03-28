#!/usr/bin/env node
/**
 * Codex CLI Stop hook — agent-guardrails
 *
 * Place in .codex/hooks/guardrails-check.js
 * Requires: codex -c features.codex_hooks=true
 * Event: Stop (fires when a turn completes)
 * Exit 2 + stderr → agent sees the error
 */

const { spawnSync } = require("node:child_process");

// Lightweight local i18n for CommonJS hooks
const LOCALE_C = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES_C = {
  en: {
    header: "Guardrails Check Report",
    errorLine: "❌ [{code}] {message}"
  },
  "zh-CN": {
    header: "Guardrails 检查报告",
    errorLine: "❌ [{code}] {message}"
  }
};
function msgC(key) {
  const m = MESSAGES_C[LOCALE_C] || MESSAGES_C["en"];
  return m[key] || key;
}

const projectDir = process.env.CODEX_PROJECT_DIR || process.cwd();

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
const errors = findings
  .filter(f => f.severity === "error")
  .map(f => `[${f.code}] ${f.message}`)
  .join("\n");

if (errors) {
  process.stderr.write(`\n${msgC("header")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  errors.split("\n").forEach(e => process.stderr.write(`- ${e}\n`));
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(2);
}

process.exit(0);
