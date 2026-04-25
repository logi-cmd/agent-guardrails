import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  packagedRustRuntimeCandidate,
  resolveRustCheckRuntime,
  hasInstalledProPackage,
  selectCheckRuntime,
  selectDoctorRuntime,
  selectEnforceRuntime,
  selectGenerateAgentsRuntime,
  selectInitRuntime,
  selectMcpRuntime,
  selectPlanRuntime,
  selectServeRuntime,
  selectSetupRuntime,
  selectStartRuntime,
  selectStatusRuntime,
  selectStopRuntime,
  selectUnenforceRuntime,
  rustRuntimeCandidates,
  shouldUseRustCheckRuntime
} from "../lib/rust-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withTempDir(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-rust-runtime-"));
  try {
    return callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function withTempDirAsync(callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-rust-runtime-"));
  try {
    return await callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function testRuntimeFlagIsExplicit() {
  assert.equal(shouldUseRustCheckRuntime({}), false);
  assert.equal(shouldUseRustCheckRuntime({ AGENT_GUARDRAILS_RUNTIME: "node" }), false);
  assert.equal(shouldUseRustCheckRuntime({ AGENT_GUARDRAILS_RUNTIME: "rust" }), true);
  assert.equal(shouldUseRustCheckRuntime({ AGENT_GUARDRAILS_RUNTIME: "RUST" }), true);
}

function testPackagedRuntimeCandidateUsesNpmNativePath() {
  withTempDir((tempDir) => {
    assert.equal(
      packagedRustRuntimeCandidate({
        root: tempDir,
        platform: "linux",
        arch: "x64"
      }),
      path.join(tempDir, "native", "linux-x64", "agent-guardrails-rs")
    );
  });
}

function testDefaultRuntimeUsesNodeWhenPackagedRustIsAbsent() {
  withTempDir((tempDir) => {
    assert.deepEqual(
      selectCheckRuntime({
        env: {},
        root: tempDir,
        platform: "win32",
        arch: "x64"
      }),
      { kind: "node", reason: "no-packaged-rust" }
    );
  });
}

function testDefaultRuntimeUsesPackagedRustWhenPresent() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "native", "win32-x64", "agent-guardrails-rs.exe");
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.writeFileSync(binaryPath, "", "utf8");

    assert.deepEqual(
      selectCheckRuntime({
        env: {},
        root: tempDir,
        platform: "win32",
        arch: "x64"
      }),
      { kind: "rust", reason: "packaged-rust", binary: binaryPath }
    );
  });
}

function testDefaultCheckRuntimeUsesNodeWhenProIsInstalledInRepo() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "native", "win32-x64", "agent-guardrails-rs.exe");
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.writeFileSync(binaryPath, "", "utf8");

    const repoRoot = path.join(tempDir, "repo");
    fs.mkdirSync(path.join(repoRoot, "node_modules", "@agent-guardrails", "pro"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "package.json"), "{}", "utf8");
    fs.writeFileSync(
      path.join(repoRoot, "node_modules", "@agent-guardrails", "pro", "package.json"),
      `${JSON.stringify({ name: "@agent-guardrails/pro", version: "0.0.0" })}\n`,
      "utf8"
    );

    assert.equal(hasInstalledProPackage({ repoRoot, root: tempDir }), true);
    assert.deepEqual(
      selectCheckRuntime({
        env: {},
        root: tempDir,
        repoRoot,
        platform: "win32",
        arch: "x64"
      }),
      { kind: "node", reason: "pro-package-installed" }
    );
  });
}

function testNodeRuntimeCanBeForcedEvenWhenPackagedRustExists() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "native", "win32-x64", "agent-guardrails-rs.exe");
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.writeFileSync(binaryPath, "", "utf8");

    assert.deepEqual(
      selectCheckRuntime({
        env: { AGENT_GUARDRAILS_RUNTIME: "node" },
        root: tempDir,
        platform: "win32",
        arch: "x64"
      }),
      { kind: "node", reason: "forced-node" }
    );
  });
}

function testInvalidRuntimeSelectionFailsActionably() {
  withTempDir((tempDir) => {
    assert.throws(
      () =>
        selectCheckRuntime({
          env: { AGENT_GUARDRAILS_RUNTIME: "python" },
          root: tempDir,
          platform: "win32",
          arch: "x64"
        }),
      /AGENT_GUARDRAILS_RUNTIME must be one of: auto, node, rust/
    );
  });
}

function testCoreRuntimesUsePackagedRustByDefaultWhenPresent() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "native", "win32-x64", "agent-guardrails-rs.exe");
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.writeFileSync(binaryPath, "", "utf8");

    const selectors = [
      [selectPlanRuntime, "plan-no-packaged-rust"],
      [selectInitRuntime, "init-no-packaged-rust"],
      [selectSetupRuntime, "setup-no-packaged-rust"],
      [selectDoctorRuntime, "doctor-no-packaged-rust"],
      [selectEnforceRuntime, "enforce-no-packaged-rust"],
      [selectUnenforceRuntime, "unenforce-no-packaged-rust"],
      [selectGenerateAgentsRuntime, "generate-agents-no-packaged-rust"],
      [selectMcpRuntime, "mcp-no-packaged-rust"],
      [selectStartRuntime, "start-no-packaged-rust"],
      [selectStopRuntime, "stop-no-packaged-rust"],
      [selectStatusRuntime, "status-no-packaged-rust"],
      [selectServeRuntime, "serve-no-packaged-rust"]
    ];

    for (const [selector, fallbackReason] of selectors) {
      assert.deepEqual(
        selector({
          env: {},
          root: tempDir,
          platform: "win32",
          arch: "x64"
        }),
        { kind: "rust", reason: "packaged-rust", binary: binaryPath }
      );
      assert.deepEqual(
        selector({
          env: { AGENT_GUARDRAILS_RUNTIME: "node" },
          root: tempDir,
          platform: "win32",
          arch: "x64"
        }),
        { kind: "node", reason: "forced-node" }
      );
      assert.deepEqual(
        selector({
          env: { AGENT_GUARDRAILS_RUNTIME: "rust" },
          root: tempDir,
          platform: "win32",
          arch: "x64"
        }),
        { kind: "rust", reason: "forced-rust", binary: binaryPath }
      );
      assert.deepEqual(
        selector({
          env: {},
          root: tempDir,
          platform: "linux",
          arch: "x64"
        }),
        { kind: "node", reason: fallbackReason }
      );
    }
  });
}

