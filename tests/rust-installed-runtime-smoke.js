import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");

function existingFile(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
}

function npmCommand() {
  const npmCliPath = existingFile([
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"),
    path.resolve(path.dirname(process.execPath), "..", "share", "nodejs", "npm", "bin", "npm-cli.js")
  ]);

  if (npmCliPath) {
    return { command: process.execPath, prefixArgs: [npmCliPath] };
  }

  return { command: process.platform === "win32" ? "npm.cmd" : "npm", prefixArgs: [] };
}

function run(command, args, cwd, env = {}) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function runNpm(args, cwd, env = {}) {
  const npm = npmCommand();
  return run(npm.command, [...npm.prefixArgs, ...args], cwd, env);
}

function git(cwd, args) {
  run("git", args, cwd);
}

function rustBinaryName(platform = process.platform) {
  return platform === "win32" ? "agent-guardrails-rs.exe" : "agent-guardrails-rs";
}

function currentNativeBinaryPath(root = repoRoot) {
  return path.join(root, "native", `${process.platform}-${process.arch}`, rustBinaryName());
}

function ensureNativeRuntimeForPack() {
  const nativeBinaryPath = currentNativeBinaryPath();
  if (fs.existsSync(nativeBinaryPath)) {
    return { nativeBinaryPath, created: false };
  }

  runNpm(["run", "build:rust-native", "--", "--profile", "debug"], repoRoot);
  assert.equal(fs.existsSync(nativeBinaryPath), true, `Expected native runtime to exist: ${nativeBinaryPath}`);
  return { nativeBinaryPath, created: true };
}

function cleanupCreatedNativeRuntime(created) {
  if (!created) {
    return;
  }
  const nativePlatformDir = path.dirname(currentNativeBinaryPath());
  const nativeRoot = path.dirname(nativePlatformDir);
  fs.rmSync(nativePlatformDir, { recursive: true, force: true });
  if (fs.existsSync(nativeRoot) && fs.readdirSync(nativeRoot).length === 0) {
    fs.rmSync(nativeRoot, { recursive: true, force: true });
  }
}

function writeSmokeRepo(repoDir) {
  git(repoDir, ["init"]);
  git(repoDir, ["config", "user.email", "test@example.com"]);
  git(repoDir, ["config", "user.name", "Agent Guardrails Rust Installed Smoke"]);
  git(repoDir, ["config", "core.autocrlf", "false"]);

  fs.mkdirSync(path.join(repoDir, ".agent-guardrails"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "docs"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(repoDir, "tests"), { recursive: true });

  fs.writeFileSync(path.join(repoDir, "AGENTS.md"), "# Agent instructions\n", "utf8");
  fs.writeFileSync(path.join(repoDir, "docs", "PROJECT_STATE.md"), "# Project state\n", "utf8");
  fs.writeFileSync(path.join(repoDir, "docs", "PR_CHECKLIST.md"), "# PR checklist\n", "utf8");
  fs.writeFileSync(
    path.join(repoDir, ".agent-guardrails", "config.json"),
    `${JSON.stringify({
      preset: "generic",
      checks: {
        sourceRoots: ["src"],
        sourceExtensions: [".js"],
        testRoots: ["tests"],
        testExtensions: [".js"],
        correctness: {
          requireTestsWithSourceChanges: true,
          requireCommandsReported: false,
          requireEvidenceFiles: false
        }
      }
    }, null, 2)}\n`,
    "utf8"
  );
  fs.writeFileSync(path.join(repoDir, "src", "service.js"), "export const value = 1;\n", "utf8");
  fs.writeFileSync(path.join(repoDir, "tests", "service.test.js"), "export const covered = true;\n", "utf8");

  git(repoDir, ["add", "."]);
  git(repoDir, ["commit", "-m", "initial"]);

  fs.writeFileSync(path.join(repoDir, "src", "service.js"), "export const value = 2;\n", "utf8");
  fs.writeFileSync(path.join(repoDir, "tests", "service.test.js"), "export const covered = 'updated';\n", "utf8");
}

function assertSafeRustCheck(cliPath, repoDir, env) {
  const output = run(process.execPath, [cliPath, "check", "--json"], repoDir, env);
  const result = JSON.parse(output);
  assert.equal(result.ok, true);
  assert.equal(result.scoreVerdict, "safe-to-deploy");
  assert.equal(result.counts.sourceFiles, 1);
  assert.equal(result.counts.testFiles, 1);
}

function parseJsonCommand(command, args, cwd, env) {
  return JSON.parse(run(command, args, cwd, env));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function httpRequest(port, request) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port }, () => {
      socket.write(request);
      socket.end();
    });
    let response = "";
    socket.setTimeout(5000, () => {
      socket.destroy();
      reject(new Error("HTTP request timed out"));
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
    });
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

