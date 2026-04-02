import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function runNpmPublishDryRun() {
  const cacheDir = path.join(repoRoot, ".npm-cache-release-test");
  fs.mkdirSync(cacheDir, { recursive: true });

  try {
    return execFileSync(
      "cmd",
      ["/c", "npm.cmd", "publish", "--dry-run", "--access", "public", "--cache", cacheDir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    return `${stdout}\n${stderr}`;
  }
}

export async function run() {
  const packageJson = JSON.parse(read("package.json"));
  const readme = read("README.md");
  const roadmap = read("docs/ROADMAP.md");
  const benchmarks = read("docs/BENCHMARKS.md");
  const proof = read("docs/PROOF.md");
  const semanticArchitecture = read("docs/SEMANTIC_ARCHITECTURE.md");
  const pilot = read("docs/REAL_REPO_PILOT.md");
  const troubleshooting = read("docs/TROUBLESHOOTING.md");
  const workflows = read("docs/WORKFLOWS.md");
  const workflow = read(".github/workflows/guardrails.yml");
  const templateWorkflow = read("templates/base/workflows/agent-guardrails.yml");
  const zhReadme = read("docs/zh-CN/README.md");
  const adapterDocs = [
    read("adapters/codex/README.md"),
    read("adapters/claude-code/README.md"),
    read("adapters/cursor/README.md")
  ];

  assert.doesNotMatch(packageJson.repository.url, /example/);
  assert.match(packageJson.homepage, /^https:\/\/github\.com\//);
  assert.match(packageJson.bugs.url, /^https:\/\/github\.com\//);
  assert.equal(packageJson.bin["agent-guardrails"], "bin/agent-guardrails.js");

  assert.match(readme, /## Quick Start/);
  assert.match(readme, /## Core Workflow/);
  assert.match(readme, /## Before vs After/);
  assert.match(readme, /## Three-layer Enforcement/);
  assert.match(readme, /## Competitor Comparison/);
  assert.match(readme, /## CLI Reference/);
  assert.match(readme, /agent-guardrails setup --agent <your-agent>/);
  assert.match(readme, /agent-guardrails enforce --all/);
  assert.match(readme, /agent-guardrails unenforce --all/);
  assert.match(readme, /CLAUDE\.md/);
  assert.match(readme, /L1.*enforce/i);
  assert.match(readme, /L2.*AGENTS\.md/i);
  assert.match(readme, /L3.*pre-commit hook/i);
  assert.match(readme, /## Docs/);
  assert.match(readme, /docs\/ROADMAP\.md/);
  assert.match(readme, /MIT/);

  assert.match(zhReadme, /中文/);

  assert.match(roadmap, /## Phase 1 \(Shipped\)/);
  assert.match(roadmap, /## Phase 2 \(Shipped\)/);
  assert.match(roadmap, /## Phase 3 \(Shipped\)/);
  assert.match(roadmap, /## Phase 4 \(Shipped/);
  assert.match(roadmap, /## Phase 5 \(Next\)/);
  assert.match(roadmap, /## Phase 6 \(Later\)/);
  assert.match(roadmap, /## Phase 7 \(Later\)/);
  assert.match(roadmap, /rough-intent mode/i);
  assert.match(roadmap, /trust verdict/i);
  assert.match(roadmap, /Python.*baseline proof slice/i);
  assert.match(roadmap, /deploy-readiness verdicts/i);
  assert.match(roadmap, /deployment orchestration/i);

  assert.match(benchmarks, /## OSS benchmark suite/);
  assert.match(benchmarks, /## Pro benchmark suite/);
  assert.match(benchmarks, /python-fastapi-deploy-ready-pass/);
  assert.match(benchmarks, /npm run demo:python-fastapi/);
  assert.match(benchmarks, /npm run demo:pattern-drift/);
  assert.match(benchmarks, /npm run demo:boundary-violation/);
  assert.match(benchmarks, /npm run demo:source-test-relevance/);

  assert.match(proof, /What this catches that normal AI coding workflows miss/i);
  assert.match(proof, /## 1\. Scope catch/);
  assert.match(proof, /## 2\. Semantic catch/);
  assert.match(proof, /## 3\. Reviewer summary value/);
  assert.match(proof, /## 4\. Current support boundary/);
  assert.match(proof, /## 5\. Python baseline proof/);
  assert.match(proof, /Deepest support today:\*\* JavaScript \/ TypeScript/);
  assert.doesNotMatch(proof, /plugin-python.*(shipped|ship|available today|semantic parity)/i);

  assert.match(workflows, /## Supported agents/);
  assert.match(workflows, /## CLI commands/);
  assert.match(workflows, /## Presets/);
  assert.match(workflows, /## FAQ/);
  assert.match(workflows, /## Current limits/);
  assert.match(workflows, /agent-guardrails mcp/);
  assert.match(workflows, /agent-guardrails check --base-ref origin\/main --json/);
  assert.match(workflows, /\.agent-guardrails\/evidence\/current-task\.md/);

  assert.match(semanticArchitecture, /## Detector pipeline/);
  assert.match(semanticArchitecture, /## Plugin interface/);
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
  assert.match(workflow, /npm run benchmark/);
  assert.match(workflow, /npm pack --dry-run/);
  assert.match(workflow, /node \.\/tests\/install-smoke\.js/);
  assert.match(templateWorkflow, /npx agent-guardrails check/);

  for (const content of adapterDocs) {
    assert.match(content, /agent-guardrails setup --agent/);
    assert.match(content, /start_agent_native_loop/);
    assert.match(content, /finish_agent_native_loop/);
    assert.match(content, /check --json/);
    assert.match(content, /agent-guardrails plan --task "<task>"/);
  }

  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "PILOT_TEMPLATE.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "PILOT_SUMMARY_TEMPLATE.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "PROOF.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "WORKFLOWS.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "examples", "python-fastapi-demo", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "pilots", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "pilots", "claude-code.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "pilots", "cursor.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "pilots", "codex.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "pilots", "SUMMARY.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "plugins", "plugin-ts", "package.json")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "REAL_REPO_PILOT.md")), true);

  const publishDryRun = runNpmPublishDryRun();
  assert.doesNotMatch(publishDryRun, /npm auto-corrected some errors/i);
  assert.doesNotMatch(publishDryRun, /bin\[agent-guardrails\].*invalid and removed/i);
}
