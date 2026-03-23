import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInit } from "../lib/commands/init.js";
import { executeCheck } from "../lib/commands/check.js";
import {
  bootstrapTaskSession,
  prepareFinishCheck,
  readRepoGuardrails,
  suggestTaskContract
} from "../lib/runtime/service.js";
import { writeTaskContract } from "../lib/utils.js";

async function initRepo(tempDir) {
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });
}

export async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-runtime-"));
  await initRepo(tempDir);

  const guardrails = readRepoGuardrails(tempDir);
  assert.equal(guardrails.preset, "node-service");
  assert.deepEqual(guardrails.defaults.requiredCommands, ["npm test"]);

  const suggestion = suggestTaskContract({
    repoRoot: tempDir,
    flags: { task: "Refine auth flow internals" },
    selectedFiles: ["src/auth/service.js", "tests/auth.test.js"],
    changedFiles: ["src/auth/service.js", "tests/auth.test.js"]
  });

  assert.equal(suggestion.contract.riskLevel, "high");
  assert.equal(suggestion.contract.requiresReviewNotes, true);
  assert.deepEqual(suggestion.contract.intendedFiles, ["src/auth/service.js", "tests/auth.test.js"]);
  assert.deepEqual(suggestion.contract.allowedPaths, ["src/auth/", "tests/"]);
  assert.deepEqual(suggestion.contract.securityRequirements, ["Mention auth, secrets, permissions, and sensitive-data handling explicitly."]);
  assert.deepEqual(suggestion.contract.dependencyRequirements, ["Mention new or upgraded packages, lockfile changes, and dependency impact explicitly."]);
  assert.deepEqual(suggestion.contract.performanceRequirements, ["Mention latency, throughput, or hotspot validation in evidence."]);
  assert.deepEqual(suggestion.contract.understandingRequirements, ["Explain the main tradeoffs so future maintainers can follow the change."]);
  assert.deepEqual(suggestion.contract.continuityRequirements, ["Mention reuse targets and any deliberate continuity break in evidence."]);
  assert.equal(suggestion.contract.session.contractSource, "runtime-suggested");
  assert.equal(typeof suggestion.contract.session.sessionId, "string");
  assert.equal(suggestion.contract.session.repoRoot, tempDir);
  assert.deepEqual(suggestion.contract.session.requiredCommandsSuggested, ["npm test"]);
  assert.equal(suggestion.contract.session.evidencePathSuggested, ".agent-guardrails/evidence/current-task.md");
  assert.deepEqual(suggestion.contract.session.riskDimensions.securityRequirements, ["Mention auth, secrets, permissions, and sensitive-data handling explicitly."]);
  assert.deepEqual(suggestion.contract.session.riskDimensions.dependencyRequirements, ["Mention new or upgraded packages, lockfile changes, and dependency impact explicitly."]);
  assert.match(suggestion.contract.session.finishCheckHints.join("\n"), /Finish with agent-guardrails check --review/i);
  assert.match(suggestion.contract.session.finishCheckHints.join("\n"), /security, dependency, performance, understanding, and continuity concerns/i);
  assert.match(suggestion.contract.session.nextActions.join("\n"), /Run required commands: npm test/);
  assert.match(suggestion.contract.session.nextActions.join("\n"), /Keep security, dependency, performance, understanding, continuity concerns explicit/i);

  const bootstrap = bootstrapTaskSession({
    repoRoot: tempDir,
    flags: { task: "Refine auth flow internals" },
    selectedFiles: ["src/auth/service.js"],
    changedFiles: ["src/auth/service.js", "tests/auth.test.js"]
  });
  assert.equal(bootstrap.session.taskRequest, "Refine auth flow internals");
  assert.equal(bootstrap.session.selectedFiles.includes("src/auth/service.js"), true);
  assert.deepEqual(bootstrap.session.riskDimensions.securityRequirements, ["Mention auth, secrets, permissions, and sensitive-data handling explicitly."]);
  assert.match(bootstrap.session.nextActions.join("\n"), /security, dependency, performance, understanding, continuity concerns/i);

  const finishCheck = prepareFinishCheck({
    repoRoot: tempDir,
    session: suggestion.contract.session,
    commandsRun: ["npm test"],
    baseRef: "origin/main"
  });
  assert.match(finishCheck.recommendedCommand, /agent-guardrails check --review --base-ref origin\/main --commands-run "npm test"/);
  assert.match(finishCheck.nextActions.join("\n"), /Use this finish-time command/);
  assert.match(finishCheck.nextActions.join("\n"), /security, dependency, performance, understanding, continuity concerns/i);

  fs.mkdirSync(path.join(tempDir, "src", "auth"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "auth", "service.js"), "export const auth = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "auth.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Commands run: npm test\n- Review notes: Auth change reviewed.\n- Residual risk: none\n",
    "utf8"
  );

  writeTaskContract(tempDir, {
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    ...suggestion.contract
  });

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/auth/service.js", "tests/auth.test.js"].join(path.delimiter);
  process.env.AGENT_GUARDRAILS_COMMANDS_RUN = "npm test";

  try {
    const result = await executeCheck({ repoRoot: tempDir, locale: "en" });
    assert.equal(result.ok, true);
    assert.equal(result.runtime.status, "pass");
    assert.equal(Array.isArray(result.continuity.reuseTargets), true);
    assert.match(result.finishCheck.recommendedCommand, /agent-guardrails check --review --base-ref origin\/main --commands-run "npm test"/);
    assert.match(result.runtime.nextActions.join("\n"), /before merge/i);
    assert.match(result.runtime.nextActions.join("\n"), /Prefer extending the declared intended files/i);
    assert.match(result.runtime.nextActions.join("\n"), /security, dependency, performance, understanding, continuity concerns/i);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    delete process.env.AGENT_GUARDRAILS_COMMANDS_RUN;
  }
}
