import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck } from "../lib/commands/check.js";
import { runInit } from "../lib/commands/init.js";
import { runPlan } from "../lib/commands/plan.js";
import { ossDetectors } from "../lib/check/detectors/oss.js";
import { listChangedFiles } from "../lib/utils.js";

function captureLogs(run) {
  const original = console.log;
  let output = "";
  let result;
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return (async () => {
    try {
      result = await run();
      return { output, result };
    } finally {
      console.log = original;
    }
  })();
}

async function initRepo(tempDir) {
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });
}

function setAllowedPaths(tempDir, allowedPaths) {
  const configPath = path.join(tempDir, ".agent-guardrails", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  config.checks.allowedPaths = allowedPaths;
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function updateConfig(tempDir, updater) {
  const configPath = path.join(tempDir, ".agent-guardrails", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  updater(config);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

async function withRepoCwd(tempDir, callback) {
  const original = process.cwd();
  process.chdir(tempDir);
  try {
    return await callback();
  } finally {
    process.chdir(original);
  }
}

async function checkFailsWithoutTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-fail-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = "src/service.js";
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, false);
    assert.match(output, /Source files changed without any accompanying test changes/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkPassesWithTests() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-pass-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, true);
    assert.match(output, /All baseline guardrail checks passed/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
  }
}

async function checkFailsWhenOutsideAllowedPaths() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-scope-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "notes.md"), "# note\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js${path.delimiter}docs/notes.md`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, false);
    assert.match(output, /Changed files outside allowed paths: docs\/notes\.md/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkFailsWhenOutsideTaskContract() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-contract-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", "docs/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "notes.md"), "# note\n", "utf8");

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update the service logic only",
        "allow-paths": "src/,tests/"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js${path.delimiter}docs/notes.md`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, false);
    assert.match(output, /Changed files outside task contract paths: docs\/notes\.md/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkFailsWhenOutsideIntendedFiles() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-intended-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", "docs/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "docs", "notes.md"), "# note\n", "utf8");

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update the service logic only",
        "allow-paths": "src/,tests/,docs/",
        "intended-files": "src/service.js,tests/service.test.js"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js${path.delimiter}docs/notes.md`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, false);
    assert.match(output, /Changed files outside intended files: docs\/notes\.md/);
    assert.equal(result.review.summary.scopeIssues, 1);
    assert.equal(result.findings.some((finding) => finding.code === "intended-file-violation"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkFailsWhenRequiredCommandsAreMissing() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-commands-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", ".agent-guardrails/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update the service logic only",
        "allow-paths": "src/,tests/",
        "required-commands": "npm test,npm run lint",
        evidence: ".agent-guardrails/evidence/current-task.md"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test" }, locale: "en" }))
    );

    assert.equal(result.ok, false);
    assert.match(output, /Missing required commands from task contract: npm run lint/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkFailsWhenEvidenceIsMissing() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-evidence-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", ".agent-guardrails/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update the service logic only",
        "allow-paths": "src/,tests/",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test" }, locale: "en" }))
    );

    assert.equal(result.ok, false);
    assert.match(output, /Missing required evidence files: \.agent-guardrails\/evidence\/current-task\.md/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkPassesWhenTaskRequirementsAreSatisfied() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-task-reqs-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", ".agent-guardrails/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update the service logic only",
        "allow-paths": "src/,tests/",
        "required-commands": "npm test,npm run lint",
        evidence: ".agent-guardrails/evidence/current-task.md"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test,npm run lint" }, locale: "en" }))
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.requiredCommands, ["npm test", "npm run lint"]);
    assert.deepEqual(result.commandsRun, ["npm test", "npm run lint"]);
    assert.deepEqual(result.missingEvidencePaths, []);
    assert.match(result.finishCheck.recommendedCommand, /agent-guardrails check --review --base-ref origin\/main --commands-run "npm test, npm run lint"/);
    assert.match(output, /Task required commands: 2/);
    assert.match(output, /Missing evidence files: 0/);
    assert.match(output, /Risk dimensions:/);
    assert.match(output, /Security requirements:/);
    assert.match(output, /Dependency requirements:/);
    assert.match(output, /Performance requirements:/);
    assert.match(output, /Understanding requirements:/);
    assert.match(output, /Continuity requirements:/);
    assert.match(output, /Finish-time command:/);
    assert.match(result.runtime.nextActions.join("\n"), /Keep security, dependency, performance, understanding, continuity concerns explicit/i);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkFailsWhenProtectedAreaNeedsRiskAndReviewNotes() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-protected-area-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", ".agent-guardrails/"]);
  updateConfig(tempDir, (config) => {
    config.protectedAreas = [
      {
        path: "src/auth/",
        label: "auth flows",
        minimumRiskLevel: "high",
        requiresReviewNotes: true
      }
    ];
  });

  fs.mkdirSync(path.join(tempDir, "src", "auth"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "auth", "service.js"), "export const login = () => true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "auth.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Update auth flow\n- Commands run: npm test\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update auth flow",
        "allow-paths": "src/,tests/",
        "risk-level": "medium",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/auth/service.js${path.delimiter}tests/auth.test.js`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test" }, locale: "en" }))
    );

    assert.equal(result.ok, false);
    assert.match(output, /Protected area touched without sufficient task risk level: auth flows/);
    assert.match(output, /High-risk area changed without review-oriented notes in evidence: auth flows/);
    assert.equal(result.review.summary.riskConcerns, 4);
    assert.equal(result.continuity.continuityBreaks.some((item) => item.code === "protected-structure-changed"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkFailsWhenChangeTypesViolateContract() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-change-types-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src", "contracts"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "contracts", "public-api.ts"), "export type ApiShape = { ok: boolean };\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update implementation only",
        "allow-paths": "src/,tests/",
        "allowed-change-types": "implementation-only"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = [
    "src/service.js",
    "src/contracts/public-api.ts",
    "tests/service.test.js"
  ].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, false);
    assert.match(output, /Changed files violate the declared change types/);
    assert.equal(result.findings.some((finding) => finding.code === "change-type-violation"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkIgnoresTheGeneratedTaskContractFile() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-ignore-contract-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", ".agent-guardrails/"]);
  updateConfig(tempDir, (config) => {
    config.languagePlugins = {};
    config.checks.correctness.requireCommandsReported = false;
    config.checks.correctness.requireEvidenceFiles = false;
  });

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Update the service logic only",
        "allow-paths": "src/,tests/"
      }
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = [
    "src/service.js",
    "tests/service.test.js",
    ".agent-guardrails/task-contract.json"
  ].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, true);
    assert.match(output, /All baseline guardrail checks passed/);
    assert.match(result.finishCheck.nextActions.join("\n"), /Keep security, dependency, performance, understanding, continuity concerns explicit/i);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkUsesBaseRefDiff() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-base-ref-"));
  await initRepo(tempDir);
  process.env.AGENT_GUARDRAILS_BASE_REF_CHANGED_FILES = [
    "src/service.js",
    "tests/service.test.js"
  ].join(path.delimiter);

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "base-ref": "HEAD~1" }, locale: "en" }))
    );

    assert.equal(result.ok, true);
    assert.match(output, /Diff source: git diff HEAD~1\.\.\.HEAD/);
    assert.match(output, /Changed files: 2/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_BASE_REF_CHANGED_FILES;
  }
}

async function checkFailsForInvalidBaseRef() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-bad-base-ref-"));
  await initRepo(tempDir);
  process.env.AGENT_GUARDRAILS_BASE_REF_ERROR = 'Unable to diff against base ref "does-not-exist": mock failure';

  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "base-ref": "does-not-exist" }, locale: "en" }))
    );

    assert.equal(result.ok, false);
    assert.match(output, /Unable to diff against base ref "does-not-exist"/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_BASE_REF_ERROR;
    process.exitCode = 0;
  }
}

async function checkFailsOutsideGitContextWithoutBaseRef() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-no-git-"));
  await initRepo(tempDir);

  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () => captureLogs(() => runCheck({ locale: "en" })));

    assert.equal(result.ok, false);
    assert.match(output, /Unable to inspect working-tree changes/);
  } finally {
    process.exitCode = 0;
  }
}

async function checkPrintsJsonOutput() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-json-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const ok = true;\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.js${path.delimiter}tests/service.test.js`;
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { json: true }, locale: "en" }))
    );
    const parsed = JSON.parse(output.trim());

    assert.equal(result.ok, true);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.preset, "node-service");
    assert.equal(parsed.diffSource, "working tree");
    assert.deepEqual(parsed.changedFiles, ["src/service.js", "tests/service.test.js"]);
    assert.equal(parsed.counts.changedFiles, 2);
    assert.equal(parsed.counts.testFiles, 1);
    assert.deepEqual(parsed.requiredCommands, []);
    assert.deepEqual(parsed.evidencePaths, []);
    assert.doesNotMatch(output, /Agent Guardrails Check/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkPrintsJsonFailures() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-json-fail-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = "src/service.js";
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { json: true }, locale: "en" }))
    );
    const parsed = JSON.parse(output.trim());

    assert.equal(result.ok, false);
    assert.equal(parsed.ok, false);
    assert.equal(process.exitCode, 1);
    assert.match(parsed.failures[0], /Source files changed without any accompanying test changes/);
    assert.equal(parsed.counts.changedFiles, 1);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkPrintsReviewOutput() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-review-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const x = 1;\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = "src/service.js";
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { review: true }, locale: "en" }))
    );

    assert.equal(result.ok, false);
    assert.equal(result.verdict, "Validation incomplete");
    assert.match(output, /Review summary:/);
    assert.match(output, /Verdict: Validation incomplete/);
    assert.match(output, /Missing validation:/);
    assert.match(output, /\[error\] Source files changed without any accompanying test changes/);
    assert.match(output, /Finish-time command:/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkMarksProductionReadyChangesAsSafeToDeploy() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-deploy-ready-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/", ".agent-guardrails/"]);
  updateConfig(tempDir, (config) => {
    config.criticalPaths = ["src/orders/"];
    config.performanceSensitiveAreas = ["src/orders/"];
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "refund.js"), "export const refund = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "refund.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund flow\n- Commands run: npm test\n- Notable results: Refund tests passed, performance stayed stable, and reliability under concurrency did not change.\n- Review notes: Structured refund log remains intact, monitoring still covers the path, and concurrency validation stayed within the expected load-sensitive path.\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund flow",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund.js,tests/refund.test.js",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        "production-profile": "high-throughput-api",
        "nfr-requirements": "performance,reliability",
        "expected-load-sensitive-paths": "src/orders/refund.js",
        "expected-concurrency-impact": "No shared mutable state should be introduced",
        "observability-requirements": "Structured refund log remains intact",
        "rollback-notes": "Revert refund transition patch only"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/orders/refund.js", "tests/refund.test.js"].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { review: true, "commands-run": "npm test" }, locale: "en" }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.verdict, "Safe to deploy");
    assert.equal(result.deployReadiness.status, "ready");
    assert.equal(result.postDeployMaintenance.observabilityStatus, "covered");
    assert.match(result.deployReadiness.checklist.join("\n"), /Rollback path recorded/i);
    assert.match(result.postDeployMaintenance.operatorNextActions.join("\n"), /rollback path/i);
    assert.match(output, /Verdict: Safe to deploy/);
    assert.match(output, /Deploy readiness:/);
    assert.match(output, /Post-deploy maintenance:/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkAddsContinuityGuidanceForParallelAbstraction() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-continuity-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "service.js"), "export const order = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "orders", "helper.js"), "export const helper = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "orders.test.js"), "export const ok = true;\n", "utf8");

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine order flow internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/service.js,tests/orders.test.js"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = [
    "src/orders/service.js",
    "src/orders/helper.js",
    "tests/orders.test.js"
  ].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { review: true }, locale: "en" }))
    );

    assert.equal(result.ok, false);
    assert.equal(result.findings.some((finding) => finding.code === "intended-file-violation"), true);
    assert.equal(result.findings.some((finding) => finding.code === "continuity-parallel-abstraction"), true);
    assert.equal(
      result.findings.find((finding) => finding.code === "continuity-parallel-abstraction")?.severity,
      "warning"
    );
    assert.deepEqual(result.continuity.reuseTargets.map((item) => item.value), ["src/orders/service.js", "tests/orders.test.js"]);
    assert.deepEqual(result.continuity.newSurfaceFiles, ["src/orders/helper.js"]);
    assert.equal(result.continuity.continuityBreaks.some((item) => item.code === "broadened-beyond-intended"), true);
    assert.equal(result.continuity.continuityBreaks.some((item) => item.code === "parallel-abstraction-likely"), true);
    assert.match(result.continuity.futureMaintenanceRisks.join("\n"), /parallel abstraction/i);
    assert.match(output, /Continuity guidance:/);
    assert.match(output, /Reuse targets:/);
    assert.match(output, /Future maintenance risk:/);
    assert.match(output, /src\/orders\/helper\.js/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkPrintsContinuityAndPerformanceReviewGroups() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-review-groups-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src", "state"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "assets"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "state", "store.js"), "export const store = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "state", "reducer.js"), "export const reducer = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "state", "hook.js"), "export const useStore = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "assets", "large.png"), Buffer.alloc(300 * 1024, 1));
  fs.writeFileSync(path.join(tempDir, "tests", "state.test.js"), "export const ok = true;\n", "utf8");

  updateConfig(tempDir, (config) => {
    config.checks.performance = { enabled: true };
  });

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = [
    "src/state/store.js",
    "src/state/reducer.js",
    "src/state/hook.js",
    "src/assets/large.png",
    "tests/state.test.js"
  ].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { review: true }, locale: "en" }))
    );

    assert.ok(result.review.summary.continuityConcerns >= 1);
    assert.ok(result.review.summary.performanceConcerns >= 1);
    assert.ok(result.findings.length >= result.review.continuityConcerns.length);
    assert.match(output, /Continuity concerns:/);
    assert.match(output, /Performance concerns: [1-9]/);
    assert.match(output, /Continuity concerns:/);
    assert.match(output, /Performance concerns/);
    assert.match(output, /3\+ files changed touch state management scope|State-related file modified/);
    assert.match(output, /Large asset file added/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkLocalizesDetectorMessagesInChinese() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-check-zh-detectors-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src", "state"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "async"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "assets"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "state", "store.js"), "export const store = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "state", "reducer.js"), "export const reducer = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "state", "hook.js"), "export const useStore = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, "src", "async", "workflow.js"),
    [
      "export function runWorkflow(task) {",
      "  return Promise.resolve(task)",
      "    .then((value) => value)",
      "    .then((value) => value)",
      "    .then((value) => value);",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "src", "assets", "large.png"), Buffer.alloc(300 * 1024, 1));
  fs.writeFileSync(path.join(tempDir, "tests", "state.test.js"), "export const ok = true;\n", "utf8");

  updateConfig(tempDir, (config) => {
    config.checks.performance = { enabled: true };
  });

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = [
    "src/state/store.js",
    "src/state/reducer.js",
    "src/state/hook.js",
    "src/async/workflow.js",
    "src/assets/large.png",
    "tests/state.test.js"
  ].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { review: true }, locale: "zh-CN" }))
    );

    assert.equal(result.findings.some((finding) => finding.code === "state-mgmt-complexity-multi-file"), true);
    assert.equal(result.findings.some((finding) => finding.code === "async-risk-nested-then"), true);
    assert.equal(result.findings.some((finding) => finding.code === "perf-degradation-large-asset"), true);
    assert.match(
      result.findings.find((finding) => finding.code === "state-mgmt-complexity-multi-file")?.message ?? "",
      /同目录下 3\+ 文件变更涉及状态管理范围/
    );
    assert.match(
      result.findings.find((finding) => finding.code === "async-risk-nested-then")?.message ?? "",
      /在 src\/async\/workflow\.js 中检测到嵌套 \.then\(\) 链（3 层）/
    );
    assert.match(
      result.findings.find((finding) => finding.code === "perf-degradation-large-asset")?.message ?? "",
      /新增了大型资源文件/
    );
    assert.match(output, /连续性问题：/);
    assert.match(output, /同目录下 3\+ 文件变更涉及状态管理范围|状态相关文件被修改：/);
    assert.match(output, /在 src\/async\/workflow\.js 中检测到嵌套 \.then\(\) 链（3 层）/);
    assert.match(output, /新增了大型资源文件/);
    assert.match(output, /检测到异步逻辑风险模式，请确认已正确处理并发/);
    assert.match(output, /检测到文件大幅增长，请确认是否需要拆分/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkMutationTestingIsSilentWhenDisabled() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-mutation-off-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "flag.js"), "export const enabled = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "flag.test.js"), "export const ok = true;\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/flag.js", "tests/flag.test.js"].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test" }, locale: "en" }))
    );

    assert.equal(result.ok, true);
    assert.equal(
      result.findings.some((finding) => finding.code === "mutation-survivors-detected"),
      false,
      "Mutation testing should not produce findings when disabled (default)"
    );
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkMutationTestingWarnsOnSurvivingMutations() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-mutation-on-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(tempDir, "src", "calc.js"),
    [
      "export const enabled = true;",
      "export const total = 1 + 2;",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "calc.test.js"), "export const ok = true;\n", "utf8");

  fs.writeFileSync(path.join(tempDir, "_test_pass.cjs"), "process.exit(0);\n", "utf8");

  updateConfig(tempDir, (config) => {
    config.checks.mutation = {
      enabled: true,
      testCommand: "node _test_pass.cjs",
      maxMutations: 10,
      survivalThreshold: 90,
      timeoutMs: 10000
    };
  });

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/calc.js", "tests/calc.test.js"].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { output, result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test" }, locale: "en" }))
    );

    const mutationFinding = result.findings.find((f) => f.code === "mutation-survivors-detected");
    assert.ok(mutationFinding, "Expected a mutation-survivors-detected finding when enabled and mutations survive");
    assert.equal(mutationFinding.severity, "warning");
    assert.equal(mutationFinding.category, "validation");
    assert.match(mutationFinding.message, /surviving/i);
    assert.ok(mutationFinding.files.length > 0, "Finding should reference source files with survivors");
    assert.ok(
      result.review.summary.validationIssues >= 1,
      "Mutation survivors should appear in validation review bucket"
    );
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkMutationTestingWarnsWhenBaselineFails() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-mutation-baseline-fail-"));
  await initRepo(tempDir);
  setAllowedPaths(tempDir, ["src/", "tests/"]);

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "calc.js"), "export const enabled = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "calc.test.js"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "_test_fail.cjs"), "process.exit(1);\n", "utf8");

  updateConfig(tempDir, (config) => {
    config.checks.mutation = {
      enabled: true,
      testCommand: "node _test_fail.cjs",
      maxMutations: 10,
      timeoutMs: 10000
    };
  });

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = ["src/calc.js", "tests/calc.test.js"].join(path.delimiter);
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { "commands-run": "npm test" }, locale: "en" }))
    );

    const mutationFinding = result.findings.find((f) => f.code === "mutation-test-error");
    assert.ok(mutationFinding, "Expected mutation-test-error finding when baseline test command fails");
    assert.equal(mutationFinding.severity, "warning");
    assert.equal(mutationFinding.category, "validation");
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function checkMutationTesterReturnsBaselineFailureDirectly() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-mutation-unit-fail-"));
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "flag.js"), "export const enabled = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "fail.cjs"), "process.exit(1);\n", "utf8");

  const { runMutationTests } = await import("../lib/check/mutation-tester.js");
  const result = await runMutationTests({
    repoRoot: tempDir,
    changedFiles: ["src/flag.js"],
    testCommand: "node fail.cjs",
    maxMutations: 5,
    timeoutMs: 5000
  });

  assert.equal(result.baselineOk, false);
  assert.equal(result.total, 0);
  assert.equal(result.score, null);
  assert.equal(result.errors, 1);
}

