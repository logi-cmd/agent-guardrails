import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSemanticPlugins } from "../lib/check/plugins.js";
import { runCheck } from "../lib/commands/check.js";
import { runInit } from "../lib/commands/init.js";
import { runPlan } from "../lib/commands/plan.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

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

async function withRepoCwd(tempDir, callback) {
  const original = process.cwd();
  process.chdir(tempDir);
  try {
    return await callback();
  } finally {
    process.chdir(original);
  }
}

async function initRepo(tempDir) {
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service", lang: "en" },
    locale: "en"
  });
}

function updateConfig(tempDir, updater) {
  const configPath = path.join(tempDir, ".agent-guardrails", "config.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  updater(config);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

function copyDirectoryRecursive(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }
    fs.copyFileSync(sourcePath, targetPath);
  }
}

function stagePlugin(tempDir) {
  copyDirectoryRecursive(
    path.join(repoRoot, "plugins", "plugin-ts"),
    path.join(tempDir, "node_modules", "@agent-guardrails", "plugin-ts")
  );
}

async function fallbackLoadsLocalPluginFromSourceRepo() {
  const loaded = await loadSemanticPlugins({
    config: {
      languagePlugins: {
        typescript: ["@agent-guardrails/plugin-ts"]
      }
    },
    repoRoot
  });

  assert.equal(loaded.plugins[0].status, "loaded");
  assert.equal(loaded.plugins[0].source, "local-fallback");
  assert.ok(loaded.detectors.length >= 1);
}

async function missingPluginFallsBackToOssBaseline() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-missing-"));
  await initRepo(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-missing"] };
  });

  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "service.ts"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "service.test.ts"), "export const ok = true;\n", "utf8");

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/service.ts${path.delimiter}tests/service.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({ flags: { json: true }, locale: "en" }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.plugins[0].status, "missing");
    assert.equal(result.counts.missingPlugins, 1);
    assert.equal(result.counts.loadedPlugins, 0);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function pluginDetectsPatternDriftAndPreservesJsonShape() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-drift-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "refund-service.ts"), "function refundOrder() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "src", "orders", "refund-helper.ts"), "function buildRefundPayload() { return { ok: true }; }\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "refund-helper.test.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Add refund support\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Add refund support",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-helper.ts,tests/refund-helper.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-helper.ts${path.delimiter}tests/refund-helper.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.plugins[0].status, "loaded");
    assert.equal(result.plugins[0].source, "package");
    assert.equal(result.preset, "node-service");
    assert.equal(result.diffSource, "working tree");
    assert.equal(result.findings.some((finding) => finding.code === "pattern-drift-parallel-abstraction"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function correctedImplementationClearsPatternDriftFinding() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-pass-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "refund-service.ts"), "function refundOrder() { return true; }\n", "utf8");
  fs.writeFileSync(path.join(tempDir, "tests", "refund-service.test.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund support\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund support",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-service.ts,tests/refund-service.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-service.ts${path.delimiter}tests/refund-service.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "pattern-drift-parallel-abstraction"), false);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function implementationOnlyInterfaceDriftFails() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-interface-error-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-workflow.ts"),
    "export function buildRefundPayload() { return { ok: true }; }\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "refund-workflow.test.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund workflow internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund workflow internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-workflow.ts,tests/refund-workflow.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-workflow.ts${path.delimiter}tests/refund-workflow.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, false);
    assert.equal(result.findings.some((finding) => finding.code === "interface-drift-implementation-only"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function undocumentedInterfaceDriftWarnsOnly() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-interface-warning-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-workflow.ts"),
    "export function buildRefundPayload() { return { ok: true }; }\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "refund-workflow.test.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Extend refund workflow\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Extend refund workflow",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-workflow.ts,tests/refund-workflow.test.ts",
        "allowed-change-types": "interface-changing",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-workflow.ts${path.delimiter}tests/refund-workflow.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "interface-drift-undocumented-public-surface"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function expectedPublicSurfaceSuppressesUndocumentedWarning() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-interface-declared-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-workflow.ts"),
    "export function buildRefundPayload() { return { ok: true }; }\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "refund-workflow.test.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Extend refund workflow\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Extend refund workflow",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-workflow.ts,tests/refund-workflow.test.ts",
        "allowed-change-types": "interface-changing",
        "expected-public-surface-changes": "buildRefundPayload",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-workflow.ts${path.delimiter}tests/refund-workflow.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "interface-drift-undocumented-public-surface"), false);
    assert.equal(result.findings.some((finding) => finding.code === "interface-drift-unexpected-public-surface"), false);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function correctedImplementationClearsInterfaceDriftFinding() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-interface-pass-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-workflow.ts"),
    "function buildRefundPayload() { return { ok: true }; }\n\nfunction refundOrder() { return buildRefundPayload(); }\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "refund-workflow.test.ts"), "export const ok = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund workflow internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund workflow internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-workflow.ts,tests/refund-workflow.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-workflow.ts${path.delimiter}tests/refund-workflow.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "interface-drift-implementation-only"), false);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function boundaryViolationFailsOnForbiddenImport() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-boundary-error-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
    config.boundaries = [
      {
        from: "src/orders/controllers/",
        disallow: ["src/orders/data/"],
        label: "controller-to-data boundary"
      }
    ];
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders", "controllers"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "orders", "data"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "data", "refund-repo.ts"), "export function loadRefundRecords() { return []; }\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "controllers", "refund-controller.ts"),
    "import { loadRefundRecords } from \"../data/refund-repo\";\n\nfunction buildRefundResponse() {\n  return loadRefundRecords();\n}\n\nbuildRefundResponse();\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "refund-controller.test.ts"), "export const refundControllerCoverage = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund controller internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund controller internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/controllers/refund-controller.ts,tests/refund-controller.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/controllers/refund-controller.ts${path.delimiter}tests/refund-controller.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, false);
    assert.equal(result.findings.some((finding) => finding.code === "boundary-violation-forbidden-import"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function correctedImplementationClearsBoundaryViolationFinding() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-boundary-pass-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
    config.boundaries = [
      {
        from: "src/orders/controllers/",
        disallow: ["src/orders/data/"],
        label: "controller-to-data boundary"
      }
    ];
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders", "controllers"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "src", "orders", "services"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(tempDir, "src", "orders", "services", "refund-service.ts"), "export function loadRefundSummary() { return []; }\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "controllers", "refund-controller.ts"),
    "import { loadRefundSummary } from \"../services/refund-service\";\n\nfunction buildRefundResponse() {\n  return loadRefundSummary();\n}\n\nbuildRefundResponse();\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "refund-controller.test.ts"), "export const refundControllerCoverage = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund controller internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund controller internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/controllers/refund-controller.ts,tests/refund-controller.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/controllers/refund-controller.ts${path.delimiter}tests/refund-controller.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "boundary-violation-forbidden-import"), false);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function sourceTestRelevanceWarnsForWeakCoverage() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-source-test-warning-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-service.ts"),
    "function refundOrder() {\n  return { ok: true };\n}\n\nrefundOrder();\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "invoice-service.test.ts"), "export const invoiceCoverage = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund flow internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund flow internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-service.ts,tests/invoice-service.test.ts",
        "allowed-change-types": "implementation-only",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-service.ts${path.delimiter}tests/invoice-service.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "source-test-relevance-weak"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function expectedTestTargetsEscalateSourceTestMiss() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-source-test-error-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-service.ts"),
    "function refundOrder() {\n  return { ok: true };\n}\n\nrefundOrder();\n",
    "utf8"
  );
  fs.writeFileSync(path.join(tempDir, "tests", "invoice-service.test.ts"), "export const invoiceCoverage = true;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund flow internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund flow internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-service.ts,tests/invoice-service.test.ts",
        "allowed-change-types": "implementation-only",
        "expected-test-targets": "tests/refund-service.test.ts",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-service.ts${path.delimiter}tests/invoice-service.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, false);
    assert.equal(result.findings.some((finding) => finding.code === "source-test-relevance-missed-expected-targets"), true);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

