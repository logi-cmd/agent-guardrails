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
  return run(process.execPath, [npmCliPath, ...args], cwd, env);
}

function assertFileExists(filePath) {
  assert.equal(fs.existsSync(filePath), true, `Expected file to exist: ${filePath}`);
}

export async function runInstallSmoke() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-install-smoke-"));
  const cacheDir = path.join(tempRoot, ".npm-cache");
  const packDir = path.join(tempRoot, "pack");
  const appDir = path.join(tempRoot, "app");
  const repoDir = path.join(tempRoot, "generated-repo");
  const npmEnv = {
    npm_config_cache: cacheDir
  };

  fs.mkdirSync(packDir, { recursive: true });
  fs.mkdirSync(appDir, { recursive: true });

  runNpm(["pack", "--pack-destination", packDir], repoRoot, npmEnv);

  const tarball = fs.readdirSync(packDir).find((fileName) => fileName.endsWith(".tgz"));
  assert.ok(tarball, "Expected npm pack to produce a tarball.");

  runNpm(["init", "-y"], appDir, npmEnv);
  runNpm(["install", path.join(packDir, tarball)], appDir, npmEnv);

  const binaryPath = path.join(appDir, "node_modules", "agent-guardrails", "bin", "agent-guardrails.js");
  const helpOutput = run(process.execPath, [binaryPath, "help"], appDir, npmEnv);
  assert.match(helpOutput, /agent-guardrails/);

  run(
    process.execPath,
    [binaryPath, "init", repoDir, "--preset", "node-service", "--adapter", "codex,claude-code,cursor,openhands,openclaw"],
    appDir,
    npmEnv
  );

  assertFileExists(path.join(repoDir, "AGENTS.md"));
  assertFileExists(path.join(repoDir, "CLAUDE.md"));
  assertFileExists(path.join(repoDir, "OPENCLAW.md"));
  assertFileExists(path.join(repoDir, ".cursor", "rules", "agent-guardrails.mdc"));
  assertFileExists(path.join(repoDir, ".agents", "skills", "agent-guardrails.md"));

  const agentsContent = fs.readFileSync(path.join(repoDir, "AGENTS.md"), "utf8");
  assert.match(agentsContent, /\.agent-guardrails\/evidence\/current-task\.md/);
  assert.match(agentsContent, /--commands-run "npm test"/);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runInstallSmoke().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exit(1);
  });
}
