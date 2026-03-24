import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listBenchmarkScenarios, runBenchmarkSuite } from "../lib/benchmark/runner.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

export async function run() {
  const scenarios = listBenchmarkScenarios(repoRoot);
  const ossScenarios = scenarios.filter((scenario) => scenario.tier === "oss");
  const proScenarios = scenarios.filter((scenario) => scenario.tier === "pro");
  const activeScenarios = scenarios.filter((scenario) => scenario.status === "active");
  const plannedScenarios = scenarios.filter((scenario) => scenario.status === "planned");
  const activeProScenarios = proScenarios.filter((scenario) => scenario.status === "active");

  assert.ok(ossScenarios.length >= 5);
  assert.ok(proScenarios.length >= 4);
  assert.equal(ossScenarios.every((scenario) => scenario.status === "active"), true);
  assert.equal(ossScenarios.some((scenario) => scenario.name === "python-fastapi-deploy-ready-pass"), true);
  assert.equal(activeProScenarios.some((scenario) => scenario.name === "pattern-drift-failure"), true);
  assert.equal(activeProScenarios.some((scenario) => scenario.name === "interface-change-failure"), true);
  assert.equal(activeProScenarios.some((scenario) => scenario.name === "boundary-violation-failure"), true);
  assert.equal(activeProScenarios.some((scenario) => scenario.name === "source-to-test-semantic-relevance"), true);

  const summary = await runBenchmarkSuite(repoRoot);

  assert.equal(summary.counts.active, activeScenarios.length);
  assert.equal(summary.counts.planned, plannedScenarios.length);
  assert.equal(summary.counts.passed, activeScenarios.length);
  assert.equal(summary.activeResults.some((scenario) => scenario.name === "pattern-drift-failure"), true);
  assert.equal(summary.activeResults.some((scenario) => scenario.name === "python-fastapi-deploy-ready-pass"), true);
  assert.equal(summary.activeResults.some((scenario) => scenario.name === "interface-change-failure"), true);
  assert.equal(summary.activeResults.some((scenario) => scenario.name === "boundary-violation-failure"), true);
  assert.equal(summary.activeResults.some((scenario) => scenario.name === "source-to-test-semantic-relevance"), true);
}
