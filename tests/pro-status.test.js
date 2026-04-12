import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { runCli } from "../lib/cli.js";
import { runProStatus } from "../lib/commands/pro-status.js";

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

async function withMockInstalledPro(callback) {
  const packageDir = path.join(OSS_REPO_ROOT, "node_modules", "@agent-guardrails", "pro");
  const backupDir = path.join(OSS_REPO_ROOT, "node_modules", "@agent-guardrails", `.pro-backup-${process.pid}`);
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
    "    capabilities: [",
    "      { code: 'go-live-verdict', label: 'Go-live verdict', available: true },",
    "      { code: 'repo-memory', label: 'Repo memory calibration', available: true }",
    "    ],",
    "    integration: { activation: 'Install @agent-guardrails/pro and configure pro.licenseKey.' },",
    "    demoGoLiveDecision: {",
    "      verdict: 'hold',",
    "      riskTier: 'high',",
    "      why: ['Deploy-sensitive change is missing proof.'],",
    "      evidenceGaps: ['rollback note'],",
    "      nextBestActions: ['Add rollback note.']",
    "    }",
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
      assert.match(output, /Go-live verdict/);
      assert.match(output, /Demo go-live verdict: HOLD \(high\)/);
    });

    it("routes agent-guardrails pro status through the CLI", async () => {
      const { output } = await captureLogs(() => runCli(["pro", "status", "--lang", "en"]));

      assert.match(output, /Agent Guardrails Pro/);
      assert.match(output, /Status: not installed/);
    });
  });
}