function testExplicitRustBinaryMustExist() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "agent-guardrails-rs.exe");
    fs.writeFileSync(binaryPath, "", "utf8");

    assert.equal(
      resolveRustCheckRuntime({
        env: { AGENT_GUARDRAILS_RUST_BIN: binaryPath },
        root: tempDir,
        platform: "win32"
      }),
      binaryPath
    );
  });
}

function testSourceCheckoutBinaryFallback() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "target", "debug", "agent-guardrails-rs.exe");
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.writeFileSync(binaryPath, "", "utf8");

    assert.equal(
      resolveRustCheckRuntime({
        env: {},
        root: tempDir,
        platform: "win32"
      }),
      binaryPath
    );
  });
}

function testPackagedPlatformBinaryFallback() {
  withTempDir((tempDir) => {
    const binaryPath = path.join(tempDir, "native", "win32-x64", "agent-guardrails-rs.exe");
    fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
    fs.writeFileSync(binaryPath, "", "utf8");

    assert.equal(
      resolveRustCheckRuntime({
        env: {},
        root: tempDir,
        platform: "win32",
        arch: "x64"
      }),
      binaryPath
    );
  });
}

function testPackagedBinaryPrecedesSourceCheckoutBinary() {
  withTempDir((tempDir) => {
    const packagedBinaryPath = path.join(tempDir, "native", "linux-arm64", "agent-guardrails-rs");
    const sourceBinaryPath = path.join(tempDir, "target", "debug", "agent-guardrails-rs");
    fs.mkdirSync(path.dirname(packagedBinaryPath), { recursive: true });
    fs.mkdirSync(path.dirname(sourceBinaryPath), { recursive: true });
    fs.writeFileSync(packagedBinaryPath, "", "utf8");
    fs.writeFileSync(sourceBinaryPath, "", "utf8");

    assert.equal(
      resolveRustCheckRuntime({
        env: {},
        root: tempDir,
        platform: "linux",
        arch: "arm64"
      }),
      packagedBinaryPath
    );
  });
}

function testRustRuntimeCandidateOrderIsStable() {
  withTempDir((tempDir) => {
    assert.deepEqual(
      rustRuntimeCandidates({
        root: tempDir,
        platform: "darwin",
        arch: "arm64"
      }),
      [
        path.join(tempDir, "native", "darwin-arm64", "agent-guardrails-rs"),
        path.join(tempDir, "target", "debug", "agent-guardrails-rs"),
        path.join(tempDir, "target", "release", "agent-guardrails-rs")
      ]
    );
  });
}

function testMissingRustRuntimeHasActionableError() {
  withTempDir((tempDir) => {
    assert.throws(
      () =>
        resolveRustCheckRuntime({
          env: {},
          root: tempDir,
          platform: "win32"
        }),
      /cargo build -p agent-guardrails-cli/
    );
    assert.throws(
      () =>
        resolveRustCheckRuntime({
          env: {},
          root: tempDir,
          platform: "win32",
          arch: "x64"
        }),
      /native\/win32-x64\/agent-guardrails-rs\.exe/
    );
  });
}

function runCommand(command, args, options = {}) {
  const output = spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    ...options
  });
  if (output.error) {
    throw output.error;
  }
  return output;
}

function encodeMcpFrame(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  return Buffer.concat([
    Buffer.from(`Content-Length: ${payload.length}\r\n\r\n`, "utf8"),
    payload
  ]);
}

