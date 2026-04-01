#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const configPath = path.join(repoRoot, ".agent-guardrails", "config.json");

if (!existsSync(configPath)) {
  process.exit(0);
}

try {
  execFileSync("npx", ["agent-guardrails", "check", "--base-ref", "HEAD~1"], {
    cwd: repoRoot,
    stdio: "inherit"
  });
  process.exit(0);
} catch (err) {
  process.stderr.write("\n🛡️  Guardrail check failed.\n");
  process.stderr.write("Fix the issues or skip with: git commit --no-verify\n\n");
  process.exit(1);
}