function responseBody(response) {
  return response.split("\r\n\r\n")[1] || "";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForChildClose(child, timeoutMs = 5000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);
    child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill();
  await waitForChildClose(child, 5000);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await waitForChildClose(child, 5000);
  }
}

async function removeTempRoot(tempRoot) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  console.warn(`Warning: failed to remove smoke temp directory ${tempRoot}: ${lastError?.message ?? lastError}`);
}

async function waitForHttp(port, request) {
  const deadline = Date.now() + 5000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await httpRequest(port, request);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError || new Error("server did not become ready");
}

async function assertInstalledDaemonUsesRustDefault(cliPath, repoDir, env) {
  const start = spawn(process.execPath, [cliPath, "start", "--json"], {
    cwd: repoDir,
    env,
    stdio: "ignore",
    windowsHide: true
  });
  const code = await new Promise((resolve) => start.on("exit", (exitCode) => resolve(exitCode)));
  try {
    assert.equal(code, 0, "installed Rust start should exit successfully");
    const status = parseJsonCommand(process.execPath, [cliPath, "status", "--json"], repoDir, env);
    assert.equal(status.ok, true);
    assert.equal(status.status.running, true);
    assert.equal(fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8").includes("agent-guardrails:daemon:start"), true);
    const stop = parseJsonCommand(process.execPath, [cliPath, "stop", "--json"], repoDir, env);
    assert.equal(stop.ok, true);
    const finalStatus = parseJsonCommand(process.execPath, [cliPath, "status", "--json"], repoDir, env);
    assert.equal(finalStatus.status.running, false);
  } finally {
    try {
      run(process.execPath, [cliPath, "stop", "--json"], repoDir, env);
    } catch {
      // Best-effort cleanup for failed smoke assertions.
    }
  }
}

async function assertInstalledServeUsesRustDefault(cliPath, repoDir, env) {
  const port = await freePort();
  const child = spawn(process.execPath, [cliPath, "serve", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: repoDir,
    env,
    stdio: "ignore",
    windowsHide: true
  });
  try {
    const healthResponse = await waitForHttp(port, "GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n");
    const health = JSON.parse(responseBody(healthResponse));
    assert.equal(health.status, "ok");
    assert.equal(health.rustPreview, true);

    const body = JSON.stringify({ message: "plan update service value", locale: "en" });
    const chatResponse = await waitForHttp(
      port,
      `POST /api/chat HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
    );
    const chat = JSON.parse(responseBody(chatResponse));
    assert.equal(chat.tool, "plan_rough_intent");
    assert.equal(chat.rustPreview, true);
  } finally {
    await stopChild(child);
  }
}

function withAutoRuntime(env) {
  return {
    ...env,
    AGENT_GUARDRAILS_RUNTIME: "auto"
  };
}

function encodeFrame(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8"), body]);
}

function createMcpClient(cliPath, repoDir, env) {
  const child = spawn(process.execPath, [cliPath, "mcp"], {
    cwd: repoDir,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });

  let nextId = 1;
  let buffer = Buffer.alloc(0);
  let stderr = "";
  const pending = new Map();

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const header = buffer.slice(0, headerEnd).toString("utf8");
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      assert.ok(lengthMatch, `Missing Content-Length header: ${header}`);
      const length = Number(lengthMatch[1]);
      const frameEnd = headerEnd + 4 + length;
      if (buffer.length < frameEnd) {
        return;
      }

      const body = buffer.slice(headerEnd + 4, frameEnd).toString("utf8");
      buffer = buffer.slice(frameEnd);
      const message = JSON.parse(body);
      const waiter = pending.get(message.id);
      if (!waiter) {
        continue;
      }
      pending.delete(message.id);
      if (message.error) {
        waiter.reject(new Error(`${message.error.message}\n${JSON.stringify(message.error.data ?? {})}`));
      } else {
        waiter.resolve(message.result);
      }
    }
  });

  child.on("exit", (code, signal) => {
    for (const waiter of pending.values()) {
      waiter.reject(new Error(`MCP process exited early with code ${code ?? "null"} signal ${signal ?? "null"}.\n${stderr}`));
    }
    pending.clear();
  });

  return {
    request(method, params = {}) {
      const id = nextId;
      nextId += 1;
      const payload = { jsonrpc: "2.0", id, method, params };
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      child.stdin.write(encodeFrame(payload));
      return promise;
    },
    async close() {
      child.stdin.end();
      await stopChild(child);
    }
  };
}

async function assertInstalledMcpLoop(cliPath, repoDir, env, { expectedRuntime }) {
  const client = createMcpClient(cliPath, repoDir, env);
  try {
    const initialize = await client.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "agent-guardrails-installed-smoke", version: "1.0.0" }
    });
    assert.equal(initialize.serverInfo.name, "agent-guardrails-mcp");

    const tools = await client.request("tools/list");
    const toolNames = new Set(tools.tools.map((tool) => tool.name));
    assert.equal(toolNames.has("start_agent_native_loop"), true);
    assert.equal(toolNames.has("finish_agent_native_loop"), true);
    assert.equal(toolNames.has("explain_change"), true);

    const start = await client.request("tools/call", {
      name: "start_agent_native_loop",
      arguments: {
        repoRoot: repoDir,
        taskRequest: "Update service value with matching test coverage",
        selectedFiles: ["src/service.js", "tests/service.test.js"],
        overrides: {
          allowedPaths: ["src/", "tests/"],
          intendedFiles: ["src/service.js", "tests/service.test.js"]
        }
      }
    });
    assert.equal(start.structuredContent.contract.allowedPaths.includes("src/"), true);

    const finish = await client.request("tools/call", {
      name: "finish_agent_native_loop",
      arguments: {
        repoRoot: repoDir,
        commandsRun: [],
        evidence: {
          notableResults: [`Installed ${expectedRuntime} MCP smoke completed with source and test changes.`],
          reviewNotes: ["Stayed inside the declared source and test files."],
          residualRisk: "none"
        }
      }
    });
    assert.equal(
      finish.structuredContent.checkResult.ok,
      true,
      `${expectedRuntime} MCP finish should pass:\n${JSON.stringify(finish.structuredContent.checkResult, null, 2)}`
    );
    assert.equal(
      finish.structuredContent.reviewerSummary.status,
      "pass",
      `${expectedRuntime} MCP reviewer summary should pass:\n${JSON.stringify(finish.structuredContent.reviewerSummary, null, 2)}`
    );
    if (expectedRuntime === "rust") {
      assert.equal(finish.structuredContent.checkResult.rustPreview, true);
    } else {
      assert.equal(finish.structuredContent.checkResult.rustPreview, undefined);
    }
  } finally {
    await client.close();
  }
}

export async function runRustInstalledRuntimeSmoke() {
  const nativeRuntime = ensureNativeRuntimeForPack();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-rust-installed-smoke-"));
  const cacheDir = path.join(tempRoot, ".npm-cache");
  const packDir = path.join(tempRoot, "pack");
  const appDir = path.join(tempRoot, "app");
  const repoDir = path.join(tempRoot, "repo");
  const npmEnv = {
    npm_config_cache: cacheDir
  };

  try {
    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });

    runNpm(["pack", "--pack-destination", packDir], repoRoot, npmEnv);
    const tarball = fs.readdirSync(packDir).find((fileName) => fileName.endsWith(".tgz"));
    assert.ok(tarball, "Expected npm pack to produce a tarball.");

    runNpm(["init", "-y"], appDir, npmEnv);
    runNpm(["install", path.join(packDir, tarball)], appDir, npmEnv);

    const installedPackageRoot = path.join(appDir, "node_modules", "agent-guardrails");
    const installedNativeBinary = currentNativeBinaryPath(installedPackageRoot);
    assert.equal(fs.existsSync(installedNativeBinary), true, `Expected installed native runtime: ${installedNativeBinary}`);

    writeSmokeRepo(repoDir);

    const cliPath = path.join(installedPackageRoot, "bin", "agent-guardrails.js");
    assertSafeRustCheck(cliPath, repoDir, {
      ...npmEnv,
      AGENT_GUARDRAILS_RUNTIME: "rust"
    });
    assertSafeRustCheck(cliPath, repoDir, withAutoRuntime(npmEnv));
    await assertInstalledDaemonUsesRustDefault(cliPath, repoDir, withAutoRuntime({
      ...process.env,
      ...npmEnv
    }));
    await assertInstalledServeUsesRustDefault(cliPath, repoDir, withAutoRuntime({
      ...process.env,
      ...npmEnv
    }));
    await assertInstalledMcpLoop(cliPath, repoDir, withAutoRuntime({
      ...process.env,
      ...npmEnv
    }), { expectedRuntime: "rust" });
    await assertInstalledMcpLoop(cliPath, repoDir, {
      ...process.env,
      ...npmEnv,
      AGENT_GUARDRAILS_RUNTIME: "node"
    }, { expectedRuntime: "node" });
    await assertInstalledMcpLoop(cliPath, repoDir, {
      ...process.env,
      ...npmEnv,
      AGENT_GUARDRAILS_RUNTIME: "rust"
    }, { expectedRuntime: "rust" });
  } finally {
    await removeTempRoot(tempRoot);
    cleanupCreatedNativeRuntime(nativeRuntime.created);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runRustInstalledRuntimeSmoke().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
