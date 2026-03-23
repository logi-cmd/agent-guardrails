import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck } from "../lib/commands/check.js";
import { runInit } from "../lib/commands/init.js";
import { runPlan } from "../lib/commands/plan.js";

function captureLogs(run) {
  const original = console.log;
  let output = "";
  let result;
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(run)
    .then((value) => {
      result = value;
      return { output, result };
    })
    .finally(() => {
      console.log = original;
    });
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
    assert.match(output, /Finish-time command:/);
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
    assert.equal(result.review.summary.riskConcerns, 3);
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
    assert.match(output, /Review summary:/);
    assert.match(output, /Missing validation:/);
    assert.match(output, /\[error\] Source files changed without any accompanying test changes/);
    assert.match(output, /Finish-time command:/);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
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
}
