import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../lib/cli.js";
import { runProCleanup, runProReport, runProStatus, runProWorkbench } from "../lib/commands/pro-status.js";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const OSS_REPO_ROOT = path.resolve(TEST_DIR, "..");

function captureLogs(run) {
  const original = console.log;
  let output = "";
  let result;
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(async () => {
      result = await run();
      return { output, result };
    })
    .finally(() => {
      console.log = original;
    });
}

async function withMockInstalledPro(callback, repoRoot = OSS_REPO_ROOT, options = {}) {
  const packageDir = path.join(repoRoot, "node_modules", "@agent-guardrails", "pro");
  const backupDir = path.join(repoRoot, "node_modules", "@agent-guardrails", `.pro-backup-${process.pid}`);
  const hadExistingPackage = fs.existsSync(packageDir);
  if (hadExistingPackage) {
    fs.renameSync(packageDir, backupDir);
  }
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(path.join(packageDir, "package.json"), JSON.stringify({
    name: "@agent-guardrails/pro",
    version: "0.1.0-test",
    type: "module",
    exports: {
      ".": "./index.js"
    }
  }, null, 2), "utf8");
  const activateLicenseLines = options.activateLicenseLines || [
    "export async function activateLicense(licenseKey, instanceName) {",
    "  return {",
    "    activated: true,",
    "    instanceId: instanceName || 'default',",
    "    meta: { productName: 'Agent Guardrails Pro', customerName: 'CLI Buyer' },",
    "    lifecycle: { state: 'active', canEnrichCheck: true, source: 'paddle', subscriptionStatus: 'active', daysRemaining: null }",
    "  };",
    "}",
    ""
  ];

  fs.writeFileSync(path.join(packageDir, "index.js"), [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "",
    "export function buildProStatus() {",
    "  return {",
    "    packageName: '@agent-guardrails/pro',",
    "    packageVersion: '0.1.0-test',",
    "    installed: true,",
    "    license: { state: 'cached_valid', valid: true, reason: null, meta: { plan: 'team' } },",
    "    readiness: { state: 'ready', canEnrichCheck: true, summary: 'Pro is ready to enrich checks.' },",
    "    capabilities: [",
    "      { code: 'go-live-verdict', label: 'Go-live verdict', available: true, userValue: 'Answers whether this change can ship.' },",
    "      { code: 'repo-memory', label: 'Repo memory calibration', available: true, userValue: 'Raises the proof bar for repeated local risks.' }",
    "    ],",
    "    activationChecklist: [",
    "      { code: 'install-pro-package', label: 'Install @agent-guardrails/pro', status: 'done', command: 'npm install @agent-guardrails/pro' },",
    "      { code: 'run-check', label: 'Run check and review the Pro go-live verdict', status: 'done', command: 'agent-guardrails check --review' }",
    "    ],",
    "    activationFlow: {",
    "      state: 'ready',",
    "      primaryCommand: 'agent-guardrails check --json',",
    "      nextAction: {",
    "        code: 'run-check',",
    "        label: 'Run a Pro-enriched check',",
    "        command: 'agent-guardrails check --review',",
    "        value: 'See the go-live decision, proof gaps, and next best action on the real current diff.'",
    "      },",
    "      expectedResult: 'The check output includes goLiveDecision at the top level when Pro enrichment is available.'",
    "    },",
    "    conversion: {",
    "      primaryUseCase: 'Decide whether an AI-generated change can go live with enough evidence.',",
    "      valueMoments: [",
    "        { code: 'go-live-decision', title: 'Verdict before explanation', outcome: 'See go, need_evidence, or hold before digging through raw findings.' },",
    "        { code: 'proof-gap', title: 'Cheapest missing proof', outcome: 'Know the next evidence item that would move a change closer to shipping.' }",
    "      ]",
    "    },",
    "    integration: { activation: 'Install @agent-guardrails/pro and configure pro.licenseKey.' },",
    "    proofMemory: {",
    "      state: 'active_gaps',",
    "      activeGapCount: 1,",
    "      resolvedCount: 1,",
    "      missingEventCount: 2,",
    "      proofRecipeCount: 1,",
    "      userValue: 'Shows recurring missing proof and the evidence that resolved prior gaps, so Pro becomes more project-aware over time.',",
    "      surfaceSummary: {",
    "        state: 'active',",
    "        headline: 'Top recurring proof pressure: Validation proof memory (1 active, 1 resolved).',",
    "        topSurfaces: [",
    "          { surface: 'validation', title: 'Validation proof memory', activeGapCount: 1, resolvedCount: 1, message: 'Validation proof memory has 1 active gap(s). Future changes may prioritize declared validation command output.' }",
    "        ]",
    "      },",
    "      impactSurfaces: [",
    "        { surface: 'validation', title: 'Validation proof memory', activeGapCount: 1, resolvedCount: 1, message: 'Validation proof memory has 1 active gap(s). Future changes may prioritize declared validation command output.' }",
    "      ],",
    "      topActiveGaps: [",
    "        { code: 'run-required-command', title: 'Run required command: npm test', command: 'npm test', expectedEvidence: 'Paste the passing output for npm test.', timesSeen: 2, files: [] }",
    "      ],",
    "      recentResolvedProof: [",
    "        { code: 'add-rollback-proof', title: 'Document rollback proof', command: null, resolvedAt: '2026-04-12T00:00:00.000Z', closureSummary: 'Closed Document rollback proof with docs/release-checks.md. Future matching gaps will prioritize this proof recipe.' }",
    "      ],",
    "      topProofRecipes: [",
    "        { surface: 'validation', code: 'run-required-command', title: 'Run required command: npm test', command: 'npm test', timesUsed: 2, freshness: 'stale', ageDays: 467, stalenessWarning: 'This is a stale 467-day-old proof recipe; rerun `npm test` to reconfirm it before treating it as current proof.', nextAction: 'Rerun `npm test` and capture fresh passing output before relying on this recipe.', userValue: 'Reusable local proof recipe learned from evidence that previously closed this gap.' }",
    "      ],",
    "      commandPatterns: [",
    "        { command: 'npm test', timesUsed: 4, surfaces: ['validation'], nextUse: 'Use `npm test` as the first proof command when this evidence gap appears again.' }",
    "      ],",
    "      evidencePathPatterns: [",
    "        { path: '.agent-guardrails/evidence/current-task.md', timesUsed: 3, surfaces: ['validation'], nextUse: 'Reuse .agent-guardrails/evidence/current-task.md as the evidence pattern to recreate when this proof gap appears again.' }",
    "      ]",
    "    },",
    "    proofMemoryHealth: {",
    "      state: 'needs_cleanup',",
    "      severity: 'warning',",
    "      headline: 'Proof memory needs cleanup before its recommendations should be trusted blindly.',",
    "      summary: 'Proof memory has unreliable or stale recipes that should be reviewed.',",
    "      counts: { trusted: 1, watch: 1, unreliable: 1, unknown: 0, archived: 1, cleanupEvents: 1, cleanupCandidates: 1 },",
    "      policy: { staleAfterDays: 90, maxFailureCount: 2, recentCleanupDays: 30 },",
    "      lastCleanupAt: '2026-04-13T00:00:00.000Z',",
    "      recentCleanupEvents: [",
    "        { type: 'proof-memory-cleanup', appliedAt: '2026-04-13T00:00:00.000Z', archivedCount: 1, commands: ['npm test'], reasons: ['stale 200 days; failed 4x'], summary: 'Archived 1 proof recipe from active repo memory.' }",
    "      ],",
    "      policyAdvice: {",
    "        mode: 'strict',",
    "        summary: 'This repo archives stale or failed proof recipes earlier than the default.',",
    "        tradeoff: 'Strict memory keeps Pro recommendations conservative, but it may ask for more fresh proof before reusing old evidence.',",
    "        nextAction: { code: 'keep-strict-policy-and-clean-up', label: 'Keep the strict policy and clean up candidates', command: 'agent-guardrails pro cleanup', value: 'Preview or apply cleanup so stale proof recipes stop influencing future proof plans.' },",
    "        configPath: '.agent-guardrails/config.json'",
    "      },",
    "      nextAction: { code: 'preview-proof-memory-cleanup', label: 'Preview proof memory cleanup', command: 'agent-guardrails pro status --json', policy: { staleAfterDays: 90, maxFailureCount: 2, recentCleanupDays: 30 }, value: 'Review cleanup candidates before archiving unreliable proof recipes.' },",
    "      userValue: 'Keeps repo memory useful by separating trusted proof habits from stale or failed advice.'",
    "    },",
    "    paidValue: {",
    "      state: 'compounding',",
    "      score: 85,",
    "      headline: 'Pro is earning paid value when repo memory changes the next proof step.',",
    "      summary: 'This repo has learned proof recipes and can turn repeated missing evidence into project-specific next actions.',",
    "      userValue: 'This is the paid layer: deploy decisions, cheapest proof, and local evidence memory, not another generic checklist.',",
    "      valueDrivers: [",
    "        { code: 'go-live-decision', title: 'Go-live decision', outcome: 'Turns raw findings into go, need_evidence, or hold.' },",
    "        { code: 'proof-plan', title: 'Proof plan', outcome: 'Points to the cheapest next proof item.' },",
    "        { code: 'repo-memory', title: 'Repo memory', outcome: 'Reuses project-specific proof recipes.' },",
    "        { code: 'policy-calibration', title: 'Policy calibration', outcome: 'Keeps stale advice out of future proof plans.' }",
    "      ],",
    "      nextAction: { code: 'run-pro-enriched-check', label: 'Run a Pro-enriched check', command: 'agent-guardrails check --review', value: 'Run it on a real diff so the go-live decision and next proof step show up in the workflow.' }",
    "    },",
    "    firstValuePath: {",
    "      state: 'compounding',",
    "      headline: 'First paid-value loop: real check, cheapest proof, repo memory.',",
    "      userValue: 'Shows the fastest path from install to a concrete Pro decision users can judge against real work.',",
    "      nextAction: { code: 'run-pro-enriched-check', title: 'Run a real check', command: 'agent-guardrails check --review', value: 'Use a real diff to see the go-live decision, cheapest proof, and repo-memory next action.' },",
    "      steps: [",
    "        { code: 'activate-pro', title: 'Activate Pro', status: 'done', command: 'agent-guardrails pro status --json', outcome: 'OSS can load Pro and prepare go-live decisions in check output.' },",
    "        { code: 'run-real-check', title: 'Run a real check', status: 'done', command: 'agent-guardrails check --review', outcome: 'See the go-live verdict, risk tier, and missing proof for a real diff.' },",
    "        { code: 'close-cheapest-proof', title: 'Close the cheapest proof', status: 'todo', command: 'agent-guardrails check --review', outcome: 'Close the highest-leverage evidence gap instead of manually guessing the next step.' },",
    "        { code: 'inspect-paid-value', title: 'Inspect paid value', status: 'done', command: 'agent-guardrails pro status', outcome: 'Confirm repo memory, proof recipes, and paidValue are starting to compound.' }",
    "      ]",
    "    },",
    "    demoGoLiveDecision: {",
    "      verdict: 'hold',",
    "      riskTier: 'high',",
    "      why: ['Deploy-sensitive change is missing proof.'],",
    "      evidenceGaps: ['rollback note'],",
    "      nextBestActions: ['Add rollback note.']",
    "    }",
    "  };",
    "}",
    "export function planProofMemoryCleanup() {",
    "  return {",
    "    mode: 'dry-run',",
    "    state: 'needs_cleanup',",
    "    cleanup: { archivedCount: 1, wouldArchive: [{ command: 'npm test', reason: 'failed repeatedly' }] },",
    "    nextAction: { code: 'apply-proof-memory-cleanup', label: 'Apply proof memory cleanup', value: 'Archive unreliable proof recipes.', warning: 'This will archive 1 proof recipe.' },",
    "    userValue: 'Keeps paid repo memory useful by moving failed or stale recipes out of the active recommendation path.'",
    "  };",
    "}",
    "export function applyProofMemoryCleanup() {",
    "  return {",
    "    mode: 'apply',",
    "    state: 'cleaned',",
    "    cleanup: { archivedCount: 1, wouldArchive: [{ command: 'npm test', reason: 'failed repeatedly' }] },",
    "    nextAction: { code: 'rerun-pro-status', label: 'Rerun Pro status', value: 'Confirm proof memory health after cleanup.' },",
    "    userValue: 'Keeps paid repo memory useful by moving failed or stale recipes out of the active recommendation path.'",
    "  };",
    "}",
    "export function buildGoLiveReport() {",
    "  return {",
    "    packageName: '@agent-guardrails/pro',",
    "    packageVersion: '0.1.0-test',",
    "    installed: true,",
    "    action: 'go-live-report',",
    "    state: 'ready',",
    "    format: 'markdown',",
    "    verdict: { verdict: 'hold', riskTier: 'high' },",
    "    nextAction: { code: 'run-cheapest-proof', command: 'npm test -- auth', label: 'Run required proof', value: 'Run npm test -- auth and refresh the answer.' },",
    "    operatorWorkbench: {",
    "      headline: 'Can I ship? No, hold this high change.',",
    "      decisionCard: { verdict: 'hold' },",
    "      proofQueue: [",
    "        { title: 'Run required command: npm test -- auth', code: 'run-required-command', surface: 'validation', command: 'npm test -- auth', expectedEvidence: 'Paste the passing output for npm test -- auth.' }",
    "      ],",
    "      automationDecision: {",
    "        state: 'agent_runs_then_glance',",
    "        label: 'Let the agent run the next step, then take a quick look',",
    "        badge: 'Agent first',",
    "        summary: 'Let the agent run the next proof, save the evidence, rerun the answer, and hand back the result.',",
    "        humanRole: 'Read the refreshed answer after the rerun.'",
    "      },",
    "      automationContract: {",
    "        mode: 'agent_runs_then_glance',",
    "        reviewLevel: 'quick_glance',",
    "        nextCommand: 'npm test -- auth',",
    "        rerunCommand: 'agent-guardrails check --review',",
    "        humanChecks: ['Read the refreshed release answer after the rerun.'],",
    "        stopConditions: ['Stop and hand back if the answer stays blocked.'],",
    "        copyBrief: 'Mode: Let the agent run the next step, then take a quick look\\nRun: npm test -- auth\\nThen rerun agent-guardrails check --review.'",
    "      }",
    "    },",
    "    workbenchView: {",
    "      format: 'agent-guardrails-workbench-view.v1',",
    "      schemaVersion: 1,",
    "      renderer: 'structured-ui-contract',",
    "      renderHints: { primarySurface: 'native-panel', tone: 'blocked', avoid: ['raw-json-first', 'html-iframe-first'] },",
    "      decision: { id: 'ship-answer', title: 'Not ready', question: 'Can I ship this change?', answer: 'No', verdict: 'hold', state: 'blocked', riskTier: 'high', riskLabel: 'High risk', mergeGate: 'do-not-merge', trustScore: 62, reason: 'High-risk auth change is missing proof.' },",
    "      navigation: [",
    "        { id: 'ship', title: 'Ship', value: 'No', state: 'blocked', description: 'Decision blocked', progress: 34 },",
    "        { id: 'evidence', title: 'Evidence', value: '1 open', state: 'needs_work', description: 'Close the next proof', progress: 84 },",
    "        { id: 'memory', title: 'Memory', value: '0 recipes', state: 'quiet', description: 'Learning starts here', progress: 22 },",
    "        { id: 'docs', title: 'Docs', value: 'Aligned', state: 'ready', description: 'Baseline present', progress: 100 }",
    "      ],",
    "      primaryActions: [",
    "        { id: 'run-next-command', type: 'command', label: 'Run next proof', command: 'npm test -- auth', intent: 'execute_next_proof', placement: 'primary', requiresUserApproval: true, enabled: true },",
    "        { id: 'copy-execution-package', type: 'copy', label: 'Copy execution package', value: 'Mode: Let the agent run the next step, then take a quick look\\nRun: npm test -- auth', intent: 'handoff_to_agent', placement: 'primary', enabled: true }",
    "      ],",
    "      agentLoop: {",
    "        state: 'agent_runs_then_glance',",
    "        reviewLevel: 'quick_glance',",
    "        badge: 'Agent first',",
    "        headline: 'Let the agent run the next step, then take a quick look',",
    "        humanRole: 'Read the refreshed answer after the rerun.',",
    "        nextLoopPackage: { nextCommand: 'npm test -- auth', rerunCommand: 'agent-guardrails check --review', agentBrief: 'Mode: Let the agent run the next step, then take a quick look\\nRun: npm test -- auth' },",
    "        rerunCommand: 'agent-guardrails check --review',",
    "        humanChecks: ['Read the refreshed release answer after the rerun.'],",
    "        stopConditions: ['Stop and hand back if the answer stays blocked.']",
    "      },",
    "      sections: [",
    "        { id: 'ship-answer', type: 'decision', title: 'Can I ship this change?', status: 'blocked', summary: 'High-risk auth change is missing proof.', rows: [{ label: 'Answer', value: 'No' }, { label: 'Risk', value: 'High risk' }] },",
    "        { id: 'next-proof', type: 'proof_queue', title: 'Next proof', status: 'needs_work', summary: 'Run npm test -- auth and refresh the answer.', items: [{ title: 'Run required command: npm test -- auth', code: 'run-required-command', surface: 'validation', command: 'npm test -- auth', expectedEvidence: 'Paste the passing output for npm test -- auth.' }], actions: [{ id: 'run-proof-command', type: 'command', label: 'Run proof command', command: 'npm test -- auth', intent: 'execute_proof_command', enabled: true }] },",
    "        { id: 'visible-verification', type: 'visible_verification', title: 'Visible verification', status: 'not_applicable', summary: 'No visible verification is required.' },",
    "        { id: 'maintenance', type: 'maintenance', title: 'Maintenance', status: 'ready', summary: 'Project maintenance context is available.' }",
    "      ],",
    "      legacy: { htmlRenderer: 'renderOperatorWorkbenchHtml', status: 'compatibility_only' }",
    "    },",
    "    html: '<!doctype html><html><body><h1>Agent Guardrails Pro Workbench</h1><p>Can I ship? No.</p></body></html>',",
    "    markdown: ['# Agent Guardrails Pro Go-Live Report', '', 'Verdict: HOLD (high)', '', '## Trust Receipt', 'Do not merge: high-risk auth change is missing required proof.', '', '## Cheapest Proof', '- Run required command: npm test -- auth', '- Command: npm test -- auth'].join('\\n')",
    "  };",
    "}",
    "function appendMockToolCall(name, args = {}) {",
    "  const repoRoot = args.repoRoot || process.cwd();",
    "  const callsPath = path.join(repoRoot, '.agent-guardrails', 'pro', 'mock-tool-calls.json');",
    "  const current = fs.existsSync(callsPath) ? JSON.parse(fs.readFileSync(callsPath, 'utf8')) : [];",
    "  fs.mkdirSync(path.dirname(callsPath), { recursive: true });",
    "  current.push({ name, args });",
    "  fs.writeFileSync(callsPath, JSON.stringify(current, null, 2), 'utf8');",
    "}",
    "export async function callProMcpTool(name, args = {}) {",
    "  appendMockToolCall(name, args);",
    "  if (name === 'pro_capture_evidence_note') {",
    "    return {",
    "      format: 'agent-guardrails-pro-mcp-evidence-note.v1',",
    "      state: 'captured',",
    "      repoRoot: args.repoRoot || null,",
    "      evidencePath: args.evidencePath || '.agent-guardrails/evidence/current-task.md',",
    "      artifactPaths: Array.isArray(args.artifactPaths) ? args.artifactPaths : [],",
    "      nextAction: { command: 'agent-guardrails check --review' }",
    "    };",
    "  }",
    "  if (name === 'pro_record_proof_outcome') {",
    "    return {",
    "      format: 'agent-guardrails-pro-mcp-proof-outcome.v1',",
    "      state: 'recorded',",
    "      repoRoot: args.repoRoot || null,",
    "      outcome: args.outcome || null,",
    "      matchedCount: 1,",
    "      updated: true",
    "    };",
    "  }",
    "  throw new Error('Unknown mock Pro MCP tool: ' + name);",
    "}",
    ...activateLicenseLines
  ].join("\n"), "utf8");

  try {
    return await callback();
  } finally {
    fs.rmSync(packageDir, { recursive: true, force: true });
    if (hadExistingPackage) {
      fs.renameSync(backupDir, packageDir);
    }
  }
}

