import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const scriptPath = path.join(repoRoot, "scripts", "build-rust-native.js");

function runScript(args) {
  const output = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (output.error) {
    throw output.error;
  }
  return output;
}

function rustBinaryName(platform = process.platform) {
  return platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs";
}

function testDryRunPlansCurrentPlatformNativeRuntime() {
  const output = runScript(["--dry-run"]);
  assert.equal(output.status, 0, output.stderr);

  const plan = JSON.parse(output.stdout);
  assert.equal(plan.dryRun, true);
  assert.deepEqual(plan.cargoArgs, [
    "build",
    "--locked",
    "-p",
    "agent-guardrails-cli",
    "--bin",
    "agent-guardrails-rs",
    "--release"
  ]);
  assert.equal(plan.packagePath, `native/${process.platform}-${process.arch}/${rustBinaryName()}`);
  assert.equal(plan.outputPath, path.join(repoRoot, "native", `${process.platform}-${process.arch}`, rustBinaryName()));
}

function testDryRunSupportsDebugProfile() {
  const output = runScript(["--dry-run", "--profile", "debug"]);
  assert.equal(output.status, 0, output.stderr);

  const plan = JSON.parse(output.stdout);
  assert.deepEqual(plan.cargoArgs, ["build", "--locked", "-p", "agent-guardrails-cli", "--bin", "agent-guardrails-rs"]);
  assert.equal(plan.sourcePath, path.join(repoRoot, "target", "debug", rustBinaryName()));
}

function testDryRunSupportsExplicitReleaseTarget() {
  const output = runScript([
    "--dry-run",
    "--target",
    "aarch64-apple-darwin"
  ]);
  assert.equal(output.status, 0, output.stderr);

  const plan = JSON.parse(output.stdout);
  assert.deepEqual(plan.cargoArgs, [
    "build",
    "--locked",
    "-p",
    "agent-guardrails-cli",
    "--bin",
    "agent-guardrails-rs",
    "--target",
    "aarch64-apple-darwin",
    "--release"
  ]);
  assert.equal(plan.platform, "darwin");
  assert.equal(plan.arch, "arm64");
  assert.equal(plan.packagePath, "native/darwin-arm64/agent-guardrails-rs");
  assert.equal(
    plan.sourcePath,
    path.join(repoRoot, "target", "aarch64-apple-darwin", "release", "agent-guardrails-rs")
  );
}

function testInvalidProfileFailsBeforeBuild() {
  const output = runScript(["--profile", "fast"]);
  assert.notEqual(output.status, 0);
  assert.match(output.stderr, /--profile must be debug or release/);
}

function testUnknownTargetRequiresPackagePlatformAndArch() {
  const output = runScript(["--dry-run", "--target", "custom-unknown-target"]);
  assert.notEqual(output.status, 0);
  assert.match(output.stderr, /Pass --platform and --arch explicitly/);
}

export async function run() {
  testDryRunPlansCurrentPlatformNativeRuntime();
  testDryRunSupportsDebugProfile();
  testDryRunSupportsExplicitReleaseTarget();
  testInvalidProfileFailsBeforeBuild();
  testUnknownTargetRequiresPackagePlatformAndArch();
}
