#!/usr/bin/env node
/**
 * Cursor afterFileEdit Hook — agent-guardrails
 *
 * Synchronously runs guardrail check after each file edit.
 * Cross-platform (Windows/Linux/macOS) — uses spawnSync with shell:true.
 * exit 2 + stderr → Cursor shows the error in Hooks Output Channel.
 */

const { spawnSync } = require("node:child_process");

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
  process.stderr.write("\n🛡️ agent-guardrails check:\n");
  errors.forEach(f => process.stderr.write(`  ❌ ERROR: [${f.code}] ${f.message}\n`));
  warns.forEach(f => process.stderr.write(`  ⚠️  WARN: [${f.code}] ${f.message}\n`));
  process.stderr.write("\n");
  if (errors.length > 0) process.exit(2);
}

process.exit(0);
