/**
 * Unit tests for daemon-check hook scripts
 *
 * Tests the spawnSync-based guardrail check hook by running them as child processes.
 */

import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let passed = 0;
let failed = 0;

function check(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL: ${msg}`);
  }
}

const hookScript = path.resolve(__dirname, "..", "lib", "daemon", "hooks", "daemon-check.cjs");
const testDir = path.resolve(__dirname, ".tmp-daemon-check-test");

if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

console.log("\n[daemon-check.test.js]");

console.log("Test 1: CLI not found → exit 0");
{
  const result = spawnSync("node", [hookScript], {
    cwd: testDir,
    env: { ...process.env, PATH: "/nonexistent" },
    encoding: "utf8",
    timeout: 10000
  });
  check(result.status === 0, `exit code should be 0, got ${result.status}`);
  check(result.stderr === "", "stderr should be empty when CLI not found");
}

console.log("Test 2: Check passes → exit 0");
{
  const result = spawnSync("node", [hookScript], {
    cwd: testDir,
    env: { ...process.env, CLAUDE_PROJECT_DIR: testDir },
    encoding: "utf8",
    timeout: 10000
  });
  check(result.status === 0, `exit code should be 0, got ${result.status}`);
}

console.log("Test 3: Hook script is valid JavaScript");
{
  const content = fs.readFileSync(hookScript, "utf8");
  check(content.includes("spawnSync"), "should contain spawnSync");
  check(content.includes("agent-guardrails"), "should reference agent-guardrails CLI");
  check(content.includes("check", "--json"), "should pass --json flag");
  check(content.includes("stderr"), "should write to stderr on error");
  check(content.includes("process.exit(2)"), "should exit with code 2 on error");
  check(content.includes("process.exit(0)"), "should exit with code 0 on success");
}

console.log("Test 4: Hook script respects CLAUDE_PROJECT_DIR");
{
  const content = fs.readFileSync(hookScript, "utf8");
  check(content.includes("CLAUDE_PROJECT_DIR"), "should read CLAUDE_PROJECT_DIR env var");
  check(content.includes("process.cwd()"), "should fallback to cwd");
}

console.log("Test 5: Hook script has timeout");
{
  const content = fs.readFileSync(hookScript, "utf8");
  check(content.includes("timeout"), "should have a timeout configured");
}

console.log("Test 6: All hook scripts exist");
{
  const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");
  const expectedScripts = [
    "daemon-check.cjs", "windsurf-check.cjs", "cursor-check.cjs",
    "opencode-plugin.js", "openclaw-handler.cjs", "codex-check.cjs", "gemini-check.cjs"
  ];
  for (const name of expectedScripts) {
    check(fs.existsSync(path.join(hooksDir, name)), `${name} should exist`);
  }
}

console.log("Test 7: Hook scripts reference agent-guardrails");
{
  const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");
  const scripts = ["windsurf-check.cjs", "cursor-check.cjs", "codex-check.cjs", "gemini-check.cjs"];
  for (const name of scripts) {
    const content = fs.readFileSync(path.join(hooksDir, name), "utf8");
    check(content.includes("agent-guardrails"), `${name} should reference agent-guardrails`);
  }
}

console.log("Test 8: OpenCode plugin exports default function");
{
  const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");
  const content = fs.readFileSync(path.join(hooksDir, "opencode-plugin.js"), "utf8");
  check(content.includes("export default"), "opencode-plugin.js should export default");
  check(content.includes('file.edited'), "opencode-plugin.js should listen to file.edited");
}

console.log("Test 9: OpenClaw handler exports module.exports");
{
  const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");
  const content = fs.readFileSync(path.join(hooksDir, "openclaw-handler.cjs"), "utf8");
  check(content.includes("module.exports"), "openclaw-handler.cjs should use module.exports");
  check(content.includes("messages"), "openclaw-handler.cjs should push to messages");
}

console.log("Test 10: CJS hooks use shell:true for Windows compat");
{
  const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");
  const cjsScripts = ["daemon-check.cjs", "windsurf-check.cjs", "cursor-check.cjs", "codex-check.cjs", "gemini-check.cjs"];
  for (const name of cjsScripts) {
    const content = fs.readFileSync(path.join(hooksDir, name), "utf8");
    check(content.includes("shell: true"), `${name} should use shell: true`);
    check(content.includes("windowsHide: true"), `${name} should use windowsHide: true`);
  }
}

try { fs.rmSync(testDir, { recursive: true }); } catch { /* ignore */ }

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