async function withCwd(cwd, callback) {
  const previous = process.cwd();
  process.chdir(cwd);
  try {
    return await callback();
  } finally {
    process.chdir(previous);
  }
}

export async function run() {
  await describe("Pro status command", async () => {
    it("shows a useful not-installed status without failing", async () => {
      const { output, result } = await captureLogs(() =>
        runProStatus({ flags: {}, locale: "en", repoRoot: OSS_REPO_ROOT })
      );

      assert.equal(result.installed, false);
      assert.match(output, /Agent Guardrails Pro/);
      assert.match(output, /Status: not installed/);
      assert.match(output, /npm install @agent-guardrails\/pro/);
    });

    it("prints machine-readable Pro status JSON", async () => {
      const { output } = await captureLogs(() =>
        runProStatus({ flags: { json: true }, locale: "en", repoRoot: OSS_REPO_ROOT })
      );

      const parsed = JSON.parse(output);
      assert.equal(parsed.packageName, "@agent-guardrails/pro");
      assert.equal(parsed.installed, false);
      assert.equal(parsed.license.state, "unavailable");
    });

    it("shows installed Pro license and capabilities when the package is available", async () => {
      const { output, result } = await withMockInstalledPro(() =>
        captureLogs(() => runProStatus({ flags: {}, locale: "en", repoRoot: OSS_REPO_ROOT }))
      );

      assert.equal(result.installed, true);
      assert.equal(result.license.state, "cached_valid");
      assert.match(output, /Package: @agent-guardrails\/pro v0\.1\.0-test/);
      assert.match(output, /License: cached_valid \(valid\)/);
      assert.match(output, /Readiness: ready/);
      assert.match(output, /Next Pro action/);
      assert.match(output, /agent-guardrails check --review/);
      assert.match(output, /Primary command: agent-guardrails check --json/);
      assert.match(output, /Activation checklist/);
      assert.match(output, /Proof memory: active_gaps/);
      assert.match(output, /Top recurring proof pressure: Validation proof memory/);
      assert.match(output, /Validation proof memory has 1 active gap\(s\)/);
      assert.match(output, /declared validation command output/);
      assert.match(output, /Run required command: npm test \(seen 2x\)/);
      assert.match(output, /Command: npm test/);
      assert.match(output, /Proof recipes: 1/);
      assert.match(output, /Reusable proof recipes/);
      assert.match(output, /Run required command: npm test \(used 2x\)/);
      assert.match(output, /Freshness: stale \(467 days old\)/);
      assert.match(output, /rerun `npm test` to reconfirm it/);
      assert.match(output, /Next: Rerun `npm test` and capture fresh passing output/);
      assert.match(output, /Reusable proof commands/);
      assert.match(output, /npm test \(used 4x; validation\)/);
      assert.match(output, /Use `npm test` as the first proof command/);
      assert.match(output, /Reusable evidence paths/);
      assert.match(output, /\.agent-guardrails\/evidence\/current-task\.md \(used 3x; validation\)/);
      assert.match(output, /Proof memory health: needs_cleanup \(warning\)/);
      assert.match(output, /Proof memory needs cleanup before its recommendations should be trusted blindly/);
      assert.match(output, /Trusted: 1; Watch: 1; Unreliable: 1; Archived: 1; Cleanup events: 1; Cleanup candidates: 1/);
      assert.match(output, /Policy: stale after 90 days; archive after 2 failed reuse attempts; cleanup context 30 days/);
      assert.match(output, /Policy advice: strict/);
      assert.match(output, /archives stale or failed proof recipes earlier than the default/);
      assert.match(output, /Strict memory keeps Pro recommendations conservative/);
      assert.match(output, /Advice next: Keep the strict policy and clean up candidates/);
      assert.match(output, /Command: agent-guardrails pro cleanup/);
      assert.match(output, /Config: \.agent-guardrails\/config\.json/);
      assert.match(output, /Last cleanup: 2026-04-13T00:00:00.000Z/);
      assert.match(output, /Recent cleanup/);
      assert.match(output, /Archived 1 proof recipe from active repo memory/);
      assert.match(output, /Commands: npm test/);
      assert.match(output, /Reasons: stale 200 days; failed 4x/);
      assert.match(output, /Next: Preview proof memory cleanup/);
      assert.match(output, /Command: agent-guardrails pro status --json/);
      assert.match(output, /Review cleanup candidates before archiving unreliable proof recipes/);
      assert.match(output, /Paid value: compounding \(85\/100\)/);
      assert.match(output, /Pro is earning paid value when repo memory changes the next proof step/);
      assert.match(output, /This is the paid layer/);
      assert.match(output, /Value drivers/);
      assert.match(output, /Go-live decision: Turns raw findings into go, need_evidence, or hold/);
      assert.match(output, /Next paid action: Run a Pro-enriched check/);
      assert.match(output, /First value path: compounding/);
      assert.match(output, /First paid-value loop: real check, cheapest proof, repo memory/);
      assert.match(output, /Activate Pro: done \(agent-guardrails pro status --json\)/);
      assert.match(output, /Close the cheapest proof: todo \(agent-guardrails check --review\)/);
      assert.match(output, /Next first-value action: Run a real check/);
      assert.match(output, /Recently resolved/);
      assert.match(output, /Document rollback proof/);
      assert.match(output, /Closed Document rollback proof with docs\/release-checks\.md/);
      assert.match(output, /Future matching gaps will prioritize this proof recipe/);
      assert.match(output, /Why Pro matters/);
      assert.match(output, /Cheapest missing proof/);
      assert.match(output, /Go-live verdict/);
      assert.match(output, /Demo go-live verdict: HOLD \(high\)/);
    });

    it("renders Chinese labels for Pro status", async () => {
      const { output, result } = await withMockInstalledPro(() =>
        captureLogs(() => runProStatus({ flags: { lang: "zh-CN" }, locale: "zh-CN", repoRoot: OSS_REPO_ROOT }))
      );

      assert.equal(result.installed, true);
      assert.match(output, /状态: 已安装/);
      assert.match(output, /许可证: cached_valid \(valid\)/);
      assert.match(output, /就绪状态: ready/);
      assert.match(output, /下一步 Pro 动作/);
      assert.match(output, /激活清单/);
      assert.match(output, /证据记忆: active_gaps/);
      assert.match(output, /证据记忆健康度: needs_cleanup \(warning\)/);
      assert.match(output, /策略建议: strict/);
      assert.match(output, /付费价值: compounding \(85\/100\)/);
      assert.match(output, /价值驱动/);
      assert.match(output, /下一步付费动作: Run a Pro-enriched check/);
      assert.match(output, /首次价值路径: compounding/);
      assert.match(output, /下一步首次价值动作: Run a real check/);
      assert.match(output, /能力/);
      assert.match(output, /为什么 Pro 重要/);
      assert.match(output, /演示上线结论: HOLD \(high\)/);
    });

    it("routes agent-guardrails pro status through the CLI", async () => {
      const { output } = await captureLogs(() => runCli(["pro", "status", "--lang", "en"]));

      assert.match(output, /Agent Guardrails Pro/);
      assert.match(output, /Status: not installed/);
    });

    it("activates Pro through the CLI without writing the license into repo config", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-activate-"));
      const configPath = path.join(repoRoot, ".agent-guardrails", "config.json");
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify({ project: "activation-test" }, null, 2), "utf8");

      try {
        const { output } = await withMockInstalledPro(
          () => withCwd(repoRoot, () =>
            captureLogs(() => runCli([
              "pro",
              "activate",
              "lic_cli_activate_123",
              "--instance-name",
              "agent-guardrails-pro-local",
              "--json",
              "--lang",
              "en"
            ]))
          ),
          repoRoot
        );
        const parsed = JSON.parse(output);
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

        assert.equal(parsed.installed, true);
        assert.equal(parsed.activated, true);
        assert.equal(parsed.instanceId, "agent-guardrails-pro-local");
        assert.equal(parsed.configUpdated, false);
        assert.equal(config.pro, undefined);
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("explains Pro device-limit activation failures", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-device-limit-"));
      try {
        const { output, result } = await withMockInstalledPro(
          () => withCwd(repoRoot, () =>
            captureLogs(() => runCli([
              "pro",
              "activate",
              "lic_device_limit_123",
              "--instance-name",
              "desktop-four",
              "--instance-id",
              "machine-four",
              "--lang",
              "en"
            ]))
          ),
          repoRoot,
          {
            activateLicenseLines: [
              "export async function activateLicense(licenseKey, instanceName, options = {}) {",
              "  return {",
              "    activated: false,",
              "    error: 'PRO_DEVICE_LIMIT_REACHED',",
              "    status: 403,",
              "    instanceName,",
              "    instanceId: options.instanceId || 'missing-instance-id',",
              "    instanceLimit: 3,",
              "    activeInstanceCount: 3,",
              "    nextAction: {",
              "      code: 'manage-devices',",
              "      label: 'Manage activated devices',",
              "      value: 'Deactivate one existing device before activating this one.'",
              "    }",
              "  };",
              "}",
              ""
            ]
          }
        );

        assert.equal(result.activated, false);
        assert.equal(result.error, "PRO_DEVICE_LIMIT_REACHED");
        assert.equal(result.instanceId, "machine-four");
        assert.match(output, /Device limit: 3\/3 active devices/);
        assert.match(output, /Current device: machine-four/);
        assert.match(output, /Deactivate one existing device before activating this one/);
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("previews and applies Pro proof memory cleanup through the CLI", async () => {
      const preview = await withMockInstalledPro(() =>
        captureLogs(() => runCli(["pro", "cleanup", "--lang", "en"]))
      );
      assert.match(preview.output, /Proof memory cleanup: needs_cleanup/);
      assert.match(preview.output, /Mode: dry-run/);
      assert.match(preview.output, /Would archive: 1/);
      assert.match(preview.output, /Command: npm test/);
      assert.match(preview.output, /Next: Apply proof memory cleanup/);
      assert.match(preview.output, /Archive unreliable proof recipes/);

      const applied = await withMockInstalledPro(() =>
        captureLogs(() => runCli(["pro", "cleanup", "--apply", "--lang", "en"]))
      );
      assert.match(applied.output, /Proof memory cleanup: cleaned/);
      assert.match(applied.output, /Mode: apply/);
      assert.match(applied.output, /Archived: 1/);
      assert.match(applied.output, /Next: Rerun Pro status/);
    });

    it("prints machine-readable Pro proof memory cleanup JSON", async () => {
      const { output } = await withMockInstalledPro(() =>
        captureLogs(() => runCli(["pro", "cleanup", "--json", "--lang", "en"]))
      );

      const parsed = JSON.parse(output);
      assert.equal(parsed.installed, true);
      assert.equal(parsed.action, "proof-memory-cleanup");
      assert.equal(parsed.mode, "dry-run");
      assert.equal(parsed.state, "needs_cleanup");
      assert.equal(parsed.cleanup.archivedCount, 1);
      assert.equal(parsed.nextAction.code, "apply-proof-memory-cleanup");
    });

    it("renders a Pro go-live report through the CLI", async () => {
      const { output, result } = await withMockInstalledPro(() =>
        captureLogs(() => runCli(["pro", "report", "--lang", "en"]))
      );

      assert.equal(result.installed, true);
      assert.equal(result.action, "go-live-report");
      assert.match(output, /Agent Guardrails Pro Go-Live Report/);
      assert.match(output, /Verdict: HOLD \(high\)/);
      assert.match(output, /Trust Receipt/);
      assert.match(output, /Cheapest Proof/);
      assert.match(output, /npm test -- auth/);
    });

    it("prints machine-readable Pro go-live report JSON", async () => {
      const { output } = await withMockInstalledPro(() =>
        captureLogs(() => runProReport({ flags: { json: true }, locale: "en", repoRoot: OSS_REPO_ROOT }))
      );

      const parsed = JSON.parse(output);
      assert.equal(parsed.installed, true);
      assert.equal(parsed.action, "go-live-report");
      assert.equal(parsed.verdict.verdict, "hold");
      assert.match(parsed.markdown, /Agent Guardrails Pro Go-Live Report/);
    });

    it("writes a local Pro workbench view contract file", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-"));
      try {
        const { output, result } = await withMockInstalledPro(
          () => captureLogs(() => runProWorkbench({ flags: {}, locale: "en", repoRoot })),
          repoRoot
        );

        assert.equal(result.installed, true);
        assert.equal(result.action, "operator-workbench");
        assert.equal(result.state, "ready");
        assert.equal(result.format, "workbench-view");
        assert.match(output, /Operator workbench: ready/);
        assert.match(output, /Agent Guardrails Workbench \| BLOCKED \| High risk/);
        assert.match(output, /Can I ship this change\? -> No/);
        assert.match(output, /Next step/);
        assert.match(output, /\$ npm test -- auth/);
        assert.match(output, /Agent handoff/);
        assert.match(output, /Local view contract:/);
        assert.match(output, /Local native panel model:/);
        assert.equal(result.outputPath, undefined);
        assert.equal(fs.existsSync(result.viewPath), true);
        assert.equal(fs.existsSync(result.panelPath), true);
        const view = JSON.parse(fs.readFileSync(result.viewPath, "utf8"));
        const panel = JSON.parse(fs.readFileSync(result.panelPath, "utf8"));
        assert.equal(view.format, "agent-guardrails-workbench-view.v1");
        assert.equal(view.renderer, "structured-ui-contract");
        assert.equal(panel.format, "agent-guardrails-workbench-panel.v1");
        assert.equal(panel.sourceFormat, "agent-guardrails-workbench-view.v1");
        assert.equal(panel.renderer, "native-panel-model");
        assert.equal(panel.nextStep.command, "npm test -- auth");
        assert.equal(panel.handoff.intent, "handoff_to_agent");
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("prints machine-readable Pro workbench JSON", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-json-"));
      try {
        const { output } = await withMockInstalledPro(
          () => captureLogs(() => runProWorkbench({ flags: { json: true }, locale: "en", repoRoot })),
          repoRoot
        );
        const parsed = JSON.parse(output);

        assert.equal(parsed.installed, true);
        assert.equal(parsed.action, "operator-workbench");
        assert.equal(parsed.state, "ready");
        assert.equal(parsed.format, "workbench-view");
        assert.match(parsed.viewPath, /operator-workbench-view\.json$/);
        assert.match(parsed.panelPath, /operator-workbench-panel\.json$/);
        assert.equal(parsed.outputPath, undefined);
        assert.equal(parsed.view.format, "agent-guardrails-workbench-view.v1");
        assert.equal(parsed.panel.format, "agent-guardrails-workbench-panel.v1");
        assert.equal(parsed.panel.displayRules.rawJsonIsSupportingDetail, true);
        assert.equal(parsed.panel.displayRules.htmlIsLegacyFallback, true);
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("starts a live Pro workbench server with browser actions", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              assert.equal(result.installed, true);
              assert.match(result.liveUrl, /^http:\/\/127\.0\.0\.1:\d+\/$/);
              assert.equal(fs.existsSync(result.statePath), true);

              const page = await fetch(result.liveUrl);
              const html = await page.text();
              assert.equal(page.status, 200);
              assert.match(html, /Contract-first Workbench/);
              assert.doesNotMatch(html, /Agent Guardrails Pro Workbench<\/h1>/);
              assert.match(html, /Live mode/);
              assert.match(html, /Copy generic handoff/);
              assert.match(html, /Copy Codex handoff/);
              assert.match(html, /Copy Claude Code handoff/);
              assert.match(html, /Export handoff bundle/);
              assert.match(html, /Run current loop/);
              assert.match(html, /Finish visible check and rerun/);
              assert.match(html, /Rerun answer only/);
              assert.match(html, /Run next proof/);
              assert.match(html, /Run short loop/);
              assert.match(html, /Refresh answer/);
              assert.match(html, /Save note and rerun/);
              assert.match(html, /Evidence note/);

              const state = await fetch(new URL("/__agent_guardrails__/workbench/state", result.liveUrl));
              const parsed = await state.json();
              assert.equal(state.status, 200);
              assert.equal(parsed.action, "operator-workbench");
              assert.equal(parsed.state, "ready");
              assert.equal(parsed.panel.format, "agent-guardrails-workbench-panel.v1");
              assert.equal(parsed.panel.hero.question, "Can I ship this change?");
              assert.equal(parsed.panel.nextStep.command, "npm test -- auth");
              assert.equal(parsed.currentLoop.command, "npm test -- auth");
              assert.match(parsed.currentLoop.label, /Run required proof/i);
              assert.equal(parsed.automationHandoff.mode, "agent_runs_then_glance");
              assert.equal(parsed.automationHandoff.nextCommand, "npm test -- auth");
              assert.match(parsed.automationHandoff.copyBrief, /rerun agent-guardrails check --review/i);
              assert.match(parsed.handoffPackages.codex.text, /Run `npm test -- auth`/);
              assert.match(parsed.handoffPackages.claudeCode.text, /reviewer summary/i);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("captures proof notes and records proof outcomes from live workbench actions", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-proof-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              const runNext = await fetch(new URL("/__agent_guardrails__/workbench/run-next", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}"
              });
              const runNextJson = await runNext.json();
              assert.equal(runNext.status, 200);
              assert.equal(runNextJson.proofCapture.state, "captured");
              assert.match(runNextJson.statusMessage, /saved a proof note/i);
              assert.equal(runNextJson.automationHandoff.mode, "agent_runs_then_glance");
              assert.match(runNextJson.handoffPackages.codex.text, /Run `npm test -- auth`/);

              const record = await fetch(new URL("/__agent_guardrails__/workbench/record-outcome", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ outcome: "failed" })
              });
              const recordJson = await record.json();
              assert.equal(record.status, 200);
              assert.equal(recordJson.proofOutcome.state, "recorded");
              assert.equal(recordJson.liveSession.recordedOutcome, "failed");

              const state = await fetch(new URL("/__agent_guardrails__/workbench/state", result.liveUrl));
              const stateJson = await state.json();
              assert.equal(state.status, 200);
              assert.equal(stateJson.liveSession.code, "run-required-command");
              assert.equal(stateJson.liveSession.surface, "validation");
              assert.equal(stateJson.liveSession.recordedOutcome, "failed");

              const callsPath = path.join(repoRoot, ".agent-guardrails", "pro", "mock-tool-calls.json");
              const calls = JSON.parse(fs.readFileSync(callsPath, "utf8"));
              assert.deepEqual(calls.map(call => call.name), [
                "pro_capture_evidence_note",
                "pro_record_proof_outcome"
              ]);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("captures a manual evidence note and reruns from the live workbench", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-note-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              const capture = await fetch(new URL("/__agent_guardrails__/workbench/capture-note-rerun", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  summary: "Watched the auth flow fail safely in the browser.",
                  artifactPaths: ".agent-guardrails/evidence/visual/auth-watch.png",
                  outputExcerpt: "Observed a controlled auth failure and preserved the rollback path.",
                  outcome: "observed"
                })
              });
              const captureJson = await capture.json();
              assert.equal(capture.status, 200);
              assert.equal(captureJson.proofCapture.state, "captured");
              assert.match(captureJson.statusMessage, /Saved the evidence note and refreshed the answer/i);
              assert.equal(captureJson.currentLoop.command, "npm test -- auth");
              assert.equal(captureJson.liveSession.proofNoteState, "captured");
              assert.ok(captureJson.liveSession.evidencePaths.some(item => /current-task\.md$/.test(item)));

              const callsPath = path.join(repoRoot, ".agent-guardrails", "pro", "mock-tool-calls.json");
              const calls = JSON.parse(fs.readFileSync(callsPath, "utf8"));
              assert.equal(calls[0].name, "pro_capture_evidence_note");
              assert.equal(calls[0].args.outcome, "observed");
              assert.match(calls[0].args.summary, /auth flow fail safely/i);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("runs the current loop from the live workbench", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-current-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              const current = await fetch(new URL("/__agent_guardrails__/workbench/run-current", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}"
              });
              const currentJson = await current.json();
              assert.equal(current.status, 200);
              assert.equal(currentJson.proofCapture.state, "captured");
              assert.equal(currentJson.liveSession.command, "npm test -- auth");
              assert.equal(currentJson.currentLoop.command, "npm test -- auth");
              assert.match(currentJson.handoffPackages.codex.text, /Capture this evidence/i);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("exports a local handoff bundle from the live workbench", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-export-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              const exported = await fetch(new URL("/__agent_guardrails__/workbench/export-handoff", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}"
              });
              const exportedJson = await exported.json();
              assert.equal(exported.status, 200);
              assert.match(exportedJson.statusMessage, /Exported the handoff bundle/i);
              assert.equal(typeof exportedJson.handoffBundle.directory, "string");
              assert.equal(fs.existsSync(exportedJson.handoffBundle.directory), true);
              assert.ok(exportedJson.handoffBundle.files.some(item => /codex-handoff\.md$/.test(item)));
              assert.ok(exportedJson.handoffBundle.files.some(item => /manifest\.json$/.test(item)));

              const manifest = JSON.parse(fs.readFileSync(exportedJson.handoffBundle.manifestPath, "utf8"));
              assert.equal(manifest.format, "agent-guardrails-live-handoff-bundle.v1");
              assert.equal(manifest.currentLoop.command, "npm test -- auth");
              assert.equal(manifest.automationHandoff.mode, "agent_runs_then_glance");
              assert.match(fs.readFileSync(manifest.files.codex, "utf8"), /Run `npm test -- auth`/);

              const state = await fetch(new URL("/__agent_guardrails__/workbench/state", result.liveUrl));
              const stateJson = await state.json();
              assert.equal(state.status, 200);
              assert.equal(stateJson.handoffBundle.directory, exportedJson.handoffBundle.directory);
              assert.ok(stateJson.handoffBundle.files.some(item => /generic-handoff\.md$/.test(item)));
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("finishes a visible verification loop from the live workbench", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-visible-"));
      try {
        await withMockInstalledPro(
          async () => {
            const packageIndex = path.join(repoRoot, "node_modules", "@agent-guardrails", "pro", "index.js");
            const source = fs.readFileSync(packageIndex, "utf8");
            const updated = source.replace(
              "    operatorWorkbench: {",
              [
                "    operatorWorkbench: {",
                "      primaryAction: { type: 'visible_agent_verification', label: 'Watch the auth flow', command: 'npm test -- auth', description: 'Run a visible verification so the user can watch the auth flow and save proof.' },",
                "      visualVerification: {",
                "        state: 'recommended',",
                "        summary: 'Run a visible verification so the user can watch the auth flow and save proof.',",
                "        target: 'http://localhost:3000/login',",
                "        command: 'npm test -- auth',",
                "        watchPoints: ['login screen opens', 'error branch stays understandable', 'screenshot is saved'],",
                "        evidencePaths: ['.agent-guardrails/evidence/visual/login-watch.md', '.agent-guardrails/evidence/visual/screenshots/'],",
                "        steps: [",
                "          { code: 'open-visible-surface', instruction: 'Open the login screen visibly.', expectedObservation: 'The user can watch the login screen open.' },",
                "          { code: 'exercise-primary-path', instruction: 'Exercise the primary login flow.', expectedObservation: 'The user can see the success path.' },",
                "          { code: 'capture-visual-evidence', instruction: 'Capture a screenshot and note what happened.', expectedObservation: 'Saved visual proof is ready for the receipt.' }",
                "        ]",
                "      },"
              ].join("\\n")
            );
            fs.writeFileSync(packageIndex, updated, "utf8");

            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              const state = await fetch(new URL("/__agent_guardrails__/workbench/state", result.liveUrl));
              const stateJson = await state.json();
              assert.equal(state.status, 200);
              assert.equal(stateJson.currentLoop.isVisible, true);
              assert.equal(stateJson.visualVerification.target, "http://localhost:3000/login");

              const visible = await fetch(new URL("/__agent_guardrails__/workbench/complete-visible", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  summary: "Watched the login flow and the denied branch stayed readable.",
                  artifactPaths: ".agent-guardrails/evidence/visual/login-watch.png",
                  outputExcerpt: "Visible login check stayed stable and saved a screenshot."
                })
              });
              const visibleJson = await visible.json();
              assert.equal(visible.status, 200);
              assert.equal(visibleJson.proofCapture.state, "captured");
              assert.match(visibleJson.statusMessage, /visible check/i);
              assert.equal(visibleJson.currentLoop.isVisible, true);
              assert.ok(visibleJson.liveSession.evidencePaths.some(item => /current-task\.md$/.test(item)));

              const callsPath = path.join(repoRoot, ".agent-guardrails", "pro", "mock-tool-calls.json");
              const calls = JSON.parse(fs.readFileSync(callsPath, "utf8"));
              assert.equal(calls[0].name, "pro_capture_evidence_note");
              assert.equal(calls[0].args.outcome, "observed");
              assert.match(calls[0].args.summary, /denied branch stayed readable/i);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("runs a bounded short loop from the live workbench", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-loop-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "en", repoRoot });
            try {
              const loop = await fetch(new URL("/__agent_guardrails__/workbench/auto-loop", result.liveUrl), {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: "{}"
              });
              const loopJson = await loop.json();
              assert.equal(loop.status, 200);
              assert.equal(loopJson.liveSession.lastLoop.stepCount, 1);
              assert.equal(loopJson.liveSession.lastLoop.stopReason, "repeated_command");
              assert.equal(loopJson.liveSession.lastLoop.commands.length, 1);
              assert.equal(loopJson.liveSession.lastLoop.commands[0], "npm test -- auth");
              assert.match(loopJson.statusMessage, /Ran 1 short-loop step/i);
              assert.equal(loopJson.automationHandoff.mode, "agent_runs_then_glance");
              assert.match(loopJson.handoffPackages.claudeCode.text, /reviewer summary/i);

              const state = await fetch(new URL("/__agent_guardrails__/workbench/state", result.liveUrl));
              const stateJson = await state.json();
              assert.equal(state.status, 200);
              assert.equal(stateJson.liveSession.lastLoop.stepCount, 1);
              assert.equal(stateJson.liveSession.lastLoop.stopReason, "repeated_command");
              assert.equal(stateJson.liveSession.lastLoop.commands[0], "npm test -- auth");

              const callsPath = path.join(repoRoot, ".agent-guardrails", "pro", "mock-tool-calls.json");
              const calls = JSON.parse(fs.readFileSync(callsPath, "utf8"));
              assert.deepEqual(calls.map(call => call.name), [
                "pro_capture_evidence_note",
                "pro_record_proof_outcome"
              ]);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("localizes the live workbench handoff for Chinese", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-workbench-live-zh-"));
      try {
        await withMockInstalledPro(
          async () => {
            const result = await runProWorkbench({ flags: { live: true }, locale: "zh-CN", repoRoot });
            try {
              const page = await fetch(result.liveUrl);
              const html = await page.text();
              assert.equal(page.status, 200);
              assert.match(html, /实时模式/);
              assert.match(html, /复制 Codex 委托包/);
              assert.match(html, /运行短闭环/);

              const state = await fetch(new URL("/__agent_guardrails__/workbench/state", result.liveUrl));
              const parsed = await state.json();
              assert.equal(state.status, 200);
              assert.match(parsed.handoffPackages.codex.text, /请在这个仓库里继续使用 Agent Guardrails/);
              assert.match(parsed.handoffPackages.claudeCode.text, /reviewer summary/);
            } finally {
              result.liveServer?.close?.();
            }
          },
          repoRoot
        );
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });

    it("shows how to enable reports when Pro is not installed", async () => {
      const { output, result } = await captureLogs(() =>
        runCli(["pro", "report", "--lang", "en"])
      );

      assert.equal(result.installed, false);
      assert.match(output, /Agent Guardrails Pro/);
      assert.match(output, /Go-live report: unavailable/);
      assert.match(output, /npm install @agent-guardrails\/pro/);
    });

    it("loads Pro from the target repo node_modules", async () => {
      const repoRoot = fs.mkdtempSync(path.join(fs.realpathSync.native(process.env.TEMP || process.cwd()), "agent-guardrails-pro-local-"));
      try {
        const { result: status } = await withMockInstalledPro(
          () => captureLogs(() => runProStatus({ flags: { json: true }, locale: "en", repoRoot })),
          repoRoot
        );
        assert.equal(status.installed, true);
        assert.equal(status.packageVersion, "0.1.0-test");

        const { result: cleanup } = await withMockInstalledPro(
          () => captureLogs(() => runProCleanup({ flags: { json: true }, locale: "en", repoRoot })),
          repoRoot
        );
        assert.equal(cleanup.installed, true);
        assert.equal(cleanup.action, "proof-memory-cleanup");
        assert.equal(cleanup.state, "needs_cleanup");

        const { result: report } = await withMockInstalledPro(
          () => captureLogs(() => runProReport({ flags: { json: true }, locale: "en", repoRoot })),
          repoRoot
        );
        assert.equal(report.installed, true);
        assert.equal(report.action, "go-live-report");

        const { result: workbench } = await withMockInstalledPro(
          () => captureLogs(() => runProWorkbench({ flags: { json: true }, locale: "en", repoRoot })),
          repoRoot
        );
        assert.equal(workbench.installed, true);
        assert.equal(workbench.action, "operator-workbench");
        assert.equal(workbench.state, "ready");
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });
  });
}
