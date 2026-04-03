import assert from "node:assert";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const daemonPath = path.resolve(__dirname, "..", "lib", "commands", "daemon.js");
const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");

export async function run() {
  let passed = 0;
  let failed = 0;

  function check(condition, msg) {
    if (condition) { passed++; }
    else { failed++; console.log(`  FAIL: ${msg}`); }
  }

  console.log("\n[daemon-hooks.test.js]");

  // Test 1: daemon.js exports all required inject/remove functions
  console.log("Test 1: daemon.js contains all inject/remove functions for 5 agents + Git");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const requiredFunctions = [
      "injectClaudeHook", "removeClaudeHook",
      "injectCursorHook", "removeCursorHook",
      "injectOpenCodeHook", "removeOpenCodeHook",
      "injectCodexHook", "removeCodexHook",
      "injectGeminiHook", "removeGeminiHook",
      "injectGitHook", "removeGitHook"
    ];
    for (const fn of requiredFunctions) {
      check(content.includes(`function ${fn}`), `should define ${fn}`);
    }
  }

  // Test 2: AGENT_HOOKS array has exactly 6 entries (5 agents + Git)
  console.log("Test 2: AGENT_HOOKS array has 6 entries (5 agents + Git)");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const agentNames = [
      "Claude Code", "Cursor", "OpenCode", "Codex CLI", "Gemini CLI", "Git"
    ];
    for (const name of agentNames) {
      check(content.includes(`name: "${name}"`), `AGENT_HOOKS should include ${name}`);
    }
    // Verify removed agents are NOT present
    const removed = ["Windsurf", "OpenHands", "OpenClaw"];
    for (const name of removed) {
      check(!content.includes(`name: "${name}"`), `AGENT_HOOKS should NOT include ${name}`);
    }
  }

  // Test 3: startDaemon returns injected list
  console.log("Test 3: startDaemon returns injected list");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("injected"), "startDaemon should track injected agents");
    check(content.includes("injected:"), "startDaemon should return injected list");
  }

  // Test 4: stopDaemon calls all remove functions
  console.log("Test 4: stopDaemon calls all remove functions");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("for (const agent of AGENT_HOOKS)"), "should iterate AGENT_HOOKS");
    check(content.includes("agent.remove(repoRoot)"), "should call remove on each agent");
  }

  // Test 5: inject functions have idempotency checks
  console.log("Test 5: inject functions have idempotency checks");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("DAEMON_HOOK_ID"), "Claude hook should use DAEMON_HOOK_ID for idempotency");
    check(content.includes("alreadyInjected"), "should have idempotency check for Cursor/Codex");
    check(content.includes('matcher: "Edit|Write|MultiEdit|Bash"'), "Claude daemon hook should include Bash matcher");
  }

  // Test 6: Core hook scripts exist and are non-empty
  console.log("Test 6: Core hook scripts exist and are non-empty");
  {
    const scripts = [
      "daemon-check.cjs",
      "cursor-check.cjs",
      "opencode-plugin.js",
      "gemini-check.cjs",
      "shared-result-reader.cjs",
      "pre-commit-check.cjs"
    ];
    for (const name of scripts) {
      const filePath = path.join(hooksDir, name);
      const exists = fs.existsSync(filePath);
      check(exists, `${name} should exist`);
      if (exists) {
        const content = fs.readFileSync(filePath, "utf8");
        check(content.length > 50, `${name} should be non-trivial (${content.length} bytes)`);
      }
    }
  }

  // Test 7: showDaemonStatus shows active hooks
  console.log("Test 7: showDaemonStatus shows active hooks");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("activeHooks"), "status should show active hooks");
    check(content.includes("a.detect(repoRoot)"), "should detect agent configs");
  }

  // Test 8: startDaemon uses i18n for output
  console.log("Test 8: startDaemon uses i18n for output");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes('t("daemon.daemonRunningInfo"'), "should use i18n for daemon running info");
    check(content.includes('t("daemon.hooksInjected")'), "should use i18n for hooks injected");
  }

  // Test 9: Cursor inject uses .cjs file (not .sh)
  console.log("Test 9: Cursor inject uses .cjs file (not .sh)");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("cursor-check.cjs"), "Cursor should use .cjs hook");
    check(!content.includes("cursor-check.sh"), "Cursor should NOT reference .sh");
  }

  // Test 10: No duplicate removeDaemonRule in stopDaemon
  console.log("Test 10: No duplicate removeDaemonRule in stopDaemon");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const matches = content.match(/removeDaemonRule\(repoRoot\)/g) || [];
    check(matches.length <= 2, `removeDaemonRule should appear at most 2 times, found ${matches.length}`);
  }

  // Test 11: Daemon output uses i18n (no hardcoded Chinese)
  console.log("Test 11: Daemon output uses i18n (no hardcoded Chinese)");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(!content.includes("已注入的 Agent 钩子"), "should NOT have hardcoded Chinese in daemon.js");
    check(content.includes('t("daemon.hooksInjected")'), "should use i18n for hooks injected");
    check(content.includes('t("daemon.cleaningHooks")'), "should use i18n for cleaning message");
  }

  // Test 12: Removed agent functions do NOT exist
  console.log("Test 12: Removed agent inject/remove functions do NOT exist");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const removedFunctions = [
      "injectWindsurfHook", "removeWindsurfHook",
      "injectOpenHandsHook", "removeOpenHandsHook",
      "injectOpenClawHook", "removeOpenClawHook"
    ];
    for (const fn of removedFunctions) {
      check(!content.includes(`function ${fn}`), `should NOT define ${fn}`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} daemon-hooks test(s) failed`);
}
