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

function listTrackedFiles() {
  return execFileSync("git", ["ls-files"], {
    cwd: repoRoot,
    encoding: "utf8"
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readJsonCommand(command, args) {
  return JSON.parse(
    execFileSync(command, args, {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
  );
}

export async function run() {
  const packageJson = JSON.parse(read("package.json"));
  const readme = read("README.md");
  const roadmap = read("docs/ROADMAP.md");
  const benchmarks = read("docs/BENCHMARKS.md");
  const proof = read("docs/PROOF.md");
  const troubleshooting = read("docs/TROUBLESHOOTING.md");
  const workflows = read("docs/WORKFLOWS.md");
  const workflow = read(".github/workflows/guardrails.yml");
  const templateWorkflow = read("templates/base/workflows/agent-guardrails.yml");
  const zhReadme = read("docs/zh-CN/README.md");
  const claudePreHookTemplate = read("templates/hooks/claude-code-pre-tool.cjs");
  const claudePostHookTemplate = read("templates/hooks/claude-code-post-tool.cjs");
  const geminiPreHookTemplate = read("templates/hooks/gemini-pre-tool.cjs");
  const geminiPostHookTemplate = read("templates/hooks/gemini-post-tool.cjs");
  const adapterDocs = [
    read("adapters/codex/README.md"),
    read("adapters/claude-code/README.md"),
    read("adapters/cursor/README.md"),
    read("adapters/gemini/README.md"),
    read("adapters/opencode/README.md")
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
  assert.match(readme, /docs\/WORKFLOWS\.md/);
  assert.match(readme, /docs\/TROUBLESHOOTING\.md/);
  assert.match(readme, /docs\/PROOF\.md/);
  assert.match(readme, /docs\/BENCHMARKS\.md/);
  assert.match(readme, /MIT/);

  assert.match(zhReadme, /中文/);

  assert.match(roadmap, /## Phase 1 \(Shipped\)/);
  assert.match(roadmap, /## Phase 2 \(Shipped\)/);
  assert.match(roadmap, /## Phase 3 \(Shipped\)/);
  assert.match(roadmap, /## Phase 4 \(Shipped/);
  assert.match(roadmap, /## Phase 5 \(Complete/);
  assert.match(roadmap, /## Phase 6 \(.*Pro.*\)/);
  assert.match(roadmap, /## Phase 7 \(Later.*Pro Cloud/);
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

  assert.match(troubleshooting, /npx agent-guardrails help/);
  assert.match(troubleshooting, /origin\/master/);

  assert.match(workflow, /npm test/);
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /macos-latest/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /npm run benchmark/);
  assert.match(workflow, /npm run build:rust-native/);
  assert.match(workflow, /Run unit and doc validation with packaged Rust runtime default/);
  assert.match(workflow, /native-matrix/);
  assert.match(workflow, /x86_64-pc-windows-msvc/);
  assert.match(workflow, /x86_64-unknown-linux-gnu/);
  assert.match(workflow, /x86_64-apple-darwin/);
  assert.match(workflow, /aarch64-apple-darwin/);
  assert.match(workflow, /native-package-smoke/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /--require-complete-native-matrix/);
  assert.match(workflow, /npm pack --dry-run/);
  assert.match(workflow, /node \.\/tests\/install-smoke\.js/);
  assert.match(workflow, /npm run smoke:rust-installed/);
  assert.match(workflow, /npm run release:rust-readiness/);
  assert.doesNotMatch(workflow, /cache: npm/);
  assert.match(workflow, /Restore native executable bits/);
  assert.match(workflow, /static-verify/);
  assert.match(templateWorkflow, /npx agent-guardrails check/);
  assert.match(templateWorkflow, /cache: npm/);
  assert.match(claudePreHookTemplate, /permissionDecision/);
  assert.match(claudePreHookTemplate, /PreToolUse/);
  assert.match(claudePreHookTemplate, /Bash/);
  assert.match(claudePreHookTemplate, /sed/);
  assert.match(claudePreHookTemplate, /tee/);
  assert.match(claudePostHookTemplate, /systemMessage/);
  assert.match(claudePostHookTemplate, /agent-guardrails", "check/);
  assert.match(geminiPreHookTemplate, /decision/);
  assert.match(geminiPreHookTemplate, /write_file/);
  assert.match(geminiPostHookTemplate, /systemMessage/);
  assert.match(geminiPostHookTemplate, /agent-guardrails", "check/);

  for (const content of adapterDocs) {
    assert.match(content, /agent-guardrails setup --agent/);
    assert.match(content, /start_agent_native_loop/);
    assert.match(content, /finish_agent_native_loop/);
    assert.match(content, /check --json/);
    assert.match(content, /agent-guardrails plan --task "<task>"/);
  }

  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "PROOF.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "docs", "WORKFLOWS.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "examples", "python-fastapi-demo", "README.md")), true);
  assert.equal(fs.existsSync(path.join(repoRoot, "plugins", "plugin-ts", "package.json")), true);

  // Version consistency: package.json version must match CHANGELOG top entry
  const changelog = read("CHANGELOG.md");
  const changelogTopVersion = changelog.match(/^## (\d+\.\d+\.\d+)/m);
  assert.ok(changelogTopVersion, "CHANGELOG.md must have a version heading");
  assert.equal(
    packageJson.version,
    changelogTopVersion[1],
    `package.json version (${packageJson.version}) must match CHANGELOG top entry (${changelogTopVersion[1]})`
  );

  const publishDryRun = runNpmPublishDryRun();
  assert.doesNotMatch(publishDryRun, /npm auto-corrected some errors/i);
  assert.doesNotMatch(publishDryRun, /bin\[agent-guardrails\].*invalid and removed/i);

  const rustReadiness = readJsonCommand(process.execPath, ["./scripts/check-rust-release-readiness.js"]);
  assert.equal(rustReadiness.ok, true);
  assert.match(rustReadiness.releaseMode, /node-fallback-with-rust-where-packaged|rust-default-with-node-fallback/);
  assert.equal(rustReadiness.checks.packageIncludesNativeRoot, true);
  assert.equal(rustReadiness.checks.hasBuildRustNativeScript, true);
  assert.equal(rustReadiness.checks.hasInstalledRustSmokeScript, true);
  assert.equal(rustReadiness.checks.coreRustDefaults.check, true);
  assert.equal(rustReadiness.checks.coreRustDefaults.mcp, true);
  assert.equal(rustReadiness.checks.coreRustDefaultReady, true);
  assert.equal(rustReadiness.checks.daemonAndServeRustDefaults.start, true);
  assert.equal(rustReadiness.checks.daemonAndServeRustDefaults.serve, true);
  assert.equal(rustReadiness.checks.daemonAndServeRustDefaultReady, true);
  assert.equal(rustReadiness.checks.uiRustDefaults.workbenchPanel, true);
  assert.equal(rustReadiness.checks.uiRustDefaultReady, true);
  assert.equal(rustReadiness.checks.allRustDefaultReady, true);
  assert.match(rustReadiness.checks.currentSourceSignature, /^[a-f0-9]{64}$/);

  const missingNativeReadiness = readJsonCommand(process.execPath, [
    "./scripts/check-rust-release-readiness.js",
    "--require-rust-default"
  ]);
  assert.equal(missingNativeReadiness.ok, true);

  assert.equal(
    listTrackedFiles().includes(".agent-guardrails/evidence/current-task.md"),
    false,
    "task evidence notes are local workflow state and must not be tracked"
  );

  for (const internalPath of [
    ".agent-guardrails/prompts/IMPLEMENT_PROMPT.md",
    ".agent-guardrails/tasks/TASK_TEMPLATE.md",
    "autogrowth_output/EXECUTION_SUMMARY.md",
    "docs/DOCUMENTATION_INDEX.md",
    "docs/FAQ_WHY_BUY.md",
    "docs/LANDING_PAGE_COPY.md",
    "docs/PRICING_COPY.md",
    "docs/PR_CHECKLIST.md",
    "docs/PROJECT_STATE.md",
    "docs/PRO_LOCAL_SPEC.md",
    "docs/ROUGH_INTENT.md",
    "docs/SEMANTIC_ARCHITECTURE.md",
    "docs/TECHNICAL_SPEC.md",
    "docs/USER_GUIDE.md",
    "README.zh-CN.md",
    "RELEASE_v0.12.0.md"
  ]) {
    assert.equal(
      listTrackedFiles().includes(internalPath),
      false,
      `${internalPath} is internal planning or commercial context and must not be tracked`
    );
  }
}
