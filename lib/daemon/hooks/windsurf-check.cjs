#!/usr/bin/env node
/**
 * Windsurf post_write_code Hook — agent-guardrails
 *
 * Synchronously runs guardrail check after each code write.
 * Cross-platform (Windows/Linux/macOS) — uses spawnSync with shell:true.
 * Reads working_directory from stdin JSON if available, falls back to cwd.
 * exit 2 + stderr → Windsurf agent sees the error.
 */

const { spawnSync } = require("node:child_process");

// Lightweight local i18n for CommonJS hooks
const LOCALE_W = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES_W = {
  en: {
    header: "Guardrails Check Report",
    errorLine: "❌ [{code}] {message}"
  },
  zh-CN: {
    header: "Guardrails 检查报告",
    errorLine: "❌ [{code}] {message}"
  }
};
function msgW(key) {
  const m = (MESSAGES_W[LOCALE_W] || MESSAGES_W.en);
  return m[key] || key;
}

const projectDir = process.env.WINDSURF_PROJECT_DIR || process.cwd();

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

if (errors.length > 0) {
  process.stderr.write(`\n${msgW("header")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  errors.forEach(f => {
    const line = msgW("errorLine").replace("{code}", f.code).replace("{message}", f.message);
    process.stderr.write(`${line}\n`);
  });
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(2);
}

process.exit(0);
