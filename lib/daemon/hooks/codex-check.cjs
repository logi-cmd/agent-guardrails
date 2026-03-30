#!/usr/bin/env node
/**
 * Codex CLI Stop hook — agent-guardrails
 *
 * Place in .codex/hooks/guardrails-check.js
 * Requires: codex -c features.codex_hooks=true
 * Event: Stop (fires when a turn completes)
 * Uses shared-result-reader (cache-first, fallback-second) to avoid redundant checks.
 * Exit 2 + stderr → agent sees the error
 */

const { getResult } = require("./shared-result-reader.cjs");

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

function extractFindings(data) {
  if (!data) return { errors: [], warnings: [] };
  const findings = data.findings || data.result?.findings || [];
  const errors = findings.filter(f => f.severity === "error");
  const warnings = findings.filter(f => f.severity === "warning");
  return { errors, warnings };
}

const projectDir = process.env.CODEX_PROJECT_DIR || process.cwd();

const data = getResult(projectDir);
if (!data) process.exit(0);

const { errors } = extractFindings(data);
if (errors.length === 0) process.exit(0);

const errorMsg = errors.map(f => `[${f.code}] ${f.message}`).join("\n");

process.stderr.write(`\n${msgC("header")}\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
errorMsg.split("\n").forEach(e => process.stderr.write(`- ${e}\n`));
process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
process.exit(2);