function createMcpClient(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    ...options
  });
  let stdoutBuffer = Buffer.alloc(0);
  let stderr = "";
  let nextId = 1;
  let closed = false;
  const pending = new Map();

  function rejectAll(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  function handleMessage(message) {
    if (message.id === undefined || message.id === null) {
      return;
    }
    const key = String(message.id);
    const waiter = pending.get(key);
    if (!waiter) {
      return;
    }
    pending.delete(key);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  function drainStdout() {
    while (stdoutBuffer.length > 0) {
      const headerEnd = stdoutBuffer.indexOf(Buffer.from("\r\n\r\n", "utf8"));
      if (headerEnd === -1) {
        return;
      }
      const header = stdoutBuffer.subarray(0, headerEnd).toString("utf8");
      const match = /^Content-Length:\s*(\d+)$/im.exec(header);
      assert.ok(match, `Missing MCP Content-Length header in ${JSON.stringify(header)}`);
      const contentLength = Number.parseInt(match[1], 10);
      const payloadStart = headerEnd + 4;
      const payloadEnd = payloadStart + contentLength;
      if (stdoutBuffer.length < payloadEnd) {
        return;
      }
      const payload = stdoutBuffer.subarray(payloadStart, payloadEnd).toString("utf8");
      stdoutBuffer = stdoutBuffer.subarray(payloadEnd);
      handleMessage(JSON.parse(payload));
    }
  }

  child.stdout.on("data", (chunk) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    drainStdout();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });
  child.on("error", (error) => {
    closed = true;
    rejectAll(error);
  });
  child.on("close", (code) => {
    closed = true;
    if (pending.size > 0) {
      rejectAll(new Error(`MCP process exited with code ${code ?? 1}. stderr: ${stderr}`));
    }
  });

  return {
    request(method, params = {}, timeoutMs = 15_000) {
      if (closed) {
        return Promise.reject(new Error(`MCP process is already closed. stderr: ${stderr}`));
      }
      const id = nextId++;
      const message = { jsonrpc: "2.0", id, method, params };
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(String(id));
          child.kill();
          reject(new Error(`Timed out waiting for MCP ${method}. stderr: ${stderr}`));
        }, timeoutMs);
        pending.set(String(id), { resolve, reject, timer });
        child.stdin.write(encodeMcpFrame(message));
      });
    },
    notify(method, params = {}) {
      if (!closed) {
        child.stdin.write(encodeMcpFrame({ jsonrpc: "2.0", method, params }));
      }
    },
    close() {
      if (closed) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        child.once("close", (code) => {
          if (code === 0 || code === null) {
            resolve();
            return;
          }
          reject(new Error(`MCP process exited with code ${code}. stderr: ${stderr}`));
        });
        child.stdin.end();
      });
    }
  };
}

function git(cwd, args) {
  const output = runCommand("git", args, { cwd });
  assert.equal(output.status, 0, output.stderr);
}

function builtRustBinaryPath() {
  const binaryName = process.platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs";
  return path.join(repoRoot, "target", "debug", binaryName);
}

