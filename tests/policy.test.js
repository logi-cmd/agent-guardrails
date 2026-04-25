import assert from "node:assert/strict";
import { requiredPaths } from "../lib/check/policy.js";

function testDefaultRequiredPaths() {
  assert.deepEqual(requiredPaths({}), [
    "AGENTS.md",
    "docs/PROJECT_STATE.md",
    "docs/PR_CHECKLIST.md",
    ".agent-guardrails/config.json"
  ]);
}

function testConfiguredRequiredPaths() {
  assert.deepEqual(
    requiredPaths({
      checks: {
        requiredPaths: [".agent-guardrails/config.json", " README.md ", "", null]
      }
    }),
    [".agent-guardrails/config.json", "README.md"]
  );
}

export async function run() {
  testDefaultRequiredPaths();
  testConfiguredRequiredPaths();
}
