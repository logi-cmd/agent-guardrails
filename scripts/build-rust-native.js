#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_FORMAT = "agent-guardrails-native-manifest.v1";

function parseArgs(argv) {
  const flags = {
    dryRun: false,
    profile: "release",
    target: null,
    platform: null,
    arch: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--dry-run") {
      flags.dryRun = true;
      continue;
    }
    if (token === "--profile") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--profile requires debug or release.");
      }
      flags.profile = next;
      index += 1;
      continue;
    }
    if (token === "--target") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--target requires a Rust target triple.");
      }
      flags.target = next;
      index += 1;
      continue;
    }
    if (token === "--platform") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--platform requires win32, linux, or darwin.");
      }
      flags.platform = next;
      index += 1;
      continue;
    }
    if (token === "--arch") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error("--arch requires x64 or arm64.");
      }
      flags.arch = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  if (!["debug", "release"].includes(flags.profile)) {
    throw new Error("--profile must be debug or release.");
  }
  if (flags.platform !== null && !["win32", "linux", "darwin"].includes(flags.platform)) {
    throw new Error("--platform must be win32, linux, or darwin.");
  }
  if (flags.arch !== null && !["x64", "arm64"].includes(flags.arch)) {
    throw new Error("--arch must be x64 or arm64.");
  }
  if ((flags.platform === null) !== (flags.arch === null)) {
    throw new Error("--platform and --arch must be provided together.");
  }

  return flags;
}

function rustBinaryName(platform = process.platform) {
  return platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs";
}

function rustManifestName(platform = process.platform) {
  return `${rustBinaryName(platform)}.manifest.json`;
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return listFilesRecursive(absolutePath);
    }
    return entry.isFile() ? [absolutePath] : [];
  });
}

function rustSourceSignature() {
  const relativeFiles = [
    "Cargo.lock",
    "Cargo.toml",
    "crates/agent-guardrails-cli/Cargo.toml",
    ...listFilesRecursive(path.join(repoRoot, "crates", "agent-guardrails-cli", "src"))
      .filter((filePath) => filePath.endsWith(".rs"))
      .map((filePath) => path.relative(repoRoot, filePath).replace(/\\/g, "/"))
  ].sort();

  const hash = createHash("sha256");
  for (const relativeFile of relativeFiles) {
    hash.update(`${relativeFile}\0`);
    hash.update(fs.readFileSync(path.join(repoRoot, relativeFile)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function inferPlatformArchFromTarget(target) {
  if (!target) return null;
  const knownTargets = new Map([
    ["x86_64-pc-windows-msvc", { platform: "win32", arch: "x64" }],
    ["x86_64-unknown-linux-gnu", { platform: "linux", arch: "x64" }],
    ["x86_64-apple-darwin", { platform: "darwin", arch: "x64" }],
    ["aarch64-apple-darwin", { platform: "darwin", arch: "arm64" }]
  ]);
  return knownTargets.get(target) ?? null;
}

function buildPlan({
  target = null,
  platform = process.platform,
  arch = process.arch,
  profile = "release"
} = {}) {
  const inferred = inferPlatformArchFromTarget(target);
  const resolvedPlatform = platform ?? inferred?.platform ?? process.platform;
  const resolvedArch = arch ?? inferred?.arch ?? process.arch;
  if (!resolvedPlatform || !resolvedArch) {
    throw new Error(`Unsupported Rust target triple for native package naming: ${target}`);
  }

  const binaryName = rustBinaryName(resolvedPlatform);
  const cargoArgs = ["build", "--locked", "-p", "agent-guardrails-cli", "--bin", "agent-guardrails-rs"];
  if (target) {
    cargoArgs.push("--target", target);
  }
  if (profile === "release") {
    cargoArgs.push("--release");
  }
  const sourcePath = target
    ? path.join(repoRoot, "target", target, profile, binaryName)
    : path.join(repoRoot, "target", profile, binaryName);

  return {
    cargoArgs,
    target,
    platform: resolvedPlatform,
    arch: resolvedArch,
    sourcePath,
    outputDir: path.join(repoRoot, "native", `${resolvedPlatform}-${resolvedArch}`),
    outputPath: path.join(repoRoot, "native", `${resolvedPlatform}-${resolvedArch}`, binaryName),
    manifestPath: path.join(repoRoot, "native", `${resolvedPlatform}-${resolvedArch}`, rustManifestName(resolvedPlatform)),
    packagePath: `native/${resolvedPlatform}-${resolvedArch}/${binaryName}`,
    manifestPackagePath: `native/${resolvedPlatform}-${resolvedArch}/${rustManifestName(resolvedPlatform)}`,
    sourceSignature: rustSourceSignature()
  };
}

function runCargoBuild(cargoArgs) {
  const result = spawnSync("cargo", cargoArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    windowsHide: true
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`cargo ${cargoArgs.join(" ")} failed with exit code ${result.status ?? 1}.`);
  }
}

export function buildRustNative(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  const inferred = inferPlatformArchFromTarget(flags.target);
  if (flags.target && !inferred && (!flags.platform || !flags.arch)) {
    throw new Error(`Unsupported Rust target triple for native package naming: ${flags.target}. Pass --platform and --arch explicitly.`);
  }
  const plan = buildPlan({
    target: flags.target,
    platform: flags.platform ?? inferred?.platform,
    arch: flags.arch ?? inferred?.arch,
    profile: flags.profile
  });

  if (flags.dryRun) {
    console.log(JSON.stringify({ ...plan, dryRun: true }, null, 2));
    return plan;
  }

  runCargoBuild(plan.cargoArgs);

  if (!fs.existsSync(plan.sourcePath)) {
    throw new Error(`Expected Rust binary was not produced: ${plan.sourcePath}`);
  }

  fs.mkdirSync(plan.outputDir, { recursive: true });
  fs.copyFileSync(plan.sourcePath, plan.outputPath);
  if (process.platform !== "win32") {
    fs.chmodSync(plan.outputPath, 0o755);
  }
  fs.writeFileSync(
    plan.manifestPath,
    `${JSON.stringify({
      format: MANIFEST_FORMAT,
      packageName: "agent-guardrails",
      binary: "agent-guardrails-rs",
      platform: plan.platform,
      arch: plan.arch,
      target: plan.target,
      profile: flags.profile,
      packagePath: plan.packagePath,
      sourceSignature: plan.sourceSignature,
      builtAt: new Date().toISOString()
    }, null, 2)}\n`,
    "utf8"
  );

  console.log(`Built ${plan.packagePath}`);
  console.log(`Wrote ${plan.manifestPackagePath}`);
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildRustNative();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
