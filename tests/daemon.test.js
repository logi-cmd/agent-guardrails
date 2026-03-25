import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  isDaemonRunning,
  getDaemonConfig,
  writeDaemonConfig
} from "../lib/commands/daemon.js";
import {
  createInfoStore
} from "../lib/daemon/worker.js";

// Default config values for testing
const DEFAULT_WATCH_PATHS = ["src/", "lib/", "tests/"];
const DEFAULT_CHECK_INTERVAL = 5000;
const DEFAULT_BLOCK_ON_HIGH_RISK = true;
const DEFAULT_AUTO_FIX = false;

// ============================================================
// Helper Functions
// ============================================================

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-daemon-"));
}

function cleanupTempDir(tempDir) {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function ensureGuardrailsDir(tempDir) {
  const dir = path.join(tempDir, ".agent-guardrails");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ============================================================
// Tests
// ============================================================

async function testIsDaemonRunningWhenNotRunning() {
  const tempDir = createTempDir();
  try {
    const result = isDaemonRunning(tempDir);
    assert.equal(result.running, false, "Should report not running when no PID file exists");
    console.log("✅ testIsDaemonRunningWhenNotRunning passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testIsDaemonRunningWithStalePidFile() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);

    // Write a stale PID file with a non-existent PID
    const pidFile = path.join(tempDir, ".agent-guardrails", "daemon.pid");
    fs.writeFileSync(pidFile, "999999999");

    const result = isDaemonRunning(tempDir);
    assert.equal(result.running, false, "Should report not running when PID doesn't exist");

    // PID file should be cleaned up
    assert.equal(fs.existsSync(pidFile), false, "Stale PID file should be removed");
    console.log("✅ testIsDaemonRunningWithStalePidFile passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testGetDaemonConfigReturnsDefaults() {
  const tempDir = createTempDir();
  try {
    const config = getDaemonConfig(tempDir);

    assert.deepEqual(config.watchPaths, DEFAULT_WATCH_PATHS, "Should return default watch paths");
    assert.equal(config.checkInterval, DEFAULT_CHECK_INTERVAL, "Should return default check interval");
    assert.equal(config.blockOnHighRisk, DEFAULT_BLOCK_ON_HIGH_RISK, "Should return default blockOnHighRisk");
    console.log("✅ testGetDaemonConfigReturnsDefaults passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testGetDaemonConfigMergesWithDefaults() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);

    // Write a custom config that only overrides some values
    const configFile = path.join(tempDir, ".agent-guardrails", "daemon.json");
    const customConfig = {
      checkInterval: 10000,
      watchPaths: ["custom/src/"]
    };
    fs.writeFileSync(configFile, JSON.stringify(customConfig));

    const config = getDaemonConfig(tempDir);

    // Custom values should be applied
    assert.deepEqual(config.watchPaths, ["custom/src/"], "Should use custom watch paths");
    assert.equal(config.checkInterval, 10000, "Should use custom check interval");

    // Default values should still be present for unmodified fields
    assert.equal(config.blockOnHighRisk, DEFAULT_BLOCK_ON_HIGH_RISK, "Should keep default blockOnHighRisk");
    assert.equal(config.autoFix, DEFAULT_AUTO_FIX, "Should keep default autoFix");
    console.log("✅ testGetDaemonConfigMergesWithDefaults passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testWriteDaemonConfig() {
  const tempDir = createTempDir();
  try {
    const customConfig = {
      enabled: true,
      watchPaths: ["src/", "lib/"],
      ignorePatterns: ["node_modules"],
      autoCheckOn: ["file-change"],
      checkInterval: 3000,
      notifications: { sound: true, desktop: false },
      autoFix: true,
      blockOnHighRisk: false
    };

    writeDaemonConfig(tempDir, customConfig);

    const configFile = path.join(tempDir, ".agent-guardrails", "daemon.json");
    assert.ok(fs.existsSync(configFile), "Config file should be created");

    const readConfig = JSON.parse(fs.readFileSync(configFile, "utf8"));
    assert.deepEqual(readConfig, customConfig, "Config should be written correctly");
    console.log("✅ testWriteDaemonConfig passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testConfigCreatesDirectoryIfMissing() {
  const tempDir = createTempDir();
  try {
    // Ensure .agent-guardrails doesn't exist
    const guardrailsDir = path.join(tempDir, ".agent-guardrails");
    assert.equal(fs.existsSync(guardrailsDir), false, "Guardrails dir should not exist initially");

    writeDaemonConfig(tempDir, { checkInterval: 5000 });

    assert.ok(fs.existsSync(guardrailsDir), "Guardrails dir should be created");
    console.log("✅ testConfigCreatesDirectoryIfMissing passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testConfigHandlesInvalidJson() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);

    // Write invalid JSON
    const configFile = path.join(tempDir, ".agent-guardrails", "daemon.json");
    fs.writeFileSync(configFile, "{ invalid json }");

    const config = getDaemonConfig(tempDir);

    // Should fall back to defaults
    assert.deepEqual(config.watchPaths, DEFAULT_WATCH_PATHS, "Should return defaults when config is invalid");
    console.log("✅ testConfigHandlesInvalidJson passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testConfigHandlesEmptyPidFile() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);

    const pidFile = path.join(tempDir, ".agent-guardrails", "daemon.pid");
    fs.writeFileSync(pidFile, "");

    const result = isDaemonRunning(tempDir);
    assert.equal(result.running, false, "Should report not running with empty PID file");
    console.log("✅ testConfigHandlesEmptyPidFile passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testConfigHandlesNonNumericPid() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);

    const pidFile = path.join(tempDir, ".agent-guardrails", "daemon.pid");
    fs.writeFileSync(pidFile, "not-a-number");

    const result = isDaemonRunning(tempDir);
    assert.equal(result.running, false, "Should report not running with non-numeric PID");
    console.log("✅ testConfigHandlesNonNumericPid passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testStartTimeNotOverwritten() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);
    const infoFile = path.join(tempDir, ".agent-guardrails", "daemon-info.json");
    const fixedStart = "2026-01-01T00:00:00.000Z";

    const store = createInfoStore(infoFile, fixedStart);

    // First save
    store.save();
    const first = JSON.parse(fs.readFileSync(infoFile, "utf8"));
    assert.equal(first.startTime, fixedStart, "startTime should be the fixed value");

    // Increment and save again
    store.incrementChecks();
    store.save();
    const second = JSON.parse(fs.readFileSync(infoFile, "utf8"));
    assert.equal(second.startTime, fixedStart, "startTime should NOT change after increment");
    assert.equal(second.checksRun, 1, "checksRun should be 1 after increment");

    console.log("✅ testStartTimeNotOverwritten passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testWindowsPidExactMatch() {
  const tempDir = createTempDir();
  try {
    ensureGuardrailsDir(tempDir);

    // Write a PID that is a substring of another valid PID
    const pidFile = path.join(tempDir, ".agent-guardrails", "daemon.pid");
    fs.writeFileSync(pidFile, "123");

    const result = isDaemonRunning(tempDir);
    // PID 123 is very unlikely to be running on any system, so this should be false
    assert.equal(result.running, false, "PID 123 should not falsely match other processes");

    console.log("✅ testWindowsPidExactMatch passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

async function testFallbackWatcherDetectsChange() {
  const tempDir = createTempDir();
  try {
    const watchDir = path.join(tempDir, "watched");
    fs.mkdirSync(watchDir, { recursive: true });

    const { createWatcher } = await import("../lib/daemon/worker.js");
    const config = {
      watchPaths: ["watched/"],
      ignorePatterns: ["node_modules"],
      checkInterval: 100
    };

    const changes = [];
    let resolveWatch;
    const watchReady = new Promise((r) => { resolveWatch = r; });

    const watcher = await createWatcher(tempDir, config, (filePath) => {
      changes.push(filePath);
      if (changes.length >= 1) resolveWatch();
    }, () => {});

    // Create a file to trigger the watcher
    const testFile = path.join(watchDir, "test-change.js");
    fs.writeFileSync(testFile, "// test");

    // Wait for the event (with timeout)
    const { setTimeout: delay } = await import("node:timers/promises");
    await Promise.race([watchReady, delay(2000)]);

    watcher.close();
    assert.ok(changes.length > 0, `Fallback watcher should detect file creation, got ${changes.length} changes`);

    console.log("✅ testFallbackWatcherDetectsChange passed");
  } finally {
    cleanupTempDir(tempDir);
  }
}

// ============================================================
// Run Tests
// ============================================================

export async function run() {
  console.log("\n🧪 Daemon Mode Tests\n");

  const tests = [
    testIsDaemonRunningWhenNotRunning,
    testIsDaemonRunningWithStalePidFile,
    testGetDaemonConfigReturnsDefaults,
    testGetDaemonConfigMergesWithDefaults,
    testWriteDaemonConfig,
    testConfigCreatesDirectoryIfMissing,
    testConfigHandlesInvalidJson,
    testConfigHandlesEmptyPidFile,
    testConfigHandlesNonNumericPid,
    testStartTimeNotOverwritten,
    testWindowsPidExactMatch,
    testFallbackWatcherDetectsChange
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name} failed: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    throw new Error(`${failed} daemon test(s) failed`);
  }
}
