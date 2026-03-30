#!/usr/bin/env node
/**
 * Cursor afterFileEdit Hook — agent-guardrails
 *
 * Synchronously runs guardrail check after each file edit.
 * Uses shared-result-reader (cache-first, fallback-second) to avoid redundant checks.
 * exit 2 + stderr → Cursor shows the error in Hooks Output Channel.
 */

const { getResult } = require("./shared-result-reader.cjs");

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

function extractFindings(data) {
  if (!data) return { errors: [], warnings: [] };
  const findings = data.findings || data.result?.findings || [];
  const errors = findings.filter(f => f.severity === "error");
  const warnings = findings.filter(f => f.severity === "warning");
  return { errors, warnings };
}

const projectDir = process.env.CURSOR_PROJECT_DIR || process.cwd();

const data = getResult(projectDir);
if (!data) process.exit(0);

const { errors, warnings } = extractFindings(data);

if (errors.length > 0 || warnings.length > 0) {
  process.stderr.write(`\n${msg("checkHeader")}`);
  // Print errors and warnings using i18n templates
  errors.forEach(f => {
    const line = msg("guardErrorLine").replace("{code}", f.code).replace("{message}", f.message);
    process.stderr.write(`  ${line}\n`);
  });
  warnings.forEach(f => {
    const line = msg("guardWarnLine").replace("{code}", f.code).replace("{message}", f.message);
    process.stderr.write(`  ${line}\n`);
  });
  process.stderr.write("\n");
  if (errors.length > 0) process.exit(2);
}

process.exit(0);
