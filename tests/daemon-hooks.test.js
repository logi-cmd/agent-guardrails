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

  console.log("Test 1: daemon.js contains all inject functions");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const requiredFunctions = [
      "injectWindsurfHook", "removeWindsurfHook",
      "injectCursorHook", "removeCursorHook",
      "injectOpenCodeHook", "removeOpenCodeHook",
      "injectOpenClawHook", "removeOpenClawHook",
      "injectCodexHook", "removeCodexHook",
      "injectGeminiHook", "removeGeminiHook",
      "injectOpenHandsHook", "removeOpenHandsHook"
    ];
    for (const fn of requiredFunctions) {
      check(content.includes(`function ${fn}`), `should define ${fn}`);
    }
  }

  console.log("Test 2: AGENT_HOOKS array has 8 entries");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const agentNames = [
      "Claude Code", "Windsurf", "Cursor", "OpenCode", "OpenClaw", "Codex CLI", "Gemini CLI", "OpenHands"
    ];
    for (const name of agentNames) {
      check(content.includes(`name: "${name}"`), `AGENT_HOOKS should include ${name}`);
    }
  }

  console.log("Test 3: startDaemon returns injected list");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("injected"), "startDaemon should track injected agents");
    check(content.includes("injected:"), "startDaemon should return injected list");
  }

  console.log("Test 4: stopDaemon calls all remove functions");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("for (const agent of AGENT_HOOKS)"), "should iterate AGENT_HOOKS");
    check(content.includes("agent.remove(repoRoot)"), "should call remove on each agent");
  }

  console.log("Test 5: inject functions have idempotency checks");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("DAEMON_HOOK_ID"), "Claude hook should use id for idempotency");
    check(content.includes("alreadyInjected"), "should have idempotency check for Windsurf/Cursor");
    check(content.includes("already exists"), "should have idempotency check");
  }

  console.log("Test 6: All hook scripts are non-empty");
  {
    const scripts = [
      "daemon-check.cjs", "windsurf-check.cjs", "cursor-check.cjs",
      "opencode-plugin.js", "openclaw-handler.cjs", "codex-check.cjs", "gemini-check.cjs", "openhands-check.cjs"
    ];
    for (const name of scripts) {
      const content = fs.readFileSync(path.join(hooksDir, name), "utf8");
      check(content.length > 50, `${name} should be non-trivial (${content.length} bytes)`);
    }
  }

  console.log("Test 7: showDaemonStatus shows active hooks");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("activeHooks"), "status should show active hooks via i18n");
    check(content.includes("a.detect(repoRoot)"), "should detect agent configs");
  }

  console.log("Test 8: startDaemon has emoji banner");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("🛡️"), "should show shield emoji");
    check(content.includes("✅"), "should show checkmark for injected agents");
    check(content.includes("hooksInjected"), "should use i18n for hooks summary");
  }

  console.log("Test 9: Windsurf/Cursor inject uses .cjs files");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(content.includes("windsurf-check.cjs"), "Windsurf should use .cjs hook");
    check(content.includes("cursor-check.cjs"), "Cursor should use .cjs hook");
    check(!content.includes("windsurf-check.sh"), "Windsurf should NOT reference .sh");
    check(!content.includes("cursor-check.sh"), "Cursor should NOT reference .sh");
  }

  console.log("Test 10: No duplicate removeDaemonRule in stopDaemon");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    const matches = content.match(/removeDaemonRule\(repoRoot\)/g) || [];
    check(matches.length <= 2, `removeDaemonRule should appear at most 2 times (inject+cleanup), found ${matches.length}`);
  }

  console.log("Test 11: Daemon output uses i18n (no hardcoded Chinese)");
  {
    const content = fs.readFileSync(daemonPath, "utf8");
    check(!content.includes("已注入的 Agent 钩子"), "should NOT have hardcoded Chinese in daemon.js");
    check(content.includes("t(\"daemon.hooksInjected\")"), "should use i18n for hooks injected");
    check(content.includes("t(\"daemon.cleaningHooks\")"), "should use i18n for cleaning message");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} daemon-hooks test(s) failed`);
}
