#!/usr/bin/env node
/**
 * Git pre-commit Hook — agent-guardrails
 *
 * Blocks commits with error-level findings, warns on warnings.
 * Uses shared-result-reader (cache-first, fallback-second).
 */

const { getResult } = require("./shared-result-reader.cjs");
const path = require("node:path");

function extractFindings(data) {
  if (!data) return { errors: [], warnings: [] };
  const findings = data.findings || data.result?.findings || [];
  const errors = findings.filter(f => f.severity === "error");
  const warnings = findings.filter(f => f.severity === "warning");
  return { errors, warnings };
}

const projectDir = process.cwd();
const data = getResult(projectDir);
if (!data) process.exit(0);

const { errors, warnings } = extractFindings(data);

if (errors.length > 0) {
  process.stderr.write("\n🛡️ Guardrails: Commit blocked\n");
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  errors.forEach(e => process.stderr.write(`  ❌ [${e.code}] ${e.message}\n`));
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.stderr.write("Fix errors before committing.\n\n");
  process.exit(1);
}

if (warnings.length > 0) {
  process.stderr.write("\n🛡️ Guardrails: Warnings\n");
  warnings.forEach(w => process.stderr.write(`  ⚠️ [${w.code}] ${w.message}\n`));
  process.stderr.write("");
}

process.exit(0);