async function correctedTestsClearSourceTestRelevanceFinding() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-plugin-source-test-pass-"));
  await initRepo(tempDir);
  stagePlugin(tempDir);

  updateConfig(tempDir, (config) => {
    config.checks.allowedPaths = ["src/", "tests/", ".agent-guardrails/"];
    config.languagePlugins = { typescript: ["@agent-guardrails/plugin-ts"] };
  });

  fs.mkdirSync(path.join(tempDir, "src", "orders"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
  fs.mkdirSync(path.join(tempDir, ".agent-guardrails", "evidence"), { recursive: true });
  fs.writeFileSync(
    path.join(tempDir, "src", "orders", "refund-service.ts"),
    "function refundOrder() {\n  return { ok: true };\n}\n\nrefundOrder();\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempDir, "tests", "refund-service.test.ts"),
    "import { strict as assert } from \"node:assert\";\n\nfunction refundOrder() {\n  return { ok: true };\n}\n\nassert.equal(refundOrder().ok, true);\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
    "# Task Evidence\n\n- Task: Refine refund flow internals\n- Commands run: npm test\n- Residual risk: none\n",
    "utf8"
  );

  await withRepoCwd(tempDir, () =>
    runPlan({
      positional: [],
      flags: {
        task: "Refine refund flow internals",
        "allow-paths": "src/,tests/",
        "intended-files": "src/orders/refund-service.ts,tests/refund-service.test.ts",
        "allowed-change-types": "implementation-only",
        "expected-test-targets": "tests/refund-service.test.ts",
        "required-commands": "npm test",
        evidence: ".agent-guardrails/evidence/current-task.md",
        lang: "en"
      },
      locale: "en"
    })
  );

  process.env.AGENT_GUARDRAILS_CHANGED_FILES = `src/orders/refund-service.ts${path.delimiter}tests/refund-service.test.ts`;
  process.exitCode = 0;

  try {
    const { result } = await withRepoCwd(tempDir, () =>
      captureLogs(() => runCheck({
        flags: { json: true, "commands-run": "npm test" },
        locale: "en"
      }))
    );

    assert.equal(result.ok, true);
    assert.equal(result.findings.some((finding) => finding.code === "source-test-relevance-weak"), false);
    assert.equal(result.findings.some((finding) => finding.code === "source-test-relevance-missed-expected-targets"), false);
  } finally {
    delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    process.exitCode = 0;
  }
}

export async function run() {
  await fallbackLoadsLocalPluginFromSourceRepo();
  await missingPluginFallsBackToOssBaseline();
  await pluginDetectsPatternDriftAndPreservesJsonShape();
  await correctedImplementationClearsPatternDriftFinding();
  await implementationOnlyInterfaceDriftFails();
  await undocumentedInterfaceDriftWarnsOnly();
  await expectedPublicSurfaceSuppressesUndocumentedWarning();
  await correctedImplementationClearsInterfaceDriftFinding();
  await boundaryViolationFailsOnForbiddenImport();
  await correctedImplementationClearsBoundaryViolationFinding();
  await sourceTestRelevanceWarnsForWeakCoverage();
  await expectedTestTargetsEscalateSourceTestMiss();
  await correctedTestsClearSourceTestRelevanceFinding();
}
