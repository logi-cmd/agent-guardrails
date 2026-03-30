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

const errorMsg = errors.map(f => `[${f.code}] ${f.message}`).join("\n");

process.stderr.write("\n🛡️ Guardrails Check Report\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
errorMsg.split("\n").forEach(e => process.stderr.write("❌ " + e + "\n"));
process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
process.exit(2);
