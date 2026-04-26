import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PRO_PACKAGE_NAME = "@agent-guardrails/pro";

export function shouldUseRustCheckRuntime(env = process.env) {
  return String(env.AGENT_GUARDRAILS_RUNTIME || "").toLowerCase() === "rust";
}

function rustBinaryName(platform = process.platform) {
  return platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs";
}

function rustPlatformTriple(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

export function rustRuntimeCandidates({
  root = packageRoot,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const binaryName = rustBinaryName(platform);
  return [
    path.join(root, "native", rustPlatformTriple(platform, arch), binaryName),
    path.join(root, "target", "debug", binaryName),
    path.join(root, "target", "release", binaryName)
  ];
}

export function packagedRustRuntimeCandidate({
  root = packageRoot,
  platform = process.platform,
  arch = process.arch
} = {}) {
  return path.join(root, "native", rustPlatformTriple(platform, arch), rustBinaryName(platform));
}

export function resolvePackagedRustCheckRuntime({
  root = packageRoot,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const candidate = packagedRustRuntimeCandidate({ root, platform, arch });
  return fs.existsSync(candidate) ? candidate : null;
}

function canResolvePackage(packageName, requireRoot) {
  try {
    const require = createRequire(requireRoot);
    try {
      require.resolve(packageName);
      return true;
    } catch {
      require.resolve(`${packageName}/package.json`);
      return true;
    }
  } catch {
    return false;
  }
}

export function hasInstalledProPackage({
  repoRoot = null,
  root = packageRoot
} = {}) {
  const requireRoots = [];
  if (repoRoot) {
    requireRoots.push(path.join(repoRoot, "package.json"));
  }
  requireRoots.push(path.join(root, "package.json"));
  return requireRoots.some((requireRoot) => canResolvePackage(PRO_PACKAGE_NAME, requireRoot));
}

export function selectCheckRuntime({
  env = process.env,
  root = packageRoot,
  repoRoot = null,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const requestedRuntime = String(env.AGENT_GUARDRAILS_RUNTIME || "auto").toLowerCase();
  if (requestedRuntime === "node" || requestedRuntime === "js") {
    return { kind: "node", reason: "forced-node" };
  }
  if (requestedRuntime === "rust") {
    return {
      kind: "rust",
      reason: "forced-rust",
      binary: resolveRustCheckRuntime({ env, root, platform, arch })
    };
  }
  if (requestedRuntime !== "auto") {
    throw new Error("AGENT_GUARDRAILS_RUNTIME must be one of: auto, node, rust.");
  }

  if (hasInstalledProPackage({ repoRoot, root })) {
    return { kind: "node", reason: "pro-package-installed" };
  }

  const packagedBinary = resolvePackagedRustCheckRuntime({ root, platform, arch });
  if (packagedBinary) {
    return { kind: "rust", reason: "packaged-rust", binary: packagedBinary };
  }

  return { kind: "node", reason: "no-packaged-rust" };
}

function selectPreviewRuntime(previewReason, {
  env = process.env,
  root = packageRoot,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const requestedRuntime = String(env.AGENT_GUARDRAILS_RUNTIME || "auto").toLowerCase();
  if (requestedRuntime === "node" || requestedRuntime === "js") {
    return { kind: "node", reason: "forced-node" };
  }
  if (requestedRuntime === "rust") {
    return {
      kind: "rust",
      reason: "forced-rust",
      binary: resolveRustCheckRuntime({ env, root, platform, arch })
    };
  }
  if (requestedRuntime !== "auto") {
    throw new Error("AGENT_GUARDRAILS_RUNTIME must be one of: auto, node, rust.");
  }

  return { kind: "node", reason: previewReason };
}

function selectPackagedRustRuntime(fallbackReason, {
  env = process.env,
  root = packageRoot,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const requestedRuntime = String(env.AGENT_GUARDRAILS_RUNTIME || "auto").toLowerCase();
  if (requestedRuntime === "node" || requestedRuntime === "js") {
    return { kind: "node", reason: "forced-node" };
  }
  if (requestedRuntime === "rust") {
    return {
      kind: "rust",
      reason: "forced-rust",
      binary: resolveRustCheckRuntime({ env, root, platform, arch })
    };
  }
  if (requestedRuntime !== "auto") {
    throw new Error("AGENT_GUARDRAILS_RUNTIME must be one of: auto, node, rust.");
  }

  const packagedBinary = resolvePackagedRustCheckRuntime({ root, platform, arch });
  if (packagedBinary) {
    return { kind: "rust", reason: "packaged-rust", binary: packagedBinary };
  }

  return { kind: "node", reason: fallbackReason };
}

export function selectPlanRuntime(options = {}) {
  return selectPackagedRustRuntime("plan-no-packaged-rust", options);
}

export function selectInitRuntime(options = {}) {
  return selectPackagedRustRuntime("init-no-packaged-rust", options);
}

export function selectSetupRuntime(options = {}) {
  return selectPackagedRustRuntime("setup-no-packaged-rust", options);
}

export function selectDoctorRuntime(options = {}) {
  return selectPackagedRustRuntime("doctor-no-packaged-rust", options);
}

export function selectEnforceRuntime(options = {}) {
  return selectPackagedRustRuntime("enforce-no-packaged-rust", options);
}

export function selectUnenforceRuntime(options = {}) {
  return selectPackagedRustRuntime("unenforce-no-packaged-rust", options);
}

export function selectGenerateAgentsRuntime(options = {}) {
  return selectPackagedRustRuntime("generate-agents-no-packaged-rust", options);
}

export function selectMcpRuntime(options = {}) {
  return selectPackagedRustRuntime("mcp-no-packaged-rust", options);
}

export function selectServeRuntime(options = {}) {
  return selectPackagedRustRuntime("serve-no-packaged-rust", options);
}

export function selectStartRuntime(options = {}) {
  return selectPackagedRustRuntime("start-no-packaged-rust", options);
}

export function selectStopRuntime(options = {}) {
  return selectPackagedRustRuntime("stop-no-packaged-rust", options);
}

export function selectStatusRuntime(options = {}) {
  return selectPackagedRustRuntime("status-no-packaged-rust", options);
}

export function selectWorkbenchPanelRuntime(options = {}) {
  return selectPackagedRustRuntime("workbench-panel-no-packaged-rust", options);
}

export function resolveRustCheckRuntime({
  env = process.env,
  root = packageRoot,
  platform = process.platform,
  arch = process.arch
} = {}) {
  const explicitBinary = env.AGENT_GUARDRAILS_RUST_BIN;
  if (explicitBinary) {
    if (!fs.existsSync(explicitBinary)) {
      throw new Error(`AGENT_GUARDRAILS_RUST_BIN does not exist: ${explicitBinary}`);
    }
    return explicitBinary;
  }

  for (const candidate of rustRuntimeCandidates({ root, platform, arch })) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "AGENT_GUARDRAILS_RUNTIME=rust was requested, but no Rust preview binary was found. " +
      `Looked for native/${rustPlatformTriple(platform, arch)}/${rustBinaryName(platform)} and source-checkout target binaries. ` +
      "Run `cargo build -p agent-guardrails-cli` from the source checkout or set AGENT_GUARDRAILS_RUST_BIN."
  );
}

const forwardedSignals = process.platform === "win32" ? ["SIGINT", "SIGTERM"] : ["SIGINT", "SIGTERM", "SIGHUP"];
const forwardedSignalExitCodes = new Map([
  ["SIGHUP", 129],
  ["SIGINT", 130],
  ["SIGTERM", 143]
]);

export async function runRustRuntime(
  command,
  commandArgs,
  { env = process.env, root = packageRoot, binary = null, stdio = "inherit", rejectOnNonZero = false } = {}
) {
  const resolvedBinary = binary ?? resolveRustCheckRuntime({ env, root });
  const childEnv = {
    ...env,
    AGENT_GUARDRAILS_PACKAGE_ROOT: env.AGENT_GUARDRAILS_PACKAGE_ROOT || root
  };

  return new Promise((resolve, reject) => {
    let parentSignal = null;
    const child = spawn(resolvedBinary, [command, ...commandArgs], {
      cwd: process.cwd(),
      env: childEnv,
      stdio,
      windowsHide: true
    });

    if (stdio === "pipe") {
      child.stdout?.on("data", (chunk) => {
        process.stdout.write(chunk);
      });
      child.stderr?.on("data", (chunk) => {
        process.stderr.write(chunk);
      });
    }

    const onParentExit = () => {
      if (!child.killed) {
        child.kill();
      }
    };
    const signalHandlers = new Map(forwardedSignals.map((signal) => [
      signal,
      () => {
        parentSignal = signal;
        if (!child.killed) {
          child.kill(signal);
        }
      }
    ]));
    const cleanup = () => {
      process.off("exit", onParentExit);
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
    };

    process.once("exit", onParentExit);
    for (const [signal, handler] of signalHandlers) {
      process.once(signal, handler);
    }

    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("exit", (code, signal) => {
      cleanup();
      if (parentSignal && signal === parentSignal) {
        process.exitCode = forwardedSignalExitCodes.get(parentSignal) ?? 1;
        resolve();
        return;
      }
      if (signal) {
        reject(new Error(`Rust ${command} runtime terminated by signal ${signal}.`));
        return;
      }
      if ((code ?? 1) !== 0 && rejectOnNonZero) {
        reject(new Error(`Rust ${command} runtime exited with code ${code ?? 1}.`));
        return;
      }
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

export async function runRustCheckRuntime(checkArgs, options = {}) {
  return runRustRuntime("check", checkArgs, options);
}
