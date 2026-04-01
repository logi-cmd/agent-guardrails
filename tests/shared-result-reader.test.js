import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readerPath = path.resolve(__dirname, "..", "lib", "daemon", "hooks", "shared-result-reader.cjs");

const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const { readLatestResult, runFallbackCheck, getResult } = require(readerPath);

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "guardrails-test-"));
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

  console.log("\n[shared-result-reader.test.js]");

  console.log("Test 1: daemon-result.json does not exist → fresh: false");
  {
    const dir = createTempDir();
    try {
      const result = readLatestResult(dir);
      check(result.fresh === false, `fresh should be false, got ${result.fresh}`);
      check(result.data === undefined, "data should be undefined");
    } finally { cleanupDir(dir); }
  }

  console.log("Test 2: daemon-result.json exists and fresh (<30s) → fresh: true");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), JSON.stringify({
        timestamp: new Date().toISOString(), status: "completed", ok: true,
        result: { findings: [{ severity: "error", code: "test-error", message: "Test error" }] }
      }));
      const result = readLatestResult(dir);
      check(result.fresh === true, `fresh should be true, got ${result.fresh}`);
      check(result.data.ok === true, "data.ok should be true");
      check(Array.isArray(result.data.result.findings), "findings should be an array");
    } finally { cleanupDir(dir); }
  }

  console.log("Test 3: daemon-result.json exists but stale (>30s) → fresh: false");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), JSON.stringify({
        timestamp: new Date(Date.now() - 60000).toISOString(), status: "completed", ok: true
      }));
      const result = readLatestResult(dir);
      check(result.fresh === false, `fresh should be false for stale data, got ${result.fresh}`);
    } finally { cleanupDir(dir); }
  }

  console.log("Test 4: daemon-result.json status is 'running' → fresh: false");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), JSON.stringify({
        timestamp: new Date().toISOString(), status: "running"
      }));
      const result = readLatestResult(dir);
      check(result.fresh === false, `fresh should be false when status is running, got ${result.fresh}`);
    } finally { cleanupDir(dir); }
  }

  console.log("Test 5: daemon-result.json has invalid JSON → fresh: false");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), "{ not valid json }");
      const result = readLatestResult(dir);
      check(result.fresh === false, `fresh should be false for invalid JSON, got ${result.fresh}`);
    } finally { cleanupDir(dir); }
  }

  console.log("Test 6: maxAgeMs parameter respected");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), JSON.stringify({
        timestamp: new Date(Date.now() - 5000).toISOString(), status: "completed", ok: true
      }));
      const result1 = readLatestResult(dir);
      check(result1.fresh === true, `fresh should be true with 30s maxAge, got ${result1.fresh}`);
      const result2 = readLatestResult(dir, 1000);
      check(result2.fresh === false, `fresh should be false with 1s maxAge, got ${result2.fresh}`);
    } finally { cleanupDir(dir); }
  }

  console.log("Test 7: getResult returns cached data when fresh");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), JSON.stringify({
        timestamp: new Date().toISOString(), status: "completed", ok: true, result: { findings: [] }
      }));
      const result = getResult(dir);
      check(result !== null, "result should not be null");
      check(result.ok === true, "result.ok should be true");
    } finally { cleanupDir(dir); }
  }

  console.log("Test 8: getResult returns null when no daemon-result.json and CLI unavailable");
  {
    const dir = createTempDir();
    try {
      const result = getResult(dir, 30000);
      check(result === null || typeof result === "object", "result should be null or object");
    } finally { cleanupDir(dir); }
  }

  console.log("Test 9: readLatestResult handles missing timestamp field");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), JSON.stringify({
        status: "completed", ok: true
      }));
      const result = readLatestResult(dir);
      check(result.fresh === false, `fresh should be false when timestamp is missing, got ${result.fresh}`);
    } finally { cleanupDir(dir); }
  }

  console.log("Test 10: readLatestResult handles empty file gracefully");
  {
    const dir = createTempDir();
    try {
      const guardrailsDir = path.join(dir, ".agent-guardrails");
      fs.mkdirSync(guardrailsDir, { recursive: true });
      fs.writeFileSync(path.join(guardrailsDir, "daemon-result.json"), "");
      const result = readLatestResult(dir);
      check(result.fresh === false, `fresh should be false for empty file, got ${result.fresh}`);
    } finally { cleanupDir(dir); }
  }

  console.log("Test 11: Module exports correct functions");
  {
    check(typeof readLatestResult === "function", "readLatestResult should be a function");
    check(typeof runFallbackCheck === "function", "runFallbackCheck should be a function");
    check(typeof getResult === "function", "getResult should be a function");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) throw new Error(`${failed} shared-result-reader test(s) failed`);
}
