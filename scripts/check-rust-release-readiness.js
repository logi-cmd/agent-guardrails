#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_FORMAT = "agent-guardrails-native-manifest.v1";
const releaseTargets = [
  { platform: "win32", arch: "x64", binary: "agent-guardrails-rs.exe" },
  { platform: "linux", arch: "x64", binary: "agent-guardrails-rs" },
  { platform: "darwin", arch: "x64", binary: "agent-guardrails-rs" },
  { platform: "darwin", arch: "arm64", binary: "agent-guardrails-rs" }
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function nativePathFor(target) {
  return path.join(repoRoot, "native", `${target.platform}-${target.arch}`, target.binary);
}

function manifestPathFor(target) {
  return `${nativePathFor(target)}.manifest.json`;
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

function readNativeManifest(target) {
  const manifestPath = manifestPathFor(target);
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      format: "invalid",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const flags = {
    requireCompleteNativeMatrix: false,
    requireRustDefault: false
  };

  for (const token of argv) {
    if (token === "--require-complete-native-matrix") {
      flags.requireCompleteNativeMatrix = true;
      continue;
    }
    if (token === "--require-rust-default") {
      flags.requireRustDefault = true;
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  return flags;
}

function hasScript(packageJson, name) {
  return typeof packageJson.scripts?.[name] === "string" && packageJson.scripts[name].trim().length > 0;
}

function selectorUsesPackagedRustDefault(source, selectorName, fallbackReason) {
  const pattern = new RegExp(
    `export function ${selectorName}\\(options = \\{\\}\\)\\s*\\{\\s*return selectPackagedRustRuntime\\("${fallbackReason}", options\\);\\s*\\}`,
    "s"
  );
  return pattern.test(source);
}

function checkReadiness(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  const packageJson = readJson("package.json");
  const runtimeSource = fs.readFileSync(path.join(repoRoot, "lib", "rust-runtime.js"), "utf8");
  const currentSourceSignature = rustSourceSignature();
  const currentTarget = {
    platform: process.platform,
    arch: process.arch,
    binary: process.platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs"
  };

  const targets = releaseTargets.map((target) => {
    const binaryPath = nativePathFor(target);
    const manifestPath = manifestPathFor(target);
    const manifest = readNativeManifest(target);
    const manifestFormatOk = manifest?.format === MANIFEST_FORMAT;
    const manifestMatchesTarget = Boolean(
      manifestFormatOk &&
      manifest.platform === target.platform &&
      manifest.arch === target.arch &&
      manifest.binary === "agent-guardrails-rs"
    );
    const sourceFresh = Boolean(
      manifestMatchesTarget &&
      typeof manifest.sourceSignature === "string" &&
      manifest.sourceSignature === currentSourceSignature
    );
    return {
      ...target,
      packagePath: path.relative(repoRoot, binaryPath).replace(/\\/g, "/"),
      manifestPath: path.relative(repoRoot, manifestPath).replace(/\\/g, "/"),
      present: fs.existsSync(binaryPath),
      manifestPresent: Boolean(manifest),
      manifestFormatOk,
      manifestMatchesTarget,
      sourceFresh
    };
  });
  const currentBinaryPath = nativePathFor(currentTarget);
  const currentTargetPresent = fs.existsSync(currentBinaryPath);
  const missingTargets = targets.filter((target) => !target.present);
  const staleTargets = targets.filter((target) => target.present && !target.sourceFresh);
  const packageFiles = packageJson.files ?? [];
  const includesNativeRoot = packageFiles.includes("native");

  const coreRustDefaults = {
    check: /selectCheckRuntime[\s\S]*packaged-rust/.test(runtimeSource),
    init: selectorUsesPackagedRustDefault(runtimeSource, "selectInitRuntime", "init-no-packaged-rust"),
    setup: selectorUsesPackagedRustDefault(runtimeSource, "selectSetupRuntime", "setup-no-packaged-rust"),
    plan: selectorUsesPackagedRustDefault(runtimeSource, "selectPlanRuntime", "plan-no-packaged-rust"),
    doctor: selectorUsesPackagedRustDefault(runtimeSource, "selectDoctorRuntime", "doctor-no-packaged-rust"),
    enforce: selectorUsesPackagedRustDefault(runtimeSource, "selectEnforceRuntime", "enforce-no-packaged-rust"),
    unenforce: selectorUsesPackagedRustDefault(runtimeSource, "selectUnenforceRuntime", "unenforce-no-packaged-rust"),
    generateAgents: selectorUsesPackagedRustDefault(
      runtimeSource,
      "selectGenerateAgentsRuntime",
      "generate-agents-no-packaged-rust"
    ),
    mcp: selectorUsesPackagedRustDefault(runtimeSource, "selectMcpRuntime", "mcp-no-packaged-rust")
  };
  const daemonAndServeRustDefaults = {
    start: selectorUsesPackagedRustDefault(runtimeSource, "selectStartRuntime", "start-no-packaged-rust"),
    stop: selectorUsesPackagedRustDefault(runtimeSource, "selectStopRuntime", "stop-no-packaged-rust"),
    status: selectorUsesPackagedRustDefault(runtimeSource, "selectStatusRuntime", "status-no-packaged-rust"),
    serve: selectorUsesPackagedRustDefault(runtimeSource, "selectServeRuntime", "serve-no-packaged-rust")
  };
  const uiRustDefaults = {
    workbenchPanel: selectorUsesPackagedRustDefault(
      runtimeSource,
      "selectWorkbenchPanelRuntime",
      "workbench-panel-no-packaged-rust"
    )
  };
  const coreRustDefaultReady = Object.values(coreRustDefaults).every(Boolean);
  const daemonAndServeRustDefaultReady = Object.values(daemonAndServeRustDefaults).every(Boolean);
  const uiRustDefaultReady = Object.values(uiRustDefaults).every(Boolean);
  const allRustDefaultReady = coreRustDefaultReady && daemonAndServeRustDefaultReady && uiRustDefaultReady;

  const blocking = [];
  const warnings = [];
  if (!includesNativeRoot) {
    blocking.push("package.json files must include native so packaged Rust binaries can ship when present.");
  }
  if (!hasScript(packageJson, "build:rust-native")) {
    blocking.push("package.json must expose build:rust-native.");
  }
  if (!hasScript(packageJson, "smoke:rust-installed")) {
    blocking.push("package.json must expose smoke:rust-installed.");
  }
  if (!coreRustDefaults.check) {
    blocking.push("check runtime must use packaged Rust when a native binary exists.");
  }
  if (flags.requireRustDefault && !allRustDefaultReady) {
    const missing = Object.entries({
      ...coreRustDefaults,
      ...daemonAndServeRustDefaults,
      ...uiRustDefaults
    })
      .filter(([, ready]) => !ready)
      .map(([name]) => name)
      .join(", ");
    blocking.push(`command selectors must default to packaged Rust when available. Missing: ${missing}`);
  }
  if (flags.requireCompleteNativeMatrix && missingTargets.length > 0) {
    blocking.push(
      `complete native matrix required but missing ${missingTargets.map((target) => target.packagePath).join(", ")}.`
    );
  }
  if (flags.requireCompleteNativeMatrix && staleTargets.length > 0) {
    blocking.push(
      `complete native matrix required but stale or unverified native manifests found for ${staleTargets.map((target) => target.packagePath).join(", ")}. Rebuild native artifacts from the current Rust source.`
    );
  }
  if (!currentTargetPresent) {
    warnings.push(
      `Current platform native binary is missing (${path.relative(repoRoot, currentBinaryPath).replace(/\\/g, "/")}); npm users on this platform will safely use Node unless build:rust-native runs before packing.`
    );
  }
  if (missingTargets.length > 0) {
    warnings.push(
      `Native matrix incomplete: missing ${missingTargets.map((target) => target.packagePath).join(", ")}. Users on missing platforms will safely fall back to Node.`
    );
  }
  if (staleTargets.length > 0) {
    warnings.push(
      `Native artifacts need refresh or manifests: ${staleTargets.map((target) => `${target.packagePath} (${target.manifestPresent ? "stale manifest" : "missing manifest"})`).join(", ")}.`
    );
  }
  if (!flags.requireRustDefault && !allRustDefaultReady) {
    warnings.push("Some commands are not set to packaged-Rust default. Use --require-rust-default in release CI.");
  }

  return {
    ok: blocking.length === 0,
    releaseMode:
      missingTargets.length === 0 && staleTargets.length === 0 && allRustDefaultReady
        ? "rust-default-with-node-fallback"
        : "node-fallback-with-rust-where-packaged",
    currentTarget: {
      ...currentTarget,
      packagePath: path.relative(repoRoot, currentBinaryPath).replace(/\\/g, "/"),
      present: currentTargetPresent
    },
    targets,
    checks: {
      packageIncludesNativeRoot: includesNativeRoot,
      hasBuildRustNativeScript: hasScript(packageJson, "build:rust-native"),
      hasInstalledRustSmokeScript: hasScript(packageJson, "smoke:rust-installed"),
      coreRustDefaults,
      coreRustDefaultReady,
      daemonAndServeRustDefaults,
      daemonAndServeRustDefaultReady,
      uiRustDefaults,
      uiRustDefaultReady,
      allRustDefaultReady,
      currentSourceSignature,
      requireCompleteNativeMatrix: flags.requireCompleteNativeMatrix,
      requireRustDefault: flags.requireRustDefault
    },
    blocking,
    warnings,
    nextActions:
      missingTargets.length === 0 && allRustDefaultReady
        ? [
            "Run the native package smoke after downloading all platform artifacts.",
            "Run npm publish --dry-run before publishing.",
            "Keep AGENT_GUARDRAILS_RUNTIME=node documented as the rollback path."
          ]
        : [
            "Keep Node fallback documented for platforms without native/*.",
            "Only claim Rust default on platforms where native/* is packaged.",
            "Before full Rust-default marketing, produce and verify all native target binaries in CI."
          ]
  };
}

try {
  const result = checkReadiness();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) {
    process.exit(1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
