import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPlan } from "../../../lib/commands/plan.js";
import { runCheck } from "../../../lib/commands/check.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const exampleRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(exampleRoot, "..", "..");
const contractPath = ".agent-guardrails/demo-task-contract.json";
const evidencePath = ".agent-guardrails/evidence/current-task.md";
const baselineFiles = {
  "src/orders/refund-service.ts": "function refundOrder() {\n  return { ok: true, pattern: \"service\" };\n}\n",
  "tests/refund-service.test.ts": "export const refundServiceBaseline = true;\n"
};
const extraPathsToReset = [
  "src/orders/refund-helper.ts",
  "tests/refund-helper.test.ts",
  evidencePath,
  contractPath
];

function loadScenario(name) {
  const scenarioPath = path.join(exampleRoot, "scenarios", `${name}.json`);
  return JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
}

async function captureLogs(run) {
  const originalLog = console.log;
  let output = "";

  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  try {
    const result = await run();
    return { result, output };
  } finally {
    console.log = originalLog;
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

function stagePlugin() {
  const sourceDir = path.join(repoRoot, "plugins", "plugin-ts");
  const targetDir = path.join(exampleRoot, "node_modules", "@agent-guardrails", "plugin-ts");
  copyDirectoryRecursive(sourceDir, targetDir);
}

function writeFiles(files) {
  for (const [relativePath, content] of Object.entries(files ?? {})) {
    const absolutePath = path.join(exampleRoot, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content, "utf8");
  }
}

function removePaths(relativePaths) {
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(exampleRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      fs.rmSync(absolutePath, { recursive: true, force: true });
    }
  }
}

function resetWorkspace() {
  removePaths(extraPathsToReset);
  writeFiles(baselineFiles);
}

async function withExampleCwd(run) {
  const originalCwd = process.cwd();
  process.chdir(exampleRoot);
  try {
    return await run();
  } finally {
    process.chdir(originalCwd);
  }
}

async function writeTaskContract(scenario) {
  return withExampleCwd(() =>
    captureLogs(() =>
      runPlan({
        positional: [],
        flags: {
          task: scenario.task,
          "allow-paths": scenario.allowedPaths.join(","),
          "intended-files": scenario.intendedFiles.join(","),
          "allowed-change-types": "implementation-only",
          "required-commands": scenario.requiredCommands.join(","),
          evidence: scenario.evidencePaths.join(","),
          "contract-path": contractPath,
          lang: "en"
        },
        locale: "en"
      })
    )
  );
}

async function runCheckForScenario(scenario) {
  const originalChangedFiles = process.env.AGENT_GUARDRAILS_CHANGED_FILES;
  process.env.AGENT_GUARDRAILS_CHANGED_FILES = scenario.changedFiles.join(path.delimiter);
  process.exitCode = 0;

  try {
    return await withExampleCwd(() =>
      captureLogs(() =>
        runCheck({
          flags: {
            json: true,
            "contract-path": contractPath,
            "commands-run": scenario.commandsRun.join(",")
          },
          locale: "en"
        })
      )
    );
  } finally {
    if (originalChangedFiles === undefined) {
      delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    } else {
      process.env.AGENT_GUARDRAILS_CHANGED_FILES = originalChangedFiles;
    }
    process.exitCode = 0;
  }
}

function printScenarioSummary(result, scenario) {
  const findingCodes = result.findings.map((finding) => finding.code);
  console.log(`- Baseline merge gate ok: ${result.ok}`);
  console.log(`- Loaded plugins: ${result.plugins.filter((plugin) => plugin.status === "loaded").map((plugin) => plugin.name).join(", ") || "none"}`);
  console.log(`- Review summary: scope=${result.review.summary.scopeIssues}, validation=${result.review.summary.validationIssues}, consistency=${result.review.summary.consistencyConcerns}, risk=${result.review.summary.riskConcerns}`);
  console.log(`- Finding codes: ${findingCodes.join(", ") || "none"}`);

  assert.equal(result.ok, scenario.expectedOk, `Scenario ${scenario.name} produced an unexpected pass/fail result.`);
  if (scenario.expectFindingCode) {
    assert.equal(
      findingCodes.includes(scenario.expectFindingCode),
      true,
      `Scenario ${scenario.name} should emit ${scenario.expectFindingCode}.`
    );
    console.log(`- Proof signal: detected ${scenario.expectFindingCode}`);
    return;
  }

  assert.equal(
    findingCodes.includes("pattern-drift-parallel-abstraction"),
    false,
    `Scenario ${scenario.name} should clear the pattern drift finding.`
  );
  console.log("- Proof signal: no pattern drift finding remains");
}

async function runScenario(name) {
  const scenario = loadScenario(name);
  console.log(`\n=== ${scenario.name} ===`);
  console.log(scenario.description);

  resetWorkspace();
  stagePlugin();
  writeFiles(scenario.writes);
  writeFiles({ [evidencePath]: scenario.evidenceContent });

  const planRun = await writeTaskContract(scenario);
  process.stdout.write(planRun.output);

  const checkRun = await runCheckForScenario(scenario);
  printScenarioSummary(checkRun.result, scenario);
}

const mode = process.argv[2] || "all";
let exitCode = 0;

try {
  if (mode === "fail" || mode === "all") {
    await runScenario("fail");
  }

  if (mode === "pass" || mode === "all") {
    await runScenario("pass");
  }
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.stack : String(error));
} finally {
  resetWorkspace();
}

process.exit(exitCode);
