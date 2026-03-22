import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runPlan } from "../../../lib/commands/plan.js";
import { runCheck } from "../../../lib/commands/check.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const exampleRoot = path.resolve(__dirname, "..");
const contractPath = ".agent-guardrails/demo-task-contract.json";

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

function ensureEvidenceFiles(evidencePaths, evidenceContent) {
  for (const evidencePath of evidencePaths) {
    const absolutePath = path.join(exampleRoot, evidencePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, evidenceContent || "demo evidence\n", "utf8");
  }
}

function cleanupEvidenceFiles(evidencePaths) {
  for (const evidencePath of evidencePaths) {
    const absolutePath = path.join(exampleRoot, evidencePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }
}

async function runCheckWithChangedFiles(changedFiles, commandsRun = []) {
  const originalCwd = process.cwd();
  const originalEnv = process.env.AGENT_GUARDRAILS_CHANGED_FILES;

  process.chdir(exampleRoot);
  process.env.AGENT_GUARDRAILS_CHANGED_FILES = changedFiles.join(path.delimiter);
  process.exitCode = 0;

  try {
    return await captureLogs(() =>
      runCheck({
        positional: [],
        flags: {
          "contract-path": contractPath,
          "commands-run": commandsRun.join(",")
        }
      })
    );
  } finally {
    process.chdir(originalCwd);
    if (originalEnv === undefined) {
      delete process.env.AGENT_GUARDRAILS_CHANGED_FILES;
    } else {
      process.env.AGENT_GUARDRAILS_CHANGED_FILES = originalEnv;
    }
    process.exitCode = 0;
  }
}

async function writeTaskContract(scenario) {
  const originalCwd = process.cwd();
  process.chdir(exampleRoot);

  try {
    return await captureLogs(() =>
      runPlan({
        positional: [],
        flags: {
          task: scenario.task,
          "allow-paths": scenario.allowedPaths.join(","),
          "required-commands": (scenario.requiredCommands ?? []).join(","),
          evidence: (scenario.evidencePaths ?? []).join(","),
          "contract-path": contractPath
        }
      })
    );
  } finally {
    process.chdir(originalCwd);
  }
}

function cleanupTaskContract() {
  const absoluteContractPath = path.join(exampleRoot, contractPath);
  if (fs.existsSync(absoluteContractPath)) {
    fs.unlinkSync(absoluteContractPath);
  }
}

async function runScenario(name) {
  const scenario = loadScenario(name);
  console.log(`\n=== ${scenario.name.toUpperCase()} ===`);
  console.log(scenario.description);

  try {
    const planRun = await writeTaskContract(scenario);
    process.stdout.write(planRun.output);

    ensureEvidenceFiles(scenario.evidencePaths ?? [], scenario.evidenceContent);
    const checkRun = await runCheckWithChangedFiles(
      scenario.changedFiles,
      scenario.commandsRun ?? []
    );
    process.stdout.write(checkRun.output);
    return checkRun.result;
  } finally {
    cleanupEvidenceFiles(scenario.evidencePaths ?? []);
    cleanupTaskContract();
  }
}

const mode = process.argv[2] || "all";
let exitCode = 0;

if (mode === "fail" || mode === "all") {
  const result = await runScenario("fail");
  if (result.ok) {
    console.error("Expected the fail scenario to fail, but it passed.");
    exitCode = 1;
  }
}

if (mode === "pass" || mode === "all") {
  const result = await runScenario("pass");
  if (!result.ok) {
    console.error("Expected the pass scenario to pass, but it failed.");
    exitCode = 1;
  }
}

process.exit(exitCode);
