#!/usr/bin/env node
/**
 * Windsurf post_write_code Hook — agent-guardrails
 *
 * Synchronously runs guardrail check after each code write.
 * Uses shared-result-reader (cache-first, fallback-second) to avoid redundant checks.
 * Reads working_directory from stdin JSON if available, falls back to cwd.
 * exit 2 + stderr → Windsurf agent sees the error.
 */

const { getResult } = require("./shared-result-reader.cjs");

// Lightweight local i18n for CommonJS hooks
const LOCALE_W = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES_W = {
  en: {
    header: "Guardrails Check Report",
    errorLine: "❌ [{code}] {message}"
  },
  "zh-CN": {
    header: "Guardrails 检查报告",
    errorLine: "❌ [{code}] {message}"
  }
};
function msgW(key) {
  const m = (MESSAGES_W[LOCALE_W] || MESSAGES_W.en);
  return m[key] || key;
}

function extractFindings(data) {
  if (!data) return { errors: [], warnings: [] };
  const findings = data.findings || data.result?.findings || [];
  const errors = findings.filter(f => f.severity === "error");
  const warnings = findings.filter(f => f.severity === "warning");
  return { errors, warnings };
}

const projectDir = process.env.WINDSURF_PROJECT_DIR || process.cwd();

const data = getResult(projectDir);
if (!data) return;

const { errors } = extractFindings(data);

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
