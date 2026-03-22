import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCheck } from "../commands/check.js";
import { runInit } from "../commands/init.js";
import { runPlan } from "../commands/plan.js";

function deepMerge(base, patch) {
  if (Array.isArray(patch)) {
    return [...patch];
  }

  if (!patch || typeof patch !== "object") {
    return patch;
  }

  const result = { ...(base ?? {}) };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = deepMerge(result[key], value);
  }

  return result;
}

function withMutedConsole(run) {
  const original = console.log;
  let output = "";
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(run)
    .then((result) => ({ output, result }))
    .finally(() => {
      console.log = original;
    });
}

function withRepoCwd(repoRoot, run) {
  const originalCwd = process.cwd();
  process.chdir(repoRoot);

  return Promise.resolve()
    .then(run)
    .finally(() => {
      process.chdir(originalCwd);
    });
}

function writeScenarioFiles(repoRoot, files) {
  for (const [relativePath, content] of Object.entries(files ?? {})) {
    const absolutePath = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
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

function stageLocalPluginPackage(repoRoot, tempDir, pluginName) {
  if (!pluginName?.startsWith("@agent-guardrails/")) {
    return false;
  }

  const localName = pluginName.slice("@agent-guardrails/".length);
  const sourceDir = path.join(repoRoot, "plugins", localName);
  if (!fs.existsSync(sourceDir)) {
    return false;
  }

  const targetDir = path.join(tempDir, "node_modules", "@agent-guardrails", localName);
  copyDirectoryRecursive(sourceDir, targetDir);
  return true;
}

function patchConfig(repoRoot, configPatch) {
  if (!configPatch) {
    return;
  }

  const configPath = path.join(repoRoot, ".agent-guardrails", "config.json");
  const currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const nextConfig = deepMerge(currentConfig, configPatch);
  if (Object.hasOwn(configPatch, "languagePlugins")) {
    nextConfig.languagePlugins = deepMerge({}, configPatch.languagePlugins);
  }
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
}

function normalizeReviewExpectation(reviewSummary) {
  return {
    scopeIssues: reviewSummary?.scopeIssues ?? 0,
    validationIssues: reviewSummary?.validationIssues ?? 0,
    consistencyConcerns: reviewSummary?.consistencyConcerns ?? 0,
    riskConcerns: reviewSummary?.riskConcerns ?? 0
  };
}

function evaluateScenario(result, scenario) {
  assert.equal(result.ok, scenario.expected.ok, `Scenario "${scenario.name}" produced an unexpected pass/fail result.`);

  for (const code of scenario.expected.findingCodes ?? []) {
    assert.equal(
      result.findings.some((finding) => finding.code === code),
      true,
      `Scenario "${scenario.name}" is missing expected finding code "${code}".`
    );
  }

  const minimumReview = normalizeReviewExpectation(scenario.expected.minimumReviewSummary);
  assert.ok(result.review.summary.scopeIssues >= minimumReview.scopeIssues, `Scenario "${scenario.name}" has too few scope findings.`);
  assert.ok(result.review.summary.validationIssues >= minimumReview.validationIssues, `Scenario "${scenario.name}" has too few validation findings.`);
  assert.ok(result.review.summary.consistencyConcerns >= minimumReview.consistencyConcerns, `Scenario "${scenario.name}" has too few consistency findings.`);
  assert.ok(result.review.summary.riskConcerns >= minimumReview.riskConcerns, `Scenario "${scenario.name}" has too few risk findings.`);
}

function validateScenarioManifest(scenario, filePath) {
  const required = ["name", "tier", "status", "goal"];
  for (const key of required) {
    if (!scenario[key]) {
      throw new Error(`Scenario "${filePath}" is missing required field "${key}".`);
    }
  }

  if (scenario.status === "active") {
    const activeRequired = ["preset", "planFlags", "files", "changedFiles", "expected"];
    for (const key of activeRequired) {
      if (scenario[key] == null) {
        throw new Error(`Active scenario "${scenario.name}" is missing "${key}".`);
      }
    }
  }

  if (scenario.status === "planned" && !scenario.plugin) {
    throw new Error(`Planned scenario "${scenario.name}" must declare a target plugin or pro surface.`);
  }
}

export function listBenchmarkScenarios(repoRoot) {
  const benchmarkRoot = path.join(repoRoot, "benchmarks");
  const tiers = fs.existsSync(benchmarkRoot)
    ? fs.readdirSync(benchmarkRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
    : [];

  return tiers.flatMap((tier) => {
    const tierRoot = path.join(benchmarkRoot, tier);
    return fs.readdirSync(tierRoot)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => {
        const filePath = path.join(tierRoot, entry);
        const scenario = JSON.parse(fs.readFileSync(filePath, "utf8"));
        validateScenarioManifest(scenario, filePath);
        return {
          ...scenario,
          filePath
        };
      });
  });
}

export async function runActiveScenario(repoRoot, scenario) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `agent-guardrails-benchmark-${scenario.name}-`));
  const originalChangedFiles = process.env.AGENT_GUARDRAILS_CHANGED_FILES;
  process.exitCode = 0;

  try {
    await withMutedConsole(() =>
      runInit({
        positional: [tempDir],
        flags: { preset: scenario.preset, lang: "en" },
        locale: "en"
      })
    );

    patchConfig(tempDir, scenario.configPatch);
    writeScenarioFiles(tempDir, scenario.files);
    if (scenario.plugin) {
      stageLocalPluginPackage(repoRoot, tempDir, scenario.plugin);
    }

    await withRepoCwd(tempDir, () =>
      withMutedConsole(() =>
        runPlan({
          positional: [],
          flags: {
            ...scenario.planFlags,
            lang: "en"
          },
          locale: "en"
        })
      )
    );

    process.env.AGENT_GUARDRAILS_CHANGED_FILES = scenario.changedFiles.join(path.delimiter);

    const checkResult = await withRepoCwd(tempDir, () =>
      withMutedConsole(() =>
        runCheck({
          flags: {
            json: true,
            ...(scenario.commandsRun?.length > 0
              ? { "commands-run": scenario.commandsRun.join(",") }
              : {})
          },
          locale: "en"
        })
      )
    );

    evaluateScenario(checkResult.result, scenario);
    return {
      name: scenario.name,
      tier: scenario.tier,
      status: "passed",
      plugins: checkResult.result.plugins,
      reviewSummary: checkResult.result.review.summary,
      findingCodes: checkResult.result.findings.map((finding) => finding.code)
    };
  } finally {
    if (originalChangedFiles === undefined) {
      delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    } else {
      process.env.AGENT_GUARDRAILS_CHANGED_FILES = originalChangedFiles;
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exitCode = 0;
  }
}

export async function runBenchmarkSuite(repoRoot, { tier = "all" } = {}) {
  const scenarios = listBenchmarkScenarios(repoRoot).filter((scenario) => tier === "all" || scenario.tier === tier);
  const activeScenarios = scenarios.filter((scenario) => scenario.status === "active");
  const plannedScenarios = scenarios.filter((scenario) => scenario.status === "planned");
  const results = [];

  for (const scenario of activeScenarios) {
    results.push(await runActiveScenario(repoRoot, scenario));
  }

  return {
    tier,
    counts: {
      total: scenarios.length,
      active: activeScenarios.length,
      planned: plannedScenarios.length,
      passed: results.length
    },
    activeResults: results,
    plannedScenarios: plannedScenarios.map((scenario) => ({
      name: scenario.name,
      tier: scenario.tier,
      plugin: scenario.plugin
    }))
  };
}
