/**
 * Lightweight static verification — runs before unit tests in CI.
 *
 * Checks that all critical repo files and directories exist and that
 * package.json is structurally valid.  This catches broken publishes,
 * accidental deletes, and template drift early without needing any
 * dependency or runtime beyond Node itself.
 *
 * Exit code 0 = pass, 1 = failure (printed to stdout).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");

let failures = 0;

function assertExists(relativePath, kind = "file") {
  const absolute = path.join(root, relativePath);
  const exists = kind === "dir"
    ? fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()
    : fs.existsSync(absolute) && fs.statSync(absolute).isFile();

  if (!exists) {
    console.error(`MISSING ${kind}: ${relativePath}`);
    failures++;
  }
}

const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

if (!pkg.name || pkg.name !== "agent-guardrails") {
  console.error(`package.json name must be "agent-guardrails", got: ${pkg.name}`);
  failures++;
}

if (!pkg.version || !/^\d+\.\d+\.\d+$/.test(pkg.version)) {
  console.error(`package.json version must be semver, got: ${pkg.version}`);
  failures++;
}

if (!pkg.bin || !pkg.bin["agent-guardrails"]) {
  console.error("package.json must declare bin.agent-guardrails");
  failures++;
}

if (pkg.files && Array.isArray(pkg.files)) {
  for (const entry of pkg.files) {
    const absolute = path.join(root, entry);
    if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
      assertExists(entry, "dir");
    }
  }
}

// --- Critical entry points ---

assertExists("bin/agent-guardrails.js");
assertExists("lib/cli.js");
assertExists("lib/utils.js");
assertExists("lib/i18n.js");

assertExists("templates/base", "dir");
assertExists("templates/base/workflows/agent-guardrails.yml");
assertExists("templates/base/AGENTS.md");
assertExists("templates/hooks", "dir");
assertExists("templates/presets", "dir");
assertExists("templates/locales", "dir");

const requiredAdapters = ["claude-code", "cursor", "opencode", "codex", "gemini"];
for (const adapter of requiredAdapters) {
  assertExists(`adapters/${adapter}`, "dir");
  assertExists(`adapters/${adapter}/README.md`);
}

const requiredDocs = [
  "CHANGELOG.md",
  "CONTRIBUTING.md",
  "docs/ROADMAP.md",
  "docs/WORKFLOWS.md",
  "docs/PROOF.md",
  "docs/BENCHMARKS.md",
  "docs/SEMANTIC_ARCHITECTURE.md",
  "docs/TROUBLESHOOTING.md",
  "docs/PROJECT_STATE.md"
];
for (const doc of requiredDocs) {
  assertExists(doc);
}

// --- Workflow files ---

assertExists(".github/workflows/guardrails.yml");

if (failures > 0) {
  console.error(`\n${failures} static verification check(s) FAILED.`);
  process.exit(1);
}

console.log("Static verification passed.");
