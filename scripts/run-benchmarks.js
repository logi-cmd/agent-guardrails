import path from "node:path";
import { fileURLToPath } from "node:url";
import { runBenchmarkSuite } from "../lib/benchmark/runner.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const summary = await runBenchmarkSuite(repoRoot);
const activeOss = summary.activeResults.filter((result) => result.tier === "oss");
const activePro = summary.activeResults.filter((result) => result.tier === "pro");

console.log("Agent Guardrails benchmark summary");
console.log(`- Total scenarios: ${summary.counts.total}`);
console.log(`- Active scenarios passed: ${summary.counts.passed}/${summary.counts.active}`);
console.log(`- Active OSS scenarios: ${activeOss.length}`);
console.log(`- Active Pro scenarios: ${activePro.length}`);
console.log(`- Planned Pro scenarios: ${summary.counts.planned}`);

for (const result of summary.activeResults) {
  console.log(`- PASS ${result.name} (${result.tier})`);
}

for (const scenario of summary.plannedScenarios) {
  console.log(`- PLANNED ${scenario.name} (${scenario.plugin})`);
}
