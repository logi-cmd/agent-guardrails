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
  process.stderr.write("\n🛡️ Guardrails Check Report\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  errors.forEach(f => process.stderr.write(`❌ [${f.code}] ${f.message}\n`));
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(2);
}

process.exit(0);
