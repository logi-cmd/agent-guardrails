#!/usr/bin/env node
/**
 * Claude Code PostToolUse Hook — daemon-check
 *
 * Synchronously runs guardrail check after each file edit.
 * Uses shared-result-reader (cache-first, fallback-second) to avoid redundant checks.
 * If error-level findings exist, outputs them to stderr (exit 2 → Claude sees it).
 * Runs within hook timeout (10s default).
 */

const { getResult } = require("./shared-result-reader.cjs");

const LOCALE = process.env.AGENT_GUARDRAILS_LOCALE || "en";
const MESSAGES = {
  en: {
    header: "🛡️ Guardrails Check Report",
    errorLine: "❌ [{code}] {message}"
  },
  "zh-CN": {
    header: "🛡️ Guardrails 检查报告",
    errorLine: "❌ [{code}] {message}"
  }
};
function msg(key) {
  const m = MESSAGES[LOCALE] || MESSAGES.en;
  return m[key] || key;
}

function extractFindings(data) {
  if (!data) return { errors: [], warnings: [] };
  const findings = data.findings || data.result?.findings || [];
  const errors = findings.filter(f => f.severity === "error");
  const warnings = findings.filter(f => f.severity === "warning");
  return { errors, warnings };
}

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const data = getResult(projectDir);
if (!data) process.exit(0);

const { errors } = extractFindings(data);
if (errors.length === 0) process.exit(0);

const errorMsg = errors.map(f => {
  return msg("errorLine").replace("{code}", f.code).replace("{message}", f.message);
});

process.stderr.write(`\n${msg("header")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
errorMsg.forEach(e => process.stderr.write(`${e}\n`));
process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
process.exit(2);
