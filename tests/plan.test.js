import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInit } from "../lib/commands/init.js";
import { runPlan } from "../lib/commands/plan.js";
import { readConfig } from "../lib/utils.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OSS_REPO_ROOT = path.resolve(TEST_DIR, "..");

function captureLogs(run) {
  const original = console.log;
  let output = "";
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(run)
    .then(() => output)
    .finally(() => {
      console.log = original;
    });
}

function withMockInstalledPro(callback) {
  const packageDir = path.join(OSS_REPO_ROOT, "node_modules", "@agent-guardrails", "pro");
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
    name: "@agent-guardrails/pro",
    version: "0.0.0-test",
    type: "module",
    exports: {
      ".": "./index.js"
    }
  }, null, 2), "utf8");
  fs.writeFileSync(path.join(packageDir, "index.js"), [
    "export function planTaskShapes(intent, repoContext) {",
    "  return {",
    "    taskType: 'auth',",
    "    confidence: 0.91,",
    "    recommendedOptionId: 'auth-service-1',",
    "    shouldSplitImmediately: true,",
    "    options: [",
    "      {",
    "        id: 'auth-service-1',",
    "        title: 'Auth service first',",
    "        summary: 'Start in the auth service layer first.',",
    "        changeType: 'service',",
    "        likelyFiles: ['src/auth/service.js', 'tests/auth/service.test.js'],",
    "        validations: ['npm test', 'targeted auth tests'],",
    "        riskLevel: 'high',",
    "        safeBecause: 'Keeps the first pass inside auth service boundaries.',",
    "        contractDraft: {",
    "          allowedPaths: ['src/auth/', 'tests/auth/'],",
    "          requiredCommands: ['npm test'],",
    "          evidencePaths: ['.agent-guardrails/evidence/current-task.md'],",
    "          riskLevel: 'high'",
    "        }",
    "      },",
    "      {",
    "        id: 'auth-ui-2',",
    "        title: 'Auth UI first',",
    "        summary: 'Start from the login UI only.',",
    "        changeType: 'ui',",
    "        likelyFiles: ['src/components/LoginForm.jsx'],",
    "        validations: ['npm test'],",
    "        riskLevel: 'medium',",
    "        safeBecause: 'Avoids backend spillover in the first pass.',",
    "        contractDraft: {",
    "          allowedPaths: ['src/components/'],",
    "          requiredCommands: ['npm test'],",
    "          evidencePaths: ['.agent-guardrails/evidence/current-task.md'],",
    "          riskLevel: 'medium'",
    "        }",
    "      }",
    "    ]",
    "  };",
    "}",
    "export async function enrichReview(review) { return review; }",
    "export async function getProNextActions() { return []; }",
    "export async function formatProCategoryBreakdown() { return null; }",
    ""
  ].join("\n"), "utf8");

  try {
    return callback();
  } finally {
    fs.rmSync(packageDir, { recursive: true, force: true });
  }
}

