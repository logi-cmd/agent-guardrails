import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function runNpm(args, cwd, env = {}) {
  return execFileSync(process.execPath, [npmCliPath, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function rustBinaryName(platform = process.platform) {
  return platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs";
}

const nativeTargets = [
  { platform: "win32", arch: "x64" },
  { platform: "linux", arch: "x64" },
  { platform: "darwin", arch: "x64" },
  { platform: "darwin", arch: "arm64" }
];

function packageFileNamesFromDryRun(output) {
  const packResults = JSON.parse(output);
  assert.equal(Array.isArray(packResults), true);
  assert.equal(packResults.length, 1);
  return new Set(packResults[0].files.map((file) => file.path));
}

function withPackableNativeRuntime(callback) {
  const createdFiles = [];
  const createdDirs = [];
  const nativeDirExisted = fs.existsSync(path.join(repoRoot, "native"));
  const packagePaths = [];

  for (const target of nativeTargets) {
    const nativeDir = path.join(repoRoot, "native", `${target.platform}-${target.arch}`);
    const nativeBinaryPath = path.join(nativeDir, rustBinaryName(target.platform));
    packagePaths.push(`native/${target.platform}-${target.arch}/${rustBinaryName(target.platform)}`);
    if (!fs.existsSync(nativeDir)) {
      createdDirs.push(nativeDir);
    }
    fs.mkdirSync(nativeDir, { recursive: true });
    if (!fs.existsSync(nativeBinaryPath)) {
      fs.writeFileSync(nativeBinaryPath, "placeholder for npm pack dry-run\n", "utf8");
      createdFiles.push(nativeBinaryPath);
    }
  }

  try {
    return callback({ packagePaths });
  } finally {
    for (const createdFile of createdFiles) {
      fs.rmSync(createdFile, { force: true });
    }
    for (const createdDir of createdDirs.reverse()) {
      if (fs.existsSync(createdDir) && fs.readdirSync(createdDir).length === 0) {
        fs.rmSync(createdDir, { recursive: true, force: true });
      }
    }
    if (!nativeDirExisted) {
      fs.rmSync(path.join(repoRoot, "native"), { recursive: true, force: true });
    }
  }
}

function testNpmPackIncludesRuntimeBridgeFiles() {
  const output = runNpm(["pack", "--dry-run", "--json"], repoRoot);
  const files = packageFileNamesFromDryRun(output);

  assert.equal(files.has("lib/rust-runtime.js"), true);
  assert.equal(files.has("bin/agent-guardrails.js"), true);
}

function testNpmPackIncludesNativeRuntimeMatrixWhenPresent() {
  withPackableNativeRuntime(({ packagePaths }) => {
    const output = runNpm(["pack", "--dry-run", "--json"], repoRoot);
    const files = packageFileNamesFromDryRun(output);

    for (const packagePath of packagePaths) {
      assert.equal(files.has(packagePath), true, `Expected npm pack to include ${packagePath}`);
    }
  });
}

export async function run() {
  testNpmPackIncludesRuntimeBridgeFiles();
  testNpmPackIncludesNativeRuntimeMatrixWhenPresent();
}
