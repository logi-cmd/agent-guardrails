import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

export async function run() {
  const packageJson = JSON.parse(read("package.json"));
  const readme = read("README.md");
  const roadmap = read("docs/ROADMAP.md");
  const benchmarks = read("docs/BENCHMARKS.md");
  const commercialization = read("docs/COMMERCIALIZATION.md");
  const semanticArchitecture = read("docs/SEMANTIC_ARCHITECTURE.md");
  const pilot = read("docs/REAL_REPO_PILOT.md");
  const troubleshooting = read("docs/TROUBLESHOOTING.md");
  const workflow = read(".github/workflows/guardrails.yml");
  const templateWorkflow = read("templates/base/workflows/agent-guardrails.yml");
  const zhReadme = read("docs/zh-CN/README.md");
  const zhStrategy = read("docs/zh-CN/PRODUCT_STRATEGY.md");
  const adapterDocs = [
    read("adapters/codex/README.md"),
    read("adapters/claude-code/README.md"),
    read("adapters/cursor/README.md"),
    read("adapters/openhands/README.md"),
    read("adapters/openclaw/README.md")
  ];

  assert.doesNotMatch(packageJson.repository.url, /example/);
  assert.match(packageJson.homepage, /^https:\/\/github\.com\//);
  assert.match(packageJson.bugs.url, /^https:\/\/github\.com\//);

  assert.match(readme, /## Supported Agents/);
  assert.match(readme, /## FAQ/);
  assert.match(readme, /## What This Proves/);
  assert.match(readme, /pattern-drift demo/);
  assert.match(readme, /interface drift/);
  assert.match(readme, /boundary-violation demo/);
  assert.match(readme, /source-test-relevance demo/);
  assert.match(readme, /REAL_REPO_PILOT/);
  assert.match(readme, /AGENT_GUARDRAILS_COMMANDS_RUN/);
  assert.match(readme, /agent-guardrails mcp/);
  assert.match(readme, /read_repo_guardrails/);
  assert.match(readme, /agent-guardrails plan --task "Add refund status transitions/);
  assert.match(readme, /By default, `plan` now fills in/);
  assert.match(readme, /--review/);
  assert.match(readme, /--lang zh-CN/);
  assert.match(readme, /tested in CI on Windows, Linux, and macOS/);
  assert.match(readme, /npx agent-guardrails/);
  assert.match(readme, /## Chinese Docs/);
  assert.match(readme, /## Open Source vs Pro/);
  assert.match(readme, /npm run benchmark/);
  assert.match(readme, /## Benchmarks/);
  assert.match(readme, /## Commercialization/);
  assert.match(readme, /\.agent-guardrails\/evidence\/current-task\.md/);
  assert.match(zhReadme, /中文概览/);
  assert.match(zhStrategy, /产品策略/);

  assert.match(roadmap, /## Phase 1 \(Shipped\)/);
  assert.match(roadmap, /## Phase 2 \(Shipped\)/);
  assert.match(roadmap, /## Phase 3 \(Next\)/);
  assert.match(roadmap, /detector pipeline foundation/);
  assert.match(benchmarks, /## OSS benchmark suite/);
  assert.match(benchmarks, /## Pro benchmark suite/);
  assert.match(benchmarks, /npm run demo:pattern-drift/);
  assert.match(benchmarks, /npm run demo:boundary-violation/);
  assert.match(benchmarks, /npm run demo:source-test-relevance/);
  assert.match(benchmarks, /active semantic proof/);
  assert.match(commercialization, /## OSS Core/);
  assert.match(commercialization, /## Pro Local/);
  assert.match(commercialization, /## Pro Cloud/);
  assert.match(semanticArchitecture, /## Detector pipeline/);
  assert.match(semanticArchitecture, /## Plugin interface/);
  assert.match(semanticArchitecture, /MCP server layer/);
  assert.match(semanticArchitecture, /plugins\/plugin-ts/);
  assert.match(semanticArchitecture, /interface drift/i);
  assert.match(semanticArchitecture, /boundary violation/i);
  assert.match(semanticArchitecture, /source-to-test relevance/i);
  assert.match(pilot, /boundary-violation-forbidden-import/);
  assert.match(pilot, /source-test-relevance-missed-expected-targets/);
  assert.doesNotMatch(pilot, /cmd \/c npm\.cmd/);
  assert.match(troubleshooting, /npx agent-guardrails help/);
  assert.match(troubleshooting, /origin\/master/);

  assert.match(workflow, /npm test/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /node \.\/examples\/bounded-scope-demo\/scripts\/run-demo\.mjs all/);
  assert.match(workflow, /node \.\/examples\/pattern-drift-demo\/scripts\/run-demo\.mjs all/);
  assert.match(workflow, /node \.\/examples\/interface-drift-demo\/scripts\/run-demo\.mjs all/);
  assert.match(workflow, /node \.\/examples\/boundary-violation-demo\/scripts\/run-demo\.mjs all/);
  assert.match(workflow, /node \.\/examples\/source-test-relevance-demo\/scripts\/run-demo\.mjs all/);
  assert.match(workflow, /npm run benchmark/);
  assert.match(workflow, /node \.\/bin\/agent-guardrails\.js help/);
  assert.match(workflow, /npm pack --dry-run/);
  assert.match(workflow, /node \.\/tests\/install-smoke\.js/);
  assert.match(templateWorkflow, /npx agent-guardrails check/);

  for (const content of adapterDocs) {
    assert.match(content, /check --json/);
    assert.match(content, /AGENT_GUARDRAILS_COMMANDS_RUN/);
    assert.match(content, /agent-guardrails plan --task "<task>"/);
    assert.match(content, /--review/);
    assert.match(content, /\.agent-guardrails\/evidence\/current-task\.md/);
  }

  assert.equal(fs.existsSync(path.join(repoRoot, "CONTRIBUTING.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "CHANGELOG.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "TROUBLESHOOTING.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "RELEASE_CHECKLIST.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "benchmarks", "oss", "scope-only-failure.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "benchmarks", "pro", "pattern-drift-failure.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "benchmarks", "pro", "interface-change-failure.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "benchmarks", "pro", "boundary-violation-failure.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "benchmarks", "pro", "source-to-test-semantic-relevance.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "plugins", "plugin-ts", "package.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "examples", "pattern-drift-demo", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "examples", "interface-drift-demo", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "examples", "boundary-violation-demo", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "examples", "source-test-relevance-demo", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "REAL_REPO_PILOT.md")), true);
}
