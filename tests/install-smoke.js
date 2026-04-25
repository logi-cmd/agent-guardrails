import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "..");
const npmCliPath = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");

function run(command, args, cwd, env = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        ...env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    throw new Error(
      [
        `Command failed: ${command} ${args.join(" ")}`,
        `cwd: ${cwd}`,
        stdout ? `stdout:\n${stdout}` : "",
        stderr ? `stderr:\n${stderr}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

function runNpm(args, cwd, env = {}) {
  return run(process.execPath, [npmCliPath, ...args], cwd, env);
}

function git(cwd, args) {
  run("git", args, cwd);
}

function assertFileExists(filePath) {
  assert.equal(fs.existsSync(filePath), true, `Expected file to exist: ${filePath}`);
}

function doctorCheck(result, key) {
  const found = result.checks.find((check) => check.key === key);
  assert.ok(found, `Expected doctor check ${key}`);
  return found;
}

export async function runInstallSmoke() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-install-smoke-"));
  const cacheDir = path.join(tempRoot, ".npm-cache");
  const packDir = path.join(tempRoot, "pack");
  const appDir = path.join(tempRoot, "app");
  const repoDir = path.join(tempRoot, "first-install-repo");
  const homeDir = path.join(tempRoot, "home");
  const npmEnv = {
    npm_config_cache: cacheDir,
    HOME: homeDir,
    USERPROFILE: homeDir
  };

  try {
    fs.mkdirSync(packDir, { recursive: true });
    fs.mkdirSync(appDir, { recursive: true });
    fs.mkdirSync(repoDir, { recursive: true });
    fs.mkdirSync(homeDir, { recursive: true });

    runNpm(["pack", "--pack-destination", packDir], repoRoot, npmEnv);

    const tarball = fs.readdirSync(packDir).find((fileName) => fileName.endsWith(".tgz"));
    assert.ok(tarball, "Expected npm pack to produce a tarball.");

    runNpm(["init", "-y"], appDir, npmEnv);
    runNpm(["install", path.join(packDir, tarball)], appDir, npmEnv);

    const binaryPath = path.join(appDir, "node_modules", "agent-guardrails", "bin", "agent-guardrails.js");
    const helpOutput = run(process.execPath, [binaryPath, "help"], appDir, npmEnv);
    assert.match(helpOutput, /agent-guardrails/);
    assert.match(helpOutput, /setup/);
    assert.match(helpOutput, /doctor/);

    git(repoDir, ["init"]);
    git(repoDir, ["config", "user.email", "first-install@example.com"]);
    git(repoDir, ["config", "user.name", "Agent Guardrails First Install Smoke"]);
    git(repoDir, ["config", "core.autocrlf", "false"]);

    fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(repoDir, "tests"), { recursive: true });
    fs.writeFileSync(
      path.join(repoDir, "package.json"),
      `${JSON.stringify({
        type: "module",
        scripts: {
          test: "node tests/service.test.js"
        }
      }, null, 2)}\n`,
      "utf8"
    );
    fs.writeFileSync(path.join(repoDir, "src", "service.js"), "export const value = 1;\n", "utf8");
    fs.writeFileSync(
      path.join(repoDir, "tests", "service.test.js"),
      "import assert from 'node:assert/strict';\nimport { value } from '../src/service.js';\nassert.equal(value, 1);\n",
      "utf8"
    );

    const setupOutput = run(
      process.execPath,
      [binaryPath, "setup", repoDir, "--agent", "claude-code", "--preset", "node-service"],
      appDir,
      npmEnv
    );
    assert.match(setupOutput, /Agent Guardrails Setup/);
    assert.match(setupOutput, /Do this now:/);
    assert.match(setupOutput, /First chat message:/);
    assert.match(setupOutput, /Canonical MCP chat flow:/);

    assertFileExists(path.join(repoDir, ".agent-guardrails", "config.json"));
    assertFileExists(path.join(repoDir, ".agent-guardrails", "hooks", "claude-code-pre-tool.cjs"));
    assertFileExists(path.join(repoDir, ".agent-guardrails", "hooks", "claude-code-post-tool.cjs"));
    assertFileExists(path.join(repoDir, ".claude", "settings.json"));
    assertFileExists(path.join(repoDir, ".mcp.json"));
    assertFileExists(path.join(repoDir, "AGENTS.md"));
    assertFileExists(path.join(repoDir, "CLAUDE.md"));
    assertFileExists(path.join(repoDir, ".git", "hooks", "pre-commit"));

    const agentsContent = fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8");
    assert.match(agentsContent, /\.agent-guardrails\/evidence\/current-task\.md/);
    assert.match(agentsContent, /agent-guardrails check --base-ref HEAD~1/);
    assert.match(agentsContent, /Definition Of Done|完成定义/);

    const doctorBeforeEnforce = JSON.parse(run(process.execPath, [binaryPath, "doctor", repoDir, "--json"], appDir, npmEnv));
    assert.equal(doctorCheck(doctorBeforeEnforce, "configExists").passed, true);
    assert.equal(doctorCheck(doctorBeforeEnforce, "gitHook").passed, true);
    assert.equal(doctorCheck(doctorBeforeEnforce, "agentSetupFiles").passed, true);
    assert.equal(doctorCheck(doctorBeforeEnforce, "enforced").passed, false);

    const enforceOutput = run(process.execPath, [binaryPath, "enforce", "--agent", "claude-code"], repoDir, npmEnv);
    assert.match(enforceOutput, /Enforced instructions written to:|已注入指令到：/);
    assert.match(enforceOutput, /CLAUDE\.md/);

    const doctorAfterEnforce = JSON.parse(run(process.execPath, [binaryPath, "doctor", repoDir, "--json"], appDir, npmEnv));
    assert.equal(doctorAfterEnforce.ok, true);
    assert.equal(doctorCheck(doctorAfterEnforce, "enforced").passed, true);

    git(repoDir, ["add", "."]);
    git(repoDir, ["commit", "-m", "initial app with guardrails"]);

    const planOutput = run(
      process.execPath,
      [
        binaryPath,
        "plan",
        "--task",
        "Increase the service value with matching test coverage",
        "--intended-files",
        "src/service.js,tests/service.test.js",
        "--required-commands",
        "npm test"
      ],
      repoDir,
      npmEnv
    );
    assert.match(planOutput, /Task Brief|任务简报/);
    assertFileExists(path.join(repoDir, ".agent-guardrails", "task-contract.json"));

    fs.writeFileSync(path.join(repoDir, "src", "service.js"), "export const value = 2;\n", "utf8");
    fs.writeFileSync(
      path.join(repoDir, "tests", "service.test.js"),
      "import assert from 'node:assert/strict';\nimport { value } from '../src/service.js';\nassert.equal(value, 2);\n",
      "utf8"
    );
    runNpm(["test"], repoDir, npmEnv);

    const evidencePath = path.join(repoDir, ".agent-guardrails", "evidence", "current-task.md");
    fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
    fs.writeFileSync(
      evidencePath,
      "# Task Evidence\n\n- Commands run: npm test\n- Result: service test passed after value update.\n- Residual risk: low; no auth, secrets, dependency, or public API change.\n",
      "utf8"
    );

    const checkResult = JSON.parse(
      run(process.execPath, [binaryPath, "check", "--json", "--commands-run", "npm test"], repoDir, npmEnv)
    );
    assert.equal(checkResult.ok, true);
    assert.equal(checkResult.counts.sourceFiles, 1);
    assert.equal(checkResult.counts.testFiles, 1);
    assert.equal(checkResult.counts.missingRequiredCommands, 0);
    assert.equal(checkResult.counts.missingEvidencePaths, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runInstallSmoke().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
