import assert from "node:assert";
import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const hooksDir = path.resolve(__dirname, "..", "lib", "daemon", "hooks");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "guardrails-hook-test-"));
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

export async function run() {
  let passed = 0;
  let failed = 0;

  function check(condition, msg) {
    if (condition) { passed++; }
    else { failed++; console.log(`  FAIL: ${msg}`); }
  }

  console.log("\n[daemon-check.test.js]");

  const testDir = createTempDir();

  console.log("Test 1: daemon-check.cjs uses shared-result-reader");
  {
    const content = fs.readFileSync(path.join(hooksDir, "daemon-check.cjs"), "utf8");
    check(content.includes("shared-result-reader"), "should import shared-result-reader");
    check(content.includes("getResult"), "should use getResult function");
    check(!content.includes("spawnSync"), "should NOT use spawnSync directly");
  }

  console.log("Test 2: daemon-check.cjs exits 2 on errors");
  {
    const content = fs.readFileSync(path.join(hooksDir, "daemon-check.cjs"), "utf8");
    check(content.includes("process.exit(2)"), "should exit 2 on errors");
    check(content.includes("process.exit(0)"), "should exit 0 on success/no data");
    check(content.includes("stderr"), "should write to stderr on errors");
  }

  console.log("Test 3: daemon-check.cjs respects CLAUDE_PROJECT_DIR");
  {
    const content = fs.readFileSync(path.join(hooksDir, "daemon-check.cjs"), "utf8");
    check(content.includes("CLAUDE_PROJECT_DIR"), "should read CLAUDE_PROJECT_DIR env var");
    check(content.includes("process.cwd()"), "should fallback to cwd");
  }

  console.log("Test 4: daemon-check.cjs returns exit 0 when no daemon-result.json");
  {
    const result = spawnSync("node", [path.join(hooksDir, "daemon-check.cjs")], {
      cwd: testDir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: testDir },
      encoding: "utf8",
      timeout: 15000
    });
    check(result.status === 0, `exit code should be 0 when no data, got ${result.status}`);
  }

  console.log("Test 5: All CJS hook scripts use shared-result-reader");
  {
    const cjsScripts = [
      "daemon-check.cjs", "cursor-check.cjs",
      "codex-check.cjs", "gemini-check.cjs", "pre-commit-check.cjs"
    ];
    for (const name of cjsScripts) {
      const content = fs.readFileSync(path.join(hooksDir, name), "utf8");
      check(
        content.includes("shared-result-reader") || content.includes("readDaemonResult"),
        `${name} should use shared result reader or equivalent`
      );
    }
  }

  console.log("Test 6: OpenCode plugin uses readDaemonResult (ESM equivalent)");
  {
    const content = fs.readFileSync(path.join(hooksDir, "opencode-plugin.js"), "utf8");
    check(content.includes("readDaemonResult"), "should have readDaemonResult function");
    check(content.includes("file.edited"), "should listen to file.edited events");
    check(content.includes("GuardrailsPlugin"), "should export named GuardrailsPlugin");
  }

  console.log("Test 7: All CJS hooks have i18n support");
  {
    const scripts = ["daemon-check.cjs", "cursor-check.cjs",
      "codex-check.cjs", "gemini-check.cjs"];
    for (const name of scripts) {
      const content = fs.readFileSync(path.join(hooksDir, name), "utf8");
      check(content.includes("LOCALE") || content.includes("msg"), `${name} should have i18n`);
    }
  }

  console.log("Test 8: pre-commit-check.cjs blocks on errors, warns on warnings");
  {
    const content = fs.readFileSync(path.join(hooksDir, "pre-commit-check.cjs"), "utf8");
    check(content.includes("exit(1)"), "should exit 1 to block commit on errors");
    check(content.includes("exit(0)"), "should exit 0 to allow commit");
    check(content.includes("shared-result-reader"), "should use shared-result-reader");
    check(content.includes("Commit blocked"), "should show commit blocked message");
  }

  console.log("Test 9: Hook scripts exist and are non-empty");
  {
    const scripts = [
      "daemon-check.cjs", "cursor-check.cjs",
      "opencode-plugin.js", "codex-check.cjs",
      "gemini-check.cjs", "pre-commit-check.cjs",
      "shared-result-reader.cjs"
    ];
    for (const name of scripts) {
      const filePath = path.join(hooksDir, name);
      const exists = fs.existsSync(filePath);
      check(exists, `${name} should exist`);
      if (exists) {
        const size = fs.statSync(filePath).size;
        check(size > 50, `${name} should be non-trivial (${size} bytes)`);
      }
    }
  }

  cleanupDir(testDir);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} daemon-check test(s) failed`);
}
