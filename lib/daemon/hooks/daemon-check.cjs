#!/usr/bin/env node
/**
 * Claude Code PostToolUse Hook — daemon-check
 *
 * Synchronously runs guardrail check after each file edit.
 * Uses the global agent-guardrails CLI (spawnSync) to avoid module resolution issues.
 * If error-level findings exist, outputs them to stderr (exit 2 → Claude sees it).
 * Runs within hook timeout (10s default).
 */

const { spawnSync } = require("node:child_process");

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
  process.stderr.write("\n🛡️ Guardrails Check Report\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  errors.split("\n").forEach(e => process.stderr.write("❌ " + e + "\n"));
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(2);
}

process.exit(0);
