#!/usr/bin/env node
/**
 * Gemini CLI AfterTool hook — agent-guardrails
 *
 * Place in .gemini/hooks/guardrails-check.js
 * Matcher: "write_file|replace|edit"
 * Exit 2 = System Block, stderr = rejection reason → agent sees it
 * Exit 0 with JSON stdout = allow
 */

const { spawnSync } = require("node:child_process");

const projectDir = process.env.GEMINI_PROJECT_DIR || process.cwd();

const result = spawnSync("agent-guardrails", ["check", "--json"], {
  cwd: projectDir,
  encoding: "utf8",
  timeout: 8000,
  windowsHide: true,
  shell: true
});

if (result.error) {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

let data;
try { data = JSON.parse(result.stdout || "{}"); } catch {
  console.log(JSON.stringify({ decision: "allow" }));
  process.exit(0);
}

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

console.log(JSON.stringify({ decision: "allow" }));
process.exit(0);
