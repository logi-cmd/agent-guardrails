import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInit } from "../lib/commands/init.js";
import {
  finishAgentNativeLoop,
  startAgentNativeLoop
} from "../lib/runtime/agent-loop.js";

async function initRepo(tempDir) {
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });
}

export async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-agent-loop-"));
  await initRepo(tempDir);

  fs.mkdirSync(path.join(tempDir, "src", "auth"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "auth", "service.js"), "export const auth = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "auth.test.js"), "export const ok = true;\n", "utf8");

  const start = startAgentNativeLoop({
    repoRoot: tempDir,
    taskRequest: "Refine auth flow internals",
    selectedFiles: ["src/auth/service.js"],
    changedFiles: ["src/auth/service.js", "tests/auth.test.js"]
  });

  assert.equal(start.contract.task, "Refine auth flow internals");
  assert.equal(typeof start.session.sessionId, "string");
  assert.equal(start.contractPath, ".agent-guardrails/task-contract.json");
  assert.equal(start.evidenceFiles[0].created, true);
  assert.match(start.finishCheck.recommendedCommand, /agent-guardrails check --review --base-ref origin\/main/);
  assert.match(start.loop.nextActions.join("\n"), /Run required commands: npm test/);

  const evidenceFile = path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md");
  assert.equal(fs.existsSync(evidenceFile), true);
  assert.match(fs.readFileSync(evidenceFile, "utf8"), /# Task Evidence/);

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/auth/service.js", "tests/auth.test.js"].join(path.delimiter);

  try {
    const finish = await finishAgentNativeLoop({
      repoRoot: tempDir,
      commandsRun: ["npm test"],
      evidence: {
        notableResults: ["Auth tests stayed green after the refactor."],
        reviewNotes: ["Stayed inside the existing auth service and test files."],
        residualRisk: "none"
      }
    });

    assert.equal(finish.checkResult.ok, true);
    assert.equal(finish.reviewerSummary.status, "pass");
    assert.equal(finish.evidenceFiles[0].updated, true);
    assert.match(finish.reviewerSummary.nextActions.join("\n"), /before merge/i);
    assert.match(fs.readFileSync(evidenceFile, "utf8"), /Auth tests stayed green after the refactor\./);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
  }
}