async function checkMutationTesterCountsSurvivorsDirectly() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-mutation-unit-pass-"));
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "math.js"),
    [
      "export const enabled = true;",
      "export function total() {",
      "  return 1 + 2;",
      "}",
      ""
    ].join("\n"),
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "pass.cjs"), "process.exit(0);\n", "utf8");

  const { runMutationTests } = await import("../lib/check/mutation-tester.js");
  const result = await runMutationTests({
    repoRoot: tempDir,
    changedFiles: ["src/math.js"],
    testCommand: "node pass.cjs",
    maxMutations: 5,
    timeoutMs: 5000
  });

  assert.equal(result.baselineOk, true);
  assert.ok(result.total > 0);
  assert.ok(result.survived >= 1);
  assert.equal(typeof result.score, "number");
}

async function checkMutationOssDetectorWarnsOnSurvivorsDirectly() {
  const detector = ossDetectors.find((item) => item.name === "mutation-test-quality");
  assert.ok(detector, "Expected mutation-test-quality detector to be registered");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-oss-detector-"));
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "flag.js"), "export const enabled = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "pass.cjs"), "process.exit(0);\n", "utf8");

  const findings = [];
  await detector.run({
    context: {
      repoRoot: tempDir,
      sourceFiles: ["src/flag.js"],
      config: {
        checks: {
          mutation: {
            enabled: true,
            testCommand: "node pass.cjs",
            maxMutations: 5,
            survivalThreshold: 100,
            timeoutMs: 5000
          }
        }
      }
    },
    addFinding(finding) {
      findings.push(finding);
    },
    t(key, values = {}) {
      if (key === "findings.mutation-test-error") return "Mutation baseline failed.";
      if (key === "actions.reviewMutationConfig") return "Review mutation config.";
      if (key === "actions.reviewMutationSurvivors") return "Review mutation survivors.";
      if (key === "findings.mutation-survivors-detected") {
        return `${values.survived}/${values.total} mutations survived (${values.score}% kill rate). Sample: ${values.sample}`;
      }
      return key;
    }
  });

  assert.equal(findings.some((finding) => finding.code === "mutation-survivors-detected"), true);
}

