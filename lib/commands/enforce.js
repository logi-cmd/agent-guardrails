import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "../i18n.js";
import { ensureDirectory, loadTemplate } from "../utils.js";

/**
 * Each agent's auto-read instruction file location.
 * These files are automatically loaded by the agent as system-level instructions.
 */
const AGENT_INSTRUCTION_FILES = {
  "claude-code": {
    path: "CLAUDE.md",
    template: "enforce/claude-code.md"
  },
  "cursor": {
    path: ".cursor/rules/agent-guardrails-enforce.mdc",
    template: "enforce/cursor.mdc"
  },
  "opencode": {
    path: ".opencode/rules/agent-guardrails-enforce.md",
    template: "enforce/opencode.md"
  },
  "codex": {
    path: ".codex/instructions.md",
    template: "enforce/codex.md"
  },
  "gemini": {
    path: "GEMINI.md",
    template: "enforce/gemini.md"
  },
  "windsurf": {
    path: ".windsurf/rules/agent-guardrails-enforce.md",
    template: "enforce/windsurf.md"
  },
  "openhands": {
    path: ".agents/skills/agent-guardrails-enforce.md",
    template: "enforce/openhands.md"
  },
  "openclaw": {
    path: "OPENCLAW.md",
    template: "enforce/openclaw.md"
  }
};

/**
 * All files that enforce writes, for clean removal during unenforce.
 */
const ALL_ENFORCE_FILES = Object.values(AGENT_INSTRUCTION_FILES).map((f) => f.path);

/**
 * Marker used to identify agent-guardrails enforced content.
 * Every enforced file starts with this marker so unenforce can detect it.
 */
const ENFORCE_MARKER = "<!-- agent-guardrails-enforce:start -->";

/**
 * Check if a file was created by agent-guardrails enforce.
 */
function isEnforcedFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const content = fs.readFileSync(filePath, "utf8");
  return content.includes(ENFORCE_MARKER);
}

/**
 * Get the repo root from a starting directory.
 */
function findRepoRoot(startDir) {
  let current = startDir;
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return startDir;
}

/**
 * Enforce guardrail instructions for one or all agents.
 */
export async function runEnforce({ positional, flags, locale = null }) {
  const repoRoot = findRepoRoot(process.cwd());
  const { t } = createTranslator(flags.lang || locale);

  const agentId = flags.agent ? String(flags.agent).toLowerCase() : null;
  const allAgents = flags.all || !agentId;

  const targets = [];

  if (allAgents) {
    for (const [id, config] of Object.entries(AGENT_INSTRUCTION_FILES)) {
      targets.push({ id, ...config });
    }
  } else {
    const config = AGENT_INSTRUCTION_FILES[agentId];
    if (!config) {
      throw new Error(
        t("enforce.errors.unknownAgent", {
          agent: agentId,
          supported: Object.keys(AGENT_INSTRUCTION_FILES).join(", ")
        })
      );
    }
    targets.push({ id: agentId, ...config });
  }

  const written = [];
  const skipped = [];

  for (const target of targets) {
    const fullPath = path.join(repoRoot, target.path);
    ensureDirectory(path.dirname(fullPath));

    if (isEnforcedFile(fullPath)) {
      skipped.push(target.path);
      continue;
    }

    const fileExisted = fs.existsSync(fullPath);
    // Always use English templates for injected content — AI agents understand English instructions best
    const templateContent = loadTemplate(target.template, { locale: null });
    const markerStart = `<!-- agent-guardrails-enforce:start -->`;
    const markerEnd = `<!-- agent-guardrails-enforce:end -->`;

    if (fileExisted) {
      const existing = fs.readFileSync(fullPath, "utf8");
      fs.writeFileSync(fullPath, `${existing}\n\n${markerStart}\n${templateContent}\n${markerEnd}\n`, "utf8");
      written.push(target.path);
    } else {
      fs.writeFileSync(fullPath, `${markerStart}\n${templateContent}\n${markerEnd}\n`, "utf8");
      written.push(target.path);
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({
      ok: true,
      repoRoot,
      written,
      skipped,
      agents: targets.map((t) => t.id)
    }, null, 2));
    return;
  }

  console.log(t("enforce.title"));
  console.log("");
  console.log(t("enforce.repoRoot", { value: repoRoot }));

  if (written.length > 0) {
    console.log("");
    console.log(t("enforce.written"));
    for (const p of written) {
      console.log(`  - ${p}`);
    }
  }

  if (skipped.length > 0) {
    console.log("");
    console.log(t("enforce.skipped"));
    for (const p of skipped) {
      console.log(`  - ${p}`);
    }
  }

  console.log("");
  console.log(t("enforce.nextStep"));
  console.log(t("enforce.unenforceHint"));
}

/**
 * Remove all agent-guardrails enforced files.
 */
export async function runUnenforce({ positional, flags, locale = null }) {
  const repoRoot = findRepoRoot(process.cwd());
  const { t } = createTranslator(flags.lang || locale);

  const agentId = flags.agent ? String(flags.agent).toLowerCase() : null;
  const allAgents = flags.all || !agentId;

  const targets = [];

  if (allAgents) {
    for (const [id, config] of Object.entries(AGENT_INSTRUCTION_FILES)) {
      targets.push({ id, ...config });
    }
  } else {
    const config = AGENT_INSTRUCTION_FILES[agentId];
    if (!config) {
      throw new Error(
        t("enforce.errors.unknownAgent", {
          agent: agentId,
          supported: Object.keys(AGENT_INSTRUCTION_FILES).join(", ")
        })
      );
    }
    targets.push({ id: agentId, ...config });
  }

  const removed = [];
  const skipped = [];

  for (const target of targets) {
    const fullPath = path.join(repoRoot, target.path);

    if (!fs.existsSync(fullPath)) {
      skipped.push({ path: target.path, reason: "not-found" });
      continue;
    }

    if (!isEnforcedFile(fullPath)) {
      skipped.push({ path: target.path, reason: "not-enforced" });
      continue;
    }

    // For files that may have user content before the enforce marker,
    // we strip only the enforced section instead of deleting the whole file
    const content = fs.readFileSync(fullPath, "utf8");
    const startMarker = `<!-- agent-guardrails-enforce:start -->`;
    const endMarker = `<!-- agent-guardrails-enforce:end -->`;
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.lastIndexOf(endMarker);

    if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
      const before = content.slice(0, startIndex).trimEnd();
      const after = content.slice(endIndex + endMarker.length).trimStart();
      const remaining = [before, after].filter(Boolean).join("\n\n");

      if (remaining.trim()) {
        fs.writeFileSync(fullPath, remaining + "\n", "utf8");
        removed.push({ path: target.path, action: "stripped" });
      } else {
        fs.unlinkSync(fullPath);
        removed.push({ path: target.path, action: "deleted" });
      }
    } else {
      // No markers found but was flagged as enforced — just delete
      fs.unlinkSync(fullPath);
      removed.push({ path: target.path, action: "deleted" });
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({
      ok: true,
      repoRoot,
      removed,
      skipped
    }, null, 2));
    return;
  }

  console.log(t("unenforce.title"));
  console.log("");
  console.log(t("unenforce.repoRoot", { value: repoRoot }));

  if (removed.length > 0) {
    console.log("");
    console.log(t("unenforce.removed"));
    for (const item of removed) {
      console.log(`  - ${item.path} (${item.action})`);
    }
  }

  if (skipped.length > 0) {
    console.log("");
    console.log(t("unenforce.skipped"));
    for (const item of skipped) {
      console.log(`  - ${item.path} (${item.reason})`);
    }
  }
}
