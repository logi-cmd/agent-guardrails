/**
 * Shared module for hooks to read daemon check results.
 * Avoids redundant check execution by reading cached daemon-result.json.
 * Zero external dependencies — Node.js built-ins only.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const RESULT_FILE = ".agent-guardrails/daemon-result.json";

/**
 * Read cached daemon result if fresh enough.
 * @param {string} projectDir - Project root directory
 * @param {number} maxAgeMs - Max age in ms (default 30000)
 * @returns {{ fresh: boolean, data?: object }}
 */
function readLatestResult(projectDir, maxAgeMs = 30000) {
  const resultPath = path.join(projectDir, RESULT_FILE);
  try {
    if (!fs.existsSync(resultPath)) return { fresh: false };
    const raw = fs.readFileSync(resultPath, "utf8");
    const data = JSON.parse(raw);
    // Reject stale results
    const age = Date.now() - new Date(data.timestamp).getTime();
    if (isNaN(age) || age > maxAgeMs) return { fresh: false };
    // Reject if check is still running
    if (data.status === "running") return { fresh: false };
    return { fresh: true, data };
  } catch {
    return { fresh: false };
  }
}

/**
 * Fallback: run independent check when cache miss.
 * @param {string} projectDir - Project root directory
 * @returns {object|null}
 */
function runFallbackCheck(projectDir) {
  const result = spawnSync("agent-guardrails check --json", {
    cwd: projectDir,
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
    shell: true
  });
  if (result.error || result.status !== 0) return null;
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    return null;
  }
}

/**
 * Main entry point: cache-first, fallback-second.
 * @param {string} projectDir - Project root directory
 * @param {number} maxAgeMs - Max cache age in ms (default 30000)
 * @returns {object|null}
 */
function getResult(projectDir, maxAgeMs = 30000) {
  const cached = readLatestResult(projectDir, maxAgeMs);
  if (cached.fresh) return cached.data;
  return runFallbackCheck(projectDir);
}

module.exports = {
  readLatestResult,
  runFallbackCheck,
  getResult
};