export async function run() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plan-"));
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });

  const original = process.cwd();
  process.chdir(tempDir);

  const output = await captureLogs(() =>
    runPlan({
      positional: [],
      flags: {
        task: "Add refund status transitions",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund.js,tests/refund.test.js",
        "protected-paths": "src/contracts/",
        "allowed-change-types": "implementation-only",
        "risk-level": "high",
        "requires-review-notes": "true",
        "validation-profile": "strict",
        "required-commands": "npm test,npm run lint",
        evidence: "docs/checks.txt,.agent-guardrails/evidence/task.txt",
        "acknowledged-skips": "docs",
        "pattern-summary": "Reuse the existing order service and state-transition helpers.",
        "smallest-change": "Touch the refund transition logic and its focused tests only.",
        assumptions: "The refund status enum already exists",
        "acceptance-criteria": "Refund status is persisted,Refund transition emits an audit log",
        "non-goals": "No UI work",
        "expected-behavior-changes": "Refunded orders move to refunded state",
        "user-visible-effects": "Support agents see refunded status",
        "intended-symbols": "applyRefundTransition,assertRefundedOrder",
        "expected-public-surface-changes": "OrderStatus type remains unchanged",
        "expected-boundary-exceptions": "None",
        "expected-test-targets": "tests/refund.test.js",
        "production-profile": "high-throughput-api",
        "nfr-requirements": "performance,reliability",
        "expected-load-sensitive-paths": "src/orders/refund.js",
        "expected-concurrency-impact": "No shared mutable state should be introduced",
        "observability-requirements": "Structured refund log remains intact",
        "rollback-notes": "Revert refund transition patch only",
        "risk-justification": "Refund flows are financially sensitive",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.chdir(original);

  assert.match(output, /Agent Guardrails Task Brief/);
  assert.match(output, /Add refund status transitions/);
  assert.match(output, /Definition of done/);
  assert.match(output, /Task contract/);
  assert.match(output, /Allowed path: src/);
  assert.match(output, /Intended file: src[\\/]orders[\\/]refund\.js/);
  assert.match(output, /Protected path: src[\\/]contracts/);
  assert.match(output, /Allowed change type: implementation-only/);
  assert.match(output, /Risk level: high/);
  assert.match(output, /Review notes required: yes/);
  assert.match(output, /Validation profile: strict/);
  assert.match(output, /Required command: npm test/);
  assert.match(output, /Evidence path: docs[\\/]+checks\.txt/);
  assert.match(output, /Risk dimensions/);
  assert.match(output, /Security requirement:/);
  assert.match(output, /Dependency requirement:/);
  assert.match(output, /Performance requirement:/);
  assert.match(output, /Understanding requirement:/);
  assert.match(output, /Continuity requirement:/);
  assert.match(output, /Acceptance criterion: Refund status is persisted/);
  assert.match(output, /Production profile: high-throughput-api/);
  assert.match(output, /Non-functional requirement: performance/);
  assert.match(output, /Expected test target: tests[\\/]refund\.test\.js/);
  assert.match(output, /Rollback notes: Revert refund transition patch only/);
  assert.match(output, /Existing pattern summary: Reuse the existing order service and state-transition helpers/);
  assert.match(output, /Smallest viable change: Touch the refund transition logic and its focused tests only/);

  const contract = JSON.parse(
    fs.readFileSync(path.join(tempDir, ".agent-guardrails", "task-contract.json"), "utf8")
  );

  assert.equal(contract.schemaVersion, 3);
  assert.equal(contract.task, "Add refund status transitions");
  assert.deepEqual(contract.allowedPaths, ["src/", "tests/"]);
  assert.deepEqual(contract.intendedFiles, ["src/orders/refund.js", "tests/refund.test.js"]);
  assert.deepEqual(contract.protectedPaths, ["src/contracts/"]);
  assert.deepEqual(contract.allowedChangeTypes, ["implementation-only"]);
  assert.equal(contract.riskLevel, "high");
  assert.equal(contract.requiresReviewNotes, true);
  assert.equal(contract.validationProfile, "strict");
  assert.deepEqual(contract.requiredCommands, ["npm test", "npm run lint"]);
  assert.deepEqual(contract.evidencePaths, ["docs/checks.txt", ".agent-guardrails/evidence/task.txt"]);
  assert.deepEqual(contract.securityRequirements, ["Mention auth, secrets, permissions, and sensitive-data handling explicitly."]);
  assert.deepEqual(contract.dependencyRequirements, ["Mention new or upgraded packages, lockfile changes, and dependency impact explicitly."]);
  assert.deepEqual(contract.performanceRequirements, ["Mention latency, throughput, or hotspot validation in evidence."]);
  assert.deepEqual(contract.understandingRequirements, ["Explain the main tradeoffs so future maintainers can follow the change."]);
  assert.deepEqual(contract.continuityRequirements, ["Mention reuse targets and any deliberate continuity break in evidence."]);
  assert.deepEqual(contract.acknowledgedSkips, ["docs"]);
  assert.equal(contract.patternSummary, "Reuse the existing order service and state-transition helpers.");
  assert.equal(contract.smallestViableChange, "Touch the refund transition logic and its focused tests only.");
  assert.deepEqual(contract.assumptions, ["The refund status enum already exists"]);
  assert.deepEqual(contract.acceptanceCriteria, ["Refund status is persisted", "Refund transition emits an audit log"]);
  assert.deepEqual(contract.nonGoals, ["No UI work"]);
  assert.deepEqual(contract.expectedBehaviorChanges, ["Refunded orders move to refunded state"]);
  assert.deepEqual(contract.userVisibleEffects, ["Support agents see refunded status"]);
  assert.deepEqual(contract.intendedSymbols, ["applyRefundTransition", "assertRefundedOrder"]);
  assert.deepEqual(contract.expectedPublicSurfaceChanges, ["OrderStatus type remains unchanged"]);
  assert.deepEqual(contract.expectedBoundaryExceptions, ["None"]);
  assert.deepEqual(contract.expectedTestTargets, ["tests/refund.test.js"]);
  assert.equal(contract.productionProfile, "high-throughput-api");
  assert.deepEqual(contract.nfrRequirements, ["performance", "reliability"]);
  assert.deepEqual(contract.expectedLoadSensitivePaths, ["src/orders/refund.js"]);
  assert.equal(contract.expectedConcurrencyImpact, "No shared mutable state should be introduced");
  assert.deepEqual(contract.observabilityRequirements, ["Structured refund log remains intact"]);
  assert.equal(contract.rollbackNotes, "Revert refund transition patch only");
  assert.equal(contract.riskJustification, "Refund flows are financially sensitive");

  process.chdir(tempDir);
  const autoOutput = await captureLogs(() =>
    runPlan({
      positional: [],
      flags: {
        task: "Tighten refund guardrails",
        "risk-level": "standard",
        lang: "en"
      },
      locale: "en"
    })
  );
  process.chdir(original);

  const config = readConfig(tempDir);
  const autoContract = JSON.parse(
    fs.readFileSync(path.join(tempDir, ".agent-guardrails", "task-contract.json"), "utf8")
  );

  assert.match(autoOutput, /(Auto-filled from preset defaults|已按 preset 默认值自动补全)/);
  assert.match(autoOutput, /Session ID:/);
  assert.match(autoOutput, /Next actions/);
  assert.deepEqual(autoContract.allowedPaths, config.workflow.planDefaults.allowedPaths);
  assert.deepEqual(autoContract.requiredCommands, config.workflow.planDefaults.requiredCommands);
  assert.deepEqual(autoContract.evidencePaths, config.workflow.planDefaults.evidencePaths);
  assert.deepEqual(autoContract.securityRequirements, ["Mention auth, secrets, permissions, and sensitive-data handling explicitly."]);
  assert.deepEqual(autoContract.dependencyRequirements, ["Mention new or upgraded packages, lockfile changes, and dependency impact explicitly."]);
  assert.deepEqual(autoContract.performanceRequirements, ["Mention latency, throughput, or hotspot validation in evidence."]);
  assert.deepEqual(autoContract.understandingRequirements, ["Explain the main tradeoffs so future maintainers can follow the change."]);
  assert.deepEqual(autoContract.continuityRequirements, ["Mention reuse targets and any deliberate continuity break in evidence."]);
  assert.deepEqual(autoContract.autoFilledFields, [
    "allowed paths",
    "required commands",
    "evidence paths",
    "security requirements",
    "dependency requirements",
    "performance requirements",
    "understanding requirements",
    "continuity requirements"
  ]);
  assert.equal(typeof autoContract.session.sessionId, "string");
  assert.equal(autoContract.session.repoRoot, tempDir);
  assert.deepEqual(autoContract.session.requiredCommandsSuggested, config.workflow.planDefaults.requiredCommands);
  assert.equal(autoContract.session.evidencePathSuggested, config.workflow.planDefaults.evidencePaths[0]);
  assert.deepEqual(autoContract.session.riskDimensions.securityRequirements, ["Mention auth, secrets, permissions, and sensitive-data handling explicitly."]);
  assert.match(autoContract.session.finishCheckHints.join("\n"), /Finish with agent-guardrails check --review/i);

  const uninitializedDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plan-no-init-"));
  let error = null;
  process.chdir(uninitializedDir);
  try {
    await runPlan({
      positional: [],
      flags: { task: "Should fail without init", lang: "en" },
      locale: "en"
    });
  } catch (caught) {
    error = caught;
  } finally {
    process.chdir(original);
  }

  assert.ok(error instanceof Error);
  assert.match(error.message, /Run `agent-guardrails init/);

  const roughIntentDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plan-pro-"));
  await runInit({
    positional: [roughIntentDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });

  const planModuleUrl = pathToFileURL(path.join(OSS_REPO_ROOT, "lib", "commands", "plan.js")).href;
  const proJson = withMockInstalledPro(() => execFileSync("node", [
    "--input-type=module",
    "-e",
    [
      `import fs from "node:fs";`,
      `import path from "node:path";`,
      `import { runPlan } from ${JSON.stringify(planModuleUrl)};`,
      `process.chdir(${JSON.stringify(roughIntentDir)});`,
      `const original = console.log;`,
      `console.log = () => {};`,
      `const result = await runPlan({ positional: [], flags: { task: "fix auth login edge cases", json: true, yes: true, lang: "en" }, locale: "en" });`,
      `console.log = original;`,
      `const contract = JSON.parse(fs.readFileSync(path.join(${JSON.stringify(roughIntentDir)}, ".agent-guardrails", "task-contract.json"), "utf8"));`,
      `process.stdout.write(JSON.stringify({ result, contract }));`
    ].join("\n")
  ], { cwd: roughIntentDir, encoding: "utf8" }));
  const proParsed = JSON.parse(proJson);

  assert.equal(proParsed.result.status, "created");
  assert.equal(proParsed.result.riskLevel, "high");
  assert.deepEqual(proParsed.result.allowedPaths, ["src/auth/", "tests/auth/"]);
  assert.equal(proParsed.contract.proPlan.selectedOptionId, "auth-service-1");
  assert.equal(proParsed.contract.proPlan.recommendedOptionId, "auth-service-1");
  assert.equal(proParsed.contract.proPlan.options.length, 2);
  assert.equal(proParsed.contract.allowedPaths[0], "src/auth/");
}