function writePlanConfig(root) {
  fs.mkdirSync(path.join(root, ".agent-guardrails"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agent-guardrails", "config.json"),
    `${JSON.stringify({
      preset: "generic",
      workflow: {
        planDefaults: {
          allowedPaths: ["src/", "tests/"],
          requiredCommands: ["node tests/service.test.js"],
          evidencePaths: [".agent-guardrails/evidence/current-task.md"]
        },
        readBeforeWrite: ["AGENTS.md", "README.md"],
        constraints: ["Keep the change small."],
        definitionOfDone: ["Tests pass."]
      },
      checks: {
        sourceRoots: ["src"],
        testRoots: ["tests"]
      }
    }, null, 2)}\n`,
    "utf8"
  );
}

function seedRustMcpLoopSmokeRepo(root) {
  fs.mkdirSync(path.join(root, ".agent-guardrails"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agent-guardrails", "config.json"),
    `${JSON.stringify({
      preset: "generic",
      workflow: {
        planDefaults: {
          allowedPaths: ["src/", "tests/"],
          requiredCommands: ["npm test"],
          evidencePaths: [".agent-guardrails/evidence/current-task.md"]
        },
        readBeforeWrite: ["AGENTS.md"],
        constraints: ["Keep the change small and test-backed."],
        definitionOfDone: ["The service behavior and matching test both pass."]
      },
      checks: {
        allowedPaths: ["src/", "tests/"],
        sourceRoots: ["src"],
        testRoots: ["tests"],
        sourceExtensions: [".js"],
        testExtensions: [".test.js"],
        consistency: {
          maxChangedFilesPerTask: 12,
          maxTopLevelEntries: 4
        },
        correctness: {
          requireTestsWithSourceChanges: true
        }
      }
    }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(root, ".gitignore"),
    ".agent-guardrails/task-contract.json\n.agent-guardrails/evidence/\nnode_modules/\n",
    "utf8"
  );
  fs.writeFileSync(path.join(root, "AGENTS.md"), "# Agent instructions\nKeep edits bounded.\n", "utf8");
  fs.writeFileSync(path.join(root, "docs", "PROJECT_STATE.md"), "# Project state\n", "utf8");
  fs.writeFileSync(path.join(root, "docs", "PR_CHECKLIST.md"), "# PR checklist\n", "utf8");
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ type: "module", scripts: { test: "node tests/service.test.js" } }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(root, "src", "service.js"), "export function message() {\n  return \"old\";\n}\n", "utf8");
  fs.writeFileSync(
    path.join(root, "tests", "service.test.js"),
    "import assert from \"node:assert/strict\";\nimport { message } from \"../src/service.js\";\n\nassert.equal(message(), \"old\");\n",
    "utf8"
  );
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Agent Guardrails Runtime Test"]);
  git(root, ["config", "core.autocrlf", "false"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial"]);
}

function readPlanContract(root) {
  return JSON.parse(fs.readFileSync(path.join(root, ".agent-guardrails", "task-contract.json"), "utf8"));
}

function stableInitSnapshot(root, home) {
  return {
    agents: fs.existsSync(path.join(root, "AGENTS.md")),
    claude: fs.existsSync(path.join(root, "CLAUDE.md")),
    gemini: fs.existsSync(path.join(root, "GEMINI.md")),
    codex: fs.existsSync(path.join(root, ".codex", "instructions.md")),
    cursor: fs.existsSync(path.join(root, ".cursor", "rules", "agent-guardrails.mdc")),
    projectState: fs.existsSync(path.join(root, "docs", "PROJECT_STATE.md")),
    prChecklist: fs.existsSync(path.join(root, "docs", "PR_CHECKLIST.md")),
    taskTemplate: fs.existsSync(path.join(root, ".agent-guardrails", "tasks", "TASK_TEMPLATE.md")),
    implementPrompt: fs.existsSync(path.join(root, ".agent-guardrails", "prompts", "IMPLEMENT_PROMPT.md")),
    config: JSON.parse(fs.readFileSync(path.join(root, ".agent-guardrails", "config.json"), "utf8")).preset,
    workflow: fs.existsSync(path.join(root, ".github", "workflows", "agent-guardrails.yml")),
    slashCheck: fs.existsSync(path.join(home, ".claude", "commands", "ag", "check.md")),
    slashPlan: fs.existsSync(path.join(home, ".claude", "commands", "ag", "plan.md")),
    slashReview: fs.existsSync(path.join(home, ".claude", "commands", "ag", "review.md")),
    slashFix: fs.existsSync(path.join(home, ".claude", "commands", "ag", "fix.md")),
    slashStatus: fs.existsSync(path.join(home, ".claude", "commands", "ag", "status.md"))
  };
}

function stableSetupSnapshot(root, home, agent) {
  return {
    agent,
    configPreset: JSON.parse(fs.readFileSync(path.join(root, ".agent-guardrails", "config.json"), "utf8")).preset,
    agents: fs.existsSync(path.join(root, "AGENTS.md")),
    claude: fs.existsSync(path.join(root, "CLAUDE.md")),
    claudeSettings: fs.existsSync(path.join(root, ".claude", "settings.json")),
    claudePreHook: fs.existsSync(path.join(root, ".agent-guardrails", "hooks", "claude-code-pre-tool.cjs")),
    claudePostHook: fs.existsSync(path.join(root, ".agent-guardrails", "hooks", "claude-code-post-tool.cjs")),
    mcpJson: fs.existsSync(path.join(root, ".mcp.json")),
    opencodeJson: fs.existsSync(path.join(root, "opencode.json")),
    opencodePlugin: fs.existsSync(path.join(root, ".opencode", "plugins", "guardrails.js")),
    codexInstructions: fs.existsSync(path.join(root, ".codex", "instructions.md")),
    slashCheck: fs.existsSync(path.join(home, ".claude", "commands", "ag", "check.md"))
  };
}

function stableDoctorSnapshot(output) {
  const result = JSON.parse(output.stdout);
  return {
    ok: result.ok,
    checkKeys: result.checks.map((check) => check.key),
    passed: Object.fromEntries(result.checks.map((check) => [check.key, check.passed]))
  };
}

function stablePlanContractFields(contract) {
  return {
    schemaVersion: contract.schemaVersion,
    task: contract.task,
    preset: contract.preset,
    allowedPaths: contract.allowedPaths,
    intendedFiles: contract.intendedFiles,
    protectedPaths: contract.protectedPaths,
    allowedChangeTypes: contract.allowedChangeTypes,
    riskLevel: contract.riskLevel,
    requiresReviewNotes: contract.requiresReviewNotes,
    validationProfile: contract.validationProfile,
    requiredCommands: contract.requiredCommands,
    evidencePaths: contract.evidencePaths,
    acceptanceCriteria: contract.acceptanceCriteria,
    rollbackNotes: contract.rollbackNotes,
    sessionContractSource: contract.session?.contractSource,
    sessionRequiredCommandsSuggested: contract.session?.requiredCommandsSuggested,
    sessionEvidencePathSuggested: contract.session?.evidencePathSuggested
  };
}

function testNodeCliReportsMissingRustBinaryBeforeNodeCheck() {
  withTempDir((tempDir) => {
    const missingBinary = path.join(tempDir, "missing-rust-runtime.exe");
    const output = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "check", "--json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: missingBinary
        }
      }
    );

    assert.notEqual(output.status, 0);
    assert.match(output.stderr, /AGENT_GUARDRAILS_RUST_BIN does not exist/);
  });
}

function testNodeCliDelegatesCheckToBuiltRustRuntimeWhenAvailable() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    git(tempDir, ["init"]);
    git(tempDir, ["config", "user.email", "test@example.com"]);
    git(tempDir, ["config", "user.name", "Agent Guardrails Rust Runtime Test"]);
    git(tempDir, ["config", "core.autocrlf", "false"]);

    fs.mkdirSync(path.join(tempDir, ".agent-guardrails"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "docs"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(tempDir, "tests"), { recursive: true });
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Agent instructions\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "docs", "PROJECT_STATE.md"), "# Project state\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "docs", "PR_CHECKLIST.md"), "# PR checklist\n", "utf8");
    fs.writeFileSync(
      path.join(tempDir, ".agent-guardrails", "config.json"),
      `${JSON.stringify({
        preset: "generic",
        checks: {
          sourceRoots: ["src"],
          sourceExtensions: [".js"],
          testRoots: ["tests"],
          testExtensions: [".js"],
          correctness: {
            requireTestsWithSourceChanges: true
          }
        }
      }, null, 2)}\n`,
      "utf8"
    );
    fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const value = 1;\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const covered = true;\n", "utf8");

    git(tempDir, ["add", "."]);
    git(tempDir, ["commit", "-m", "initial"]);

    fs.writeFileSync(path.join(tempDir, "src", "service.js"), "export const value = 2;\n", "utf8");
    fs.writeFileSync(path.join(tempDir, "tests", "service.test.js"), "export const covered = 'updated';\n", "utf8");

    const output = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "check", "--json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(output.status, 0, output.stderr || output.stdout);
    const result = JSON.parse(output.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.counts.sourceFiles, 1);
    assert.equal(result.counts.testFiles, 1);
    assert.equal(result.scoreVerdict, "safe-to-deploy");
  });
}

function testNodeAndRustPlanContractsMatchForExplicitScope() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime plan parity: Rust preview binary is not built.");
    return;
  }

  const planArgs = [
    "plan",
    "--task",
    "Add refund status transitions",
    "--allow-paths",
    "src/,tests/",
    "--intended-files",
    "src/orders/refund.js,tests/refund.test.js",
    "--protected-paths",
    "src/contracts/",
    "--allowed-change-types",
    "implementation-only",
    "--risk-level",
    "high",
    "--requires-review-notes",
    "true",
    "--validation-profile",
    "strict",
    "--required-commands",
    "npm test,npm run lint",
    "--evidence",
    "docs/checks.txt,.agent-guardrails/evidence/task.txt",
    "--acceptance-criteria",
    "Refund status is persisted,Refund transition emits an audit log",
    "--rollback-notes",
    "Revert refund transition patch only"
  ];

  withTempDir((nodeDir) => {
    withTempDir((rustDir) => {
      writePlanConfig(nodeDir);
      writePlanConfig(rustDir);

      const nodeOutput = runCommand(process.execPath, [path.join(repoRoot, "bin", "agent-guardrails.js"), ...planArgs], {
        cwd: nodeDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "node"
        }
      });
      assert.equal(nodeOutput.status, 0, nodeOutput.stderr || nodeOutput.stdout);

      const rustOutput = runCommand(process.execPath, [path.join(repoRoot, "bin", "agent-guardrails.js"), ...planArgs], {
        cwd: rustDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      });
      assert.equal(rustOutput.status, 0, rustOutput.stderr || rustOutput.stdout);

      assert.deepEqual(
        stablePlanContractFields(readPlanContract(rustDir)),
        stablePlanContractFields(readPlanContract(nodeDir))
      );
    });
  });
}

function testNodeAndRustInitGeneratedFilesMatchForCoreSetup() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime init parity: Rust preview binary is not built.");
    return;
  }

  const initArgs = [
    "init",
    "--preset",
    "nextjs",
    "--adapter",
    "codex,claude-code,cursor,gemini",
    "--lang",
    "en"
  ];

  withTempDir((nodeDir) => {
    withTempDir((nodeHome) => {
      withTempDir((rustDir) => {
        withTempDir((rustHome) => {
          const nodeOutput = runCommand(
            process.execPath,
            [path.join(repoRoot, "bin", "agent-guardrails.js"), ...initArgs, nodeDir],
            {
              cwd: nodeDir,
              env: {
                ...process.env,
                AGENT_GUARDRAILS_RUNTIME: "node",
                HOME: nodeHome,
                USERPROFILE: nodeHome
              }
            }
          );
          assert.equal(nodeOutput.status, 0, nodeOutput.stderr || nodeOutput.stdout);

          const rustOutput = runCommand(
            process.execPath,
            [path.join(repoRoot, "bin", "agent-guardrails.js"), ...initArgs, rustDir],
            {
              cwd: rustDir,
              env: {
                ...process.env,
                AGENT_GUARDRAILS_RUNTIME: "rust",
                AGENT_GUARDRAILS_RUST_BIN: rustBinary,
                HOME: rustHome,
                USERPROFILE: rustHome
              }
            }
          );
          assert.equal(rustOutput.status, 0, rustOutput.stderr || rustOutput.stdout);

          assert.deepEqual(stableInitSnapshot(rustDir, rustHome), stableInitSnapshot(nodeDir, nodeHome));
        });
      });
    });
  });
}

function testNodeCliDelegatesInitToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime init e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    withTempDir((homeDir) => {
      const output = runCommand(
        process.execPath,
        [
          path.join(repoRoot, "bin", "agent-guardrails.js"),
          "init",
          tempDir,
          "--preset",
          "nextjs",
          "--adapter",
          "codex,claude-code,cursor,gemini"
        ],
        {
          cwd: tempDir,
          env: {
            ...process.env,
            AGENT_GUARDRAILS_RUNTIME: "rust",
            AGENT_GUARDRAILS_RUST_BIN: rustBinary,
            HOME: homeDir,
            USERPROFILE: homeDir
          }
        }
      );

      assert.equal(output.status, 0, output.stderr || output.stdout);
      assert.match(output.stdout, /Initialized agent-guardrails/);
      assert.equal(fs.existsSync(path.join(tempDir, ".agent-guardrails", "config.json")), true);
      assert.equal(fs.existsSync(path.join(tempDir, "AGENTS.md")), true);
      assert.equal(fs.existsSync(path.join(tempDir, "CLAUDE.md")), true);
      assert.equal(fs.existsSync(path.join(tempDir, ".codex", "instructions.md")), true);
      assert.equal(fs.existsSync(path.join(homeDir, ".claude", "commands", "ag", "check.md")), true);
      const config = JSON.parse(fs.readFileSync(path.join(tempDir, ".agent-guardrails", "config.json"), "utf8"));
      assert.equal(config.preset, "nextjs");
    });
  });
}

function testNodeAndRustSetupGeneratedFilesMatchForClaudeCode() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime setup parity: Rust preview binary is not built.");
    return;
  }

  const setupArgs = ["setup", "--agent", "claude-code", "--preset", "node-service"];

  withTempDir((nodeDir) => {
    withTempDir((nodeHome) => {
      withTempDir((rustDir) => {
        withTempDir((rustHome) => {
          const nodeOutput = runCommand(
            process.execPath,
            [path.join(repoRoot, "bin", "agent-guardrails.js"), ...setupArgs, nodeDir],
            {
              cwd: nodeDir,
              env: {
                ...process.env,
                AGENT_GUARDRAILS_RUNTIME: "node",
                HOME: nodeHome,
                USERPROFILE: nodeHome
              }
            }
          );
          assert.equal(nodeOutput.status, 0, nodeOutput.stderr || nodeOutput.stdout);

          const rustOutput = runCommand(
            process.execPath,
            [path.join(repoRoot, "bin", "agent-guardrails.js"), ...setupArgs, rustDir],
            {
              cwd: rustDir,
              env: {
                ...process.env,
                AGENT_GUARDRAILS_RUNTIME: "rust",
                AGENT_GUARDRAILS_RUST_BIN: rustBinary,
                HOME: rustHome,
                USERPROFILE: rustHome
              }
            }
          );
          assert.equal(rustOutput.status, 0, rustOutput.stderr || rustOutput.stdout);

          assert.deepEqual(
            stableSetupSnapshot(rustDir, rustHome, "claude-code"),
            stableSetupSnapshot(nodeDir, nodeHome, "claude-code")
          );
        });
      });
    });
  });
}

function testNodeCliDelegatesSetupToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime setup e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    withTempDir((homeDir) => {
      const output = runCommand(
        process.execPath,
        [
          path.join(repoRoot, "bin", "agent-guardrails.js"),
          "setup",
          tempDir,
          "--agent",
          "opencode"
        ],
        {
          cwd: tempDir,
          env: {
            ...process.env,
            AGENT_GUARDRAILS_RUNTIME: "rust",
            AGENT_GUARDRAILS_RUST_BIN: rustBinary,
            HOME: homeDir,
            USERPROFILE: homeDir
          }
        }
      );

      assert.equal(output.status, 0, output.stderr || output.stdout);
      assert.match(output.stdout, /Agent Guardrails Setup/);
      assert.equal(fs.existsSync(path.join(tempDir, "opencode.json")), true);
      assert.equal(fs.existsSync(path.join(tempDir, ".opencode", "plugins", "guardrails.js")), true);
      assert.equal(fs.existsSync(path.join(tempDir, ".agent-guardrails", "config.json")), true);
    });
  });
}

function testNodeCliDelegatesDoctorToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime doctor e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    const output = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "doctor", tempDir, "--json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.notEqual(output.status, 0);
    const result = JSON.parse(output.stdout);
    assert.equal(result.ok, false);
    assert.equal(result.checks.length, 6);
    assert.deepEqual(
      result.checks.map((check) => check.key),
      ["configExists", "gitHook", "agentSetupFiles", "enforced", "cliBinary", "checkRuntime"]
    );
  });
}

function testNodeAndRustDoctorJsonMatchForFreshRepo() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime doctor parity: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    const nodeOutput = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "doctor", tempDir, "--json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "node"
        }
      }
    );
    assert.equal(nodeOutput.status, 0, nodeOutput.stderr || nodeOutput.stdout);

    const rustOutput = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "doctor", tempDir, "--json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );
    assert.notEqual(rustOutput.status, 0);

    assert.deepEqual(stableDoctorSnapshot(rustOutput), stableDoctorSnapshot(nodeOutput));
  });
}

function testNodeCliDelegatesEnforceAndUnenforceToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime enforce e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    const enforceOutput = runCommand(
      process.execPath,
      [
        path.join(repoRoot, "bin", "agent-guardrails.js"),
        "enforce",
        "--agent",
        "codex",
        "--json"
      ],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(enforceOutput.status, 0, enforceOutput.stderr || enforceOutput.stdout);
    const enforceResult = JSON.parse(enforceOutput.stdout);
    assert.equal(enforceResult.ok, true);
    assert.deepEqual(enforceResult.written, [".codex/instructions.md"]);
    assert.deepEqual(enforceResult.agents, ["codex"]);
    const instructionsPath = path.join(tempDir, ".codex", "instructions.md");
    const enforcedContent = fs.readFileSync(instructionsPath, "utf8");
    assert.match(enforcedContent, /agent-guardrails-enforce:start/);

    const unenforceOutput = runCommand(
      process.execPath,
      [
        path.join(repoRoot, "bin", "agent-guardrails.js"),
        "unenforce",
        "--agent",
        "codex",
        "--json"
      ],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(unenforceOutput.status, 0, unenforceOutput.stderr || unenforceOutput.stdout);
    const unenforceResult = JSON.parse(unenforceOutput.stdout);
    assert.equal(unenforceResult.ok, true);
    assert.equal(unenforceResult.removed[0].path, ".codex/instructions.md");
    assert.equal(unenforceResult.removed[0].action, "deleted");
    assert.equal(fs.existsSync(instructionsPath), false);
  });
}

function testNodeCliDelegatesGenerateAgentsToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime generate-agents e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    const output = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "generate-agents", tempDir],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(output.status, 0, output.stderr || output.stdout);
    assert.match(output.stdout, /AGENTS\.md generated/);
    assert.equal(fs.existsSync(path.join(tempDir, "AGENTS.md")), true);
    assert.equal(fs.existsSync(path.join(tempDir, "docs", "ARCHITECTURE.md")), true);
    assert.equal(fs.existsSync(path.join(tempDir, "docs", "TESTING.md")), true);
    assert.match(
      fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf8"),
      /agent-guardrails check/
    );
  });
}

function testNodeCliDelegatesMcpToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime mcp e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    fs.mkdirSync(path.join(tempDir, ".agent-guardrails"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".agent-guardrails", "config.json"),
      `${JSON.stringify({ preset: "generic" }, null, 2)}\n`,
      "utf8"
    );

    const initPayload = Buffer.from(
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      "utf8"
    );
    const toolsPayload = Buffer.from(
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
      "utf8"
    );
    const output = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "mcp"],
      {
        cwd: tempDir,
        input: Buffer.concat([
          Buffer.from(`Content-Length: ${initPayload.length}\r\n\r\n`, "utf8"),
          initPayload,
          Buffer.from(`Content-Length: ${toolsPayload.length}\r\n\r\n`, "utf8"),
          toolsPayload
        ]),
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(output.status, 0, output.stderr || output.stdout);
    assert.match(output.stdout, /Content-Length:/);
    assert.match(output.stdout, /agent-guardrails-mcp/);
    assert.match(output.stdout, /suggest_task_contract/);
    assert.match(output.stdout, /start_agent_native_loop/);
    assert.match(output.stdout, /check_after_edit/);
    assert.match(output.stdout, /finish_agent_native_loop/);
    assert.match(output.stdout, /run_guardrail_check/);
    assert.match(output.stdout, /summarize_review_risks/);
    assert.match(output.stdout, /plan_rough_intent/);
    assert.match(output.stdout, /explain_change/);
    assert.match(output.stdout, /query_archaeology/);
  });
}

function testNodeCliDelegatesDaemonStatusToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime daemon status e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    const output = runCommand(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "status", "--json"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(output.status, 0, output.stderr || output.stdout);
    const result = JSON.parse(output.stdout);
    assert.equal(result.ok, true);
    assert.equal(result.status.running, false);
    assert.deepEqual(result.config.watchPaths, ["src/", "lib/", "tests/"]);
  });
}

async function testNodeCliRustMcpAgentLoopEndToEndWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime mcp agent loop e2e: Rust preview binary is not built.");
    return;
  }

  await withTempDirAsync(async (tempDir) => {
    seedRustMcpLoopSmokeRepo(tempDir);
    const client = createMcpClient(
      process.execPath,
      [path.join(repoRoot, "bin", "agent-guardrails.js"), "mcp"],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    try {
      const initialized = await client.request("initialize", {});
      assert.equal(initialized.error, undefined, JSON.stringify(initialized.error));
      assert.equal(initialized.result.serverInfo.name, "agent-guardrails-mcp");
      client.notify("notifications/initialized");

      const tools = await client.request("tools/list", {});
      assert.equal(tools.error, undefined, JSON.stringify(tools.error));
      const toolNames = tools.result.tools.map((tool) => tool.name);
      assert.ok(toolNames.includes("start_agent_native_loop"));
      assert.ok(toolNames.includes("check_after_edit"));
      assert.ok(toolNames.includes("finish_agent_native_loop"));
      assert.ok(toolNames.includes("plan_rough_intent"));
      assert.ok(toolNames.includes("explain_change"));
      assert.ok(toolNames.includes("query_archaeology"));

      const start = await client.request("tools/call", {
        name: "start_agent_native_loop",
        arguments: {
          repoRoot: tempDir,
          taskRequest: "Update the service message and its matching test.",
          selectedFiles: ["src/service.js", "tests/service.test.js"],
          overrides: {
            "required-commands": ["node tests/service.test.js"]
          }
        }
      });
      assert.equal(start.error, undefined, JSON.stringify(start.error));
      const startData = start.result.structuredContent;
      assert.equal(startData.rustPreview, true);
      assert.equal(startData.contractPath, ".agent-guardrails/task-contract.json");
      assert.equal(startData.contract.task, "Update the service message and its matching test.");
      assert.equal(startData.loop.status, "bootstrapped");
      assert.equal(fs.existsSync(path.join(tempDir, ".agent-guardrails", "task-contract.json")), true);
      assert.equal(fs.existsSync(path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md")), true);

      fs.writeFileSync(
        path.join(tempDir, "src", "service.js"),
        "export function message() {\n  return \"new\";\n}\n",
        "utf8"
      );
      fs.writeFileSync(
        path.join(tempDir, "tests", "service.test.js"),
        "import assert from \"node:assert/strict\";\nimport { message } from \"../src/service.js\";\n\nassert.equal(message(), \"new\");\n",
        "utf8"
      );
      const testOutput = runCommand(process.execPath, ["tests/service.test.js"], { cwd: tempDir });
      assert.equal(testOutput.status, 0, testOutput.stderr || testOutput.stdout);

      const editCheck = await client.request("tools/call", {
        name: "check_after_edit",
        arguments: {
          repoRoot: tempDir
        }
      });
      assert.equal(editCheck.error, undefined, JSON.stringify(editCheck.error));
      assert.equal(editCheck.result.content[0].type, "text");
      assert.equal(editCheck.result.structuredContent.rustPreview, true);
      assert.ok(Array.isArray(editCheck.result.structuredContent.newFindings));

      const finish = await client.request("tools/call", {
        name: "finish_agent_native_loop",
        arguments: {
          repoRoot: tempDir,
          commandsRun: ["node tests/service.test.js"],
          evidence: {
            notableResults: ["node tests/service.test.js passed after updating the source and matching test."],
            reviewNotes: ["Changed only the contract-selected source and test files."],
            residualRisk: "none"
          }
        }
      });
      assert.equal(finish.error, undefined, JSON.stringify(finish.error));
      assert.match(finish.result.content[0].text, /Task complete/);
      const finishData = finish.result.structuredContent;
      assert.equal(finishData.rustPreview, true);
      assert.equal(finishData.checkResult.ok, true);
      assert.equal(finishData.reviewerSummary.status, "pass");
      assert.deepEqual(finishData.checkResult.missingEvidencePaths, []);
      assert.deepEqual(finishData.checkResult.missingRequiredCommands, []);
      const evidence = fs.readFileSync(
        path.join(tempDir, ".agent-guardrails", "evidence", "current-task.md"),
        "utf8"
      );
      assert.match(evidence, /Commands run: node tests\/service.test.js/);
      assert.match(evidence, /node tests\/service.test.js passed after updating the source and matching test/);
    } finally {
      await client.close();
    }
  });
}

function testNodeCliDelegatesPlanToBuiltRustRuntimeWhenForced() {
  const rustBinary = builtRustBinaryPath();
  if (!fs.existsSync(rustBinary)) {
    console.log("SKIP rust-runtime plan e2e: Rust preview binary is not built.");
    return;
  }

  withTempDir((tempDir) => {
    fs.mkdirSync(path.join(tempDir, ".agent-guardrails"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".agent-guardrails", "config.json"),
      `${JSON.stringify({
        preset: "generic",
        workflow: {
          planDefaults: {
            allowedPaths: ["src/"],
            requiredCommands: ["npm test"],
            evidencePaths: [".agent-guardrails/evidence/current-task.md"]
          }
        }
      }, null, 2)}\n`,
      "utf8"
    );

    const probe = runCommand(rustBinary, ["plan", "--task", "Probe", "--print-only"], {
      cwd: tempDir
    });
    if (probe.status !== 0 && /Unknown command: plan/.test(probe.stderr)) {
      console.log("SKIP rust-runtime plan e2e: built Rust preview binary predates plan.");
      return;
    }

    const output = runCommand(
      process.execPath,
      [
        path.join(repoRoot, "bin", "agent-guardrails.js"),
        "plan",
        "--task",
        "Preview Rust plan",
        "--risk-level",
        "standard"
      ],
      {
        cwd: tempDir,
        env: {
          ...process.env,
          AGENT_GUARDRAILS_RUNTIME: "rust",
          AGENT_GUARDRAILS_RUST_BIN: rustBinary
        }
      }
    );

    assert.equal(output.status, 0, output.stderr || output.stdout);
    assert.match(output.stdout, /Agent Guardrails Task Brief/);
    const contract = JSON.parse(
      fs.readFileSync(path.join(tempDir, ".agent-guardrails", "task-contract.json"), "utf8")
    );
    assert.equal(contract.task, "Preview Rust plan");
    assert.equal(contract.session.contractSource, "preset-defaults");
  });
}

export async function run() {
  testRuntimeFlagIsExplicit();
  testPackagedRuntimeCandidateUsesNpmNativePath();
  testDefaultRuntimeUsesNodeWhenPackagedRustIsAbsent();
  testDefaultRuntimeUsesPackagedRustWhenPresent();
  testDefaultCheckRuntimeUsesNodeWhenProIsInstalledInRepo();
  testNodeRuntimeCanBeForcedEvenWhenPackagedRustExists();
  testInvalidRuntimeSelectionFailsActionably();
  testCoreRuntimesUsePackagedRustByDefaultWhenPresent();
  testExplicitRustBinaryMustExist();
  testSourceCheckoutBinaryFallback();
  testPackagedPlatformBinaryFallback();
  testPackagedBinaryPrecedesSourceCheckoutBinary();
  testRustRuntimeCandidateOrderIsStable();
  testMissingRustRuntimeHasActionableError();
  testNodeCliReportsMissingRustBinaryBeforeNodeCheck();
  testNodeCliDelegatesCheckToBuiltRustRuntimeWhenAvailable();
  testNodeAndRustInitGeneratedFilesMatchForCoreSetup();
  testNodeCliDelegatesInitToBuiltRustRuntimeWhenForced();
  testNodeAndRustSetupGeneratedFilesMatchForClaudeCode();
  testNodeCliDelegatesSetupToBuiltRustRuntimeWhenForced();
  testNodeCliDelegatesDoctorToBuiltRustRuntimeWhenForced();
  testNodeAndRustDoctorJsonMatchForFreshRepo();
  testNodeCliDelegatesEnforceAndUnenforceToBuiltRustRuntimeWhenForced();
  testNodeCliDelegatesGenerateAgentsToBuiltRustRuntimeWhenForced();
  testNodeCliDelegatesMcpToBuiltRustRuntimeWhenForced();
  testNodeCliDelegatesDaemonStatusToBuiltRustRuntimeWhenForced();
  await testNodeCliRustMcpAgentLoopEndToEndWhenForced();
  testNodeAndRustPlanContractsMatchForExplicitScope();
  testNodeCliDelegatesPlanToBuiltRustRuntimeWhenForced();
}
