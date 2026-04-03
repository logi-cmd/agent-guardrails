import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "../i18n.js";
import { getSetupAgentDefinition } from "../setup/agents.js";
import { projectRoot, readConfig, supportedAdapters } from "../utils.js";

/**
 * Marker used by enforce to tag injected files.
 */
const ENFORCE_MARKER = "<!-- agent-guardrails-enforce:start -->";

/**
 * Agent instruction files written by enforce (mirrors enforce.js).
 */
const AGENT_INSTRUCTION_FILES = {
  "claude-code": "CLAUDE.md",
  "cursor": ".cursor/rules/agent-guardrails-enforce.mdc",
  "opencode": "AGENTS.md",
  "codex": ".codex/instructions.md",
  "gemini": "GEMINI.md"
};

function checkConfig(repoRoot) {
  const config = readConfig(repoRoot);
  if (!config) {
    return { key: "configExists", passed: false, detail: "Missing .agent-guardrails/config.json. Run `agent-guardrails setup --agent <name>` first." };
  }
  return { key: "configExists", passed: true, detail: ".agent-guardrails/config.json present." };
}

function checkGitHook(repoRoot) {
  const hookPath = path.join(repoRoot, ".git", "hooks", "pre-commit");
  if (!fs.existsSync(hookPath)) {
    return { key: "gitHook", passed: false, detail: "No git pre-commit hook found. Run `agent-guardrails setup --agent <name>` to inject one." };
  }
  const content = fs.readFileSync(hookPath, "utf8");
  if (!content.includes("agent-guardrails")) {
    return { key: "gitHook", passed: false, detail: "Git pre-commit hook exists but does not reference agent-guardrails. Re-run setup to inject." };
  }
  return { key: "gitHook", passed: true, detail: "Git pre-commit hook installed." };
}

function checkAgentSetupFiles(repoRoot) {
  const agentsPresent = [];
  const agentsMissing = [];

  for (const agentId of supportedAdapters) {
    const definition = getSetupAgentDefinition(agentId);
    if (!definition || !definition.repoLocalHelperFiles) continue;

    const allPresent = definition.repoLocalHelperFiles.every((relativePath) =>
      fs.existsSync(path.join(repoRoot, relativePath.replaceAll("/", path.sep)))
    );

    if (allPresent) {
      agentsPresent.push(agentId);
    } else {
      agentsMissing.push(agentId);
    }
  }

  if (agentsPresent.length === 0) {
    return {
      key: "agentSetupFiles",
      passed: false,
      detail: `No agent helper files found. Run \`agent-guardrails setup --agent <name>\` for at least one agent.`
    };
  }

  const suffix = agentsMissing.length > 0 ? ` (${agentsMissing.join(", ")} not set up)` : "";
  return {
    key: "agentSetupFiles",
    passed: true,
    detail: `Agent helper files present for: ${agentsPresent.join(", ")}${suffix}.`
  };
}

function checkEnforcement(repoRoot) {
  const enforced = [];
  const notEnforced = [];

  for (const [agentId, relativePath] of Object.entries(AGENT_INSTRUCTION_FILES)) {
    const fullPath = path.join(repoRoot, relativePath);
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.includes(ENFORCE_MARKER)) {
        enforced.push(agentId);
      } else {
        notEnforced.push(agentId);
      }
    } else {
      notEnforced.push(agentId);
    }
  }

  if (enforced.length === 0) {
    return {
      key: "enforced",
      passed: false,
      detail: "No agents have enforced instructions. Run `agent-guardrails enforce --all` for strongest protection."
    };
  }

  return {
    key: "enforced",
    passed: true,
    detail: `Enforced agents: ${enforced.join(", ")}.`
  };
}

function checkCliBinary() {
  const binaryPath = path.join(projectRoot, "bin", "agent-guardrails.js");
  const exists = fs.existsSync(binaryPath);
  return {
    key: "cliBinary",
    passed: exists,
    detail: exists ? "CLI binary available." : "CLI binary not found at expected location."
  };
}

export function runDoctorChecks(repoRoot) {
  return [
    checkConfig(repoRoot),
    checkGitHook(repoRoot),
    checkAgentSetupFiles(repoRoot),
    checkEnforcement(repoRoot),
    checkCliBinary()
  ];
}

function formatResults(results, t) {
  const allPassed = results.every((r) => r.passed);

  console.log(t("doctor.title"));
  console.log("");
  console.log(t("doctor.summary", {
    passed: results.filter((r) => r.passed).length,
    total: results.length,
    status: allPassed ? t("doctor.allPassed") : t("doctor.issuesFound")
  }));
  console.log("");

  for (const result of results) {
    const icon = result.passed ? "✅" : "❌";
    const label = t(`doctor.checks.${result.key}`);
    console.log(`  ${icon} ${label}`);
    console.log(`     ${result.detail}`);
  }

  if (!allPassed) {
    console.log("");
    console.log(t("doctor.fixHint"));
  }

  return allPassed;
}

export async function runDoctor({ positional, flags, locale = null }) {
  const repoRoot = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const { t } = createTranslator(flags.lang || locale);

  const results = runDoctorChecks(repoRoot);
  const allPassed = results.every((r) => r.passed);

  if (flags.json) {
    console.log(JSON.stringify({
      ok: allPassed,
      repoRoot,
      checks: results.map((r) => ({
        key: r.key,
        passed: r.passed,
        detail: r.detail
      }))
    }, null, 2));
    return { ok: allPassed, results };
  }

  formatResults(results, t);
  return { ok: allPassed, results };
}
