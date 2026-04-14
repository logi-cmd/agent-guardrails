import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../lib/cli.js";
import { runProCleanup, runProStatus } from "../lib/commands/pro-status.js";

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

async function withMockInstalledPro(callback, repoRoot = OSS_REPO_ROOT) {
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
  fs.writeFileSync(path.join(packageDir, "index.js"), [
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
    "      nextAction: { code: 'preview-proof-memory-cleanup', label: 'Preview proof memory cleanup', command: 'agent-guardrails pro status --json', policy: { staleAfterDays: 90, maxFailureCount: 2, recentCleanupDays: 30 }, value: 'Review cleanup candidates before archiving unreliable proof recipes.' },",
    "      userValue: 'Keeps repo memory useful by separating trusted proof habits from stale or failed advice.'",
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
    ""
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
      assert.match(output, /Last cleanup: 2026-04-13T00:00:00.000Z/);
      assert.match(output, /Recent cleanup/);
      assert.match(output, /Archived 1 proof recipe from active repo memory/);
      assert.match(output, /Commands: npm test/);
      assert.match(output, /Reasons: stale 200 days; failed 4x/);
      assert.match(output, /Next: Preview proof memory cleanup/);
      assert.match(output, /Command: agent-guardrails pro status --json/);
      assert.match(output, /Review cleanup candidates before archiving unreliable proof recipes/);
      assert.match(output, /Recently resolved/);
      assert.match(output, /Document rollback proof/);
      assert.match(output, /Closed Document rollback proof with docs\/release-checks\.md/);
      assert.match(output, /Future matching gaps will prioritize this proof recipe/);
      assert.match(output, /Why Pro matters/);
      assert.match(output, /Cheapest missing proof/);
      assert.match(output, /Go-live verdict/);
      assert.match(output, /Demo go-live verdict: HOLD \(high\)/);
    });

    it("routes agent-guardrails pro status through the CLI", async () => {
      const { output } = await captureLogs(() => runCli(["pro", "status", "--lang", "en"]));

      assert.match(output, /Agent Guardrails Pro/);
      assert.match(output, /Status: not installed/);
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
      } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
      }
    });
  });
}