async function listChangedFilesKeepsLeadingCharacterFromGitPorcelain() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-changed-files-"));

  execFileSync("git", ["init"], { cwd: tempDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "agent-guardrails@example.com"], { cwd: tempDir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Agent Guardrails"], { cwd: tempDir, stdio: "ignore" });

  fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "lib"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "docs", "notes.md"), "# notes\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "lib", "feature.js"), "export const feature = true;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "feature.test.js"), "export const ok = true;\n", "utf8");
  execFileSync("git", ["add", "."], { cwd: tempDir, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "seed"], { cwd: tempDir, stdio: "ignore" });

  fs.writeFileSync(path.join(tempDir, "docs", "notes.md"), "# notes updated\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "lib", "feature.js"), "export const feature = false;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "feature.test.js"), "export const ok = false;\n", "utf8");

  const result = listChangedFiles(tempDir);

  assert.equal(result.error, null);
  assert.deepEqual(result.files.sort(), ["docs/notes.md", "lib/feature.js", "tests/feature.test.js"]);
}

export async function run() {
  await checkFailsWithoutTests();
  await checkPassesWithTests();
  await checkFailsWhenOutsideAllowedPaths();
  await checkFailsWhenOutsideTaskContract();
  await checkFailsWhenOutsideIntendedFiles();
  await checkFailsWhenRequiredCommandsAreMissing();
  await checkFailsWhenEvidenceIsMissing();
  await checkPassesWhenTaskRequirementsAreSatisfied();
  await checkFailsWhenProtectedAreaNeedsRiskAndReviewNotes();
  await checkFailsWhenChangeTypesViolateContract();
  await checkIgnoresTheGeneratedTaskContractFile();
  await checkUsesBaseRefDiff();
  await checkFailsForInvalidBaseRef();
  await checkFailsOutsideGitContextWithoutBaseRef();
  await checkPrintsJsonOutput();
  await checkPrintsJsonFailures();
  await checkPrintsReviewOutput();
  await checkMarksProductionReadyChangesAsSafeToDeploy();
  await checkAddsContinuityGuidanceForParallelAbstraction();
  await checkPrintsContinuityAndPerformanceReviewGroups();
  await checkLocalizesDetectorMessagesInChinese();
  await checkMutationTestingIsSilentWhenDisabled();
  await checkMutationTestingWarnsOnSurvivingMutations();
  await checkMutationTestingWarnsWhenBaselineFails();
  await checkMutationTesterReturnsBaselineFailureDirectly();
  await checkMutationTesterCountsSurvivorsDirectly();
  await checkMutationOssDetectorWarnsOnSurvivorsDirectly();
  await listChangedFilesKeepsLeadingCharacterFromGitPorcelain();
}
