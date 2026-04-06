import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "../i18n.js";
import {
  applyTemplate,
  ensureDirectory,
  loadJson,
  loadTemplate,
  parseAdapterList,
  supportedAdapters,
  supportedPresets,
  writeText
} from "../utils.js";

function hasExistingCI(targetDir) {
  const workflowsDir = path.join(targetDir, ".github", "workflows");
  if (!fs.existsSync(workflowsDir)) return false;
  const files = fs.readdirSync(workflowsDir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  return files.length > 0;
}

function injectGitHook(targetDir) {
  const hooksDir = path.join(targetDir, ".git", "hooks");
  if (!fs.existsSync(hooksDir)) {
    return { injected: false, reason: "no-git-hooks-dir" };
  }

  const hookPath = path.join(hooksDir, "pre-commit");
  const hookContent = loadTemplate("base/hooks/pre-commit.cjs");

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf8");
    if (existing.includes("agent-guardrails")) {
      return { injected: false, reason: "already-injected" };
    }
  }

  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
  return { injected: true, path: hookPath };
}

function injectSlashCommands() {
  const commandsDir = path.join(process.env.HOME || process.env.USERPROFILE, ".claude", "commands", "ag");
  ensureDirectory(commandsDir);

  const commandFiles = ["check.md", "plan.md", "review.md", "fix.md", "status.md"];
  const installed = [];

  for (const cmd of commandFiles) {
    const content = loadTemplate(`commands/${cmd}`);
    const target = path.join(commandsDir, cmd);
    writeText(target, content, { force: true });
    installed.push(cmd);
  }

  return { installed, commandsDir };
}

function classifyWrites(targetDir, adapters, presetConfig, hasCI, locale) {
  const projectName = path.basename(targetDir);
  const currentDate = new Date().toISOString().slice(0, 10);
  const replacements = {
    PROJECT_NAME: projectName,
    PRESET_NAME: presetConfig.preset || "generic",
    CURRENT_DATE: currentDate
  };

  const writes = [];

  writes.push({
    type: "append",
    filePath: path.join(targetDir, "AGENTS.md"),
    template: applyTemplate(loadTemplate("base/AGENTS.md", { locale }), replacements),
    marker: "agent-guardrails"
  });

  writes.push({
    type: "create",
    filePath: path.join(targetDir, "docs", "PROJECT_STATE.md"),
    template: applyTemplate(loadTemplate("base/PROJECT_STATE.md", { locale }), replacements)
  });

  writes.push({
    type: "create",
    filePath: path.join(targetDir, "docs", "PR_CHECKLIST.md"),
    template: loadTemplate("base/PR_CHECKLIST.md", { locale })
  });

  writes.push({
    type: "force",
    filePath: path.join(targetDir, ".agent-guardrails", "tasks", "TASK_TEMPLATE.md"),
    template: loadTemplate("base/TASK_TEMPLATE.md", { locale })
  });

  writes.push({
    type: "force",
    filePath: path.join(targetDir, ".agent-guardrails", "prompts", "IMPLEMENT_PROMPT.md"),
    template: loadTemplate("base/IMPLEMENT_PROMPT.md", { locale })
  });

  writes.push({
    type: "force",
    filePath: path.join(targetDir, ".agent-guardrails", "config.json"),
    template: JSON.stringify(presetConfig, null, 2) + "\n"
  });

  if (!hasCI) {
    writes.push({
      type: "create",
      filePath: path.join(targetDir, ".github", "workflows", "agent-guardrails.yml"),
      template: loadTemplate("base/workflows/agent-guardrails.yml")
    });
  }

  const adapterWrites = {
    "claude-code": { path: "CLAUDE.md", template: "adapters/claude-code/CLAUDE.md" },
    "cursor": { path: ".cursor/rules/agent-guardrails.mdc", template: "adapters/cursor/agent-guardrails.mdc" },
    "gemini": { path: "GEMINI.md", template: "adapters/gemini/GEMINI.md" },
    "codex": { path: ".codex/instructions.md", template: "adapters/codex/instructions.md" }
  };

  for (const adapter of adapters) {
    const config = adapterWrites[adapter];
    if (config) {
      writes.push({
        type: "create",
        filePath: path.join(targetDir, config.path),
        template: loadTemplate(config.template, { locale })
      });
    }
  }

  return writes;
}

export async function runInit({ positional, flags, locale = null, silent = false }) {
  const targetDir = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const preset = String(flags.preset || "generic");
  const force = Boolean(flags.force);
  const adapters = parseAdapterList(flags.adapter);
  const projectName = path.basename(targetDir);
  const { locale: resolvedLocale, t } = createTranslator(flags.lang || locale);

  if (!supportedPresets.includes(preset)) {
    throw new Error(
      t("errors.unknownPreset", {
        preset,
        supportedPresets: supportedPresets.join(", ")
      })
    );
  }

  const unsupportedAdapters = adapters.filter((adapter) => !supportedAdapters.includes(adapter));
  if (unsupportedAdapters.length > 0) {
    throw new Error(
      t("errors.unknownAdapters", {
        adapters: unsupportedAdapters.join(", "),
        supportedAdapters: supportedAdapters.join(", ")
      })
    );
  }

  const presetConfig = loadJson(`presets/${preset}/config.json`);
  const existingCI = hasExistingCI(targetDir);
  const writes = classifyWrites(targetDir, adapters, presetConfig, existingCI, resolvedLocale);
  const hookResult = injectGitHook(targetDir);
  const slashResult = injectSlashCommands();

  const created = [];
  const skipped = [];
  const appended = [];

  for (const entry of writes) {
    let didWrite;
    if (entry.type === "force" || force) {
      didWrite = writeText(entry.filePath, entry.template, { force: true });
    } else if (entry.type === "append") {
      didWrite = writeText(entry.filePath, entry.template, { append: true, appendMarker: entry.marker });
    } else {
      didWrite = writeText(entry.filePath, entry.template, { force: false });
    }

    if (didWrite) {
      if (entry.type === "append") {
        appended.push(entry.filePath);
      } else {
        created.push(entry.filePath);
      }
    } else {
      skipped.push(entry.filePath);
    }
  }

  if (!silent) {
    console.log(t("init.initialized", { projectName, preset }));

    if (adapters.length > 0) {
      console.log(t("init.adapters", { adapters: adapters.join(", ") }));
    }

    if (created.length > 0) {
      console.log(`\n${t("init.created")}`);
      console.log(created.map((filePath) => `- ${path.relative(targetDir, filePath)}`).join("\n"));
    }

    if (appended.length > 0) {
      console.log(`\n${t("init.appended")}`);
      console.log(appended.map((filePath) => `- ${path.relative(targetDir, filePath)}`).join("\n"));
    }

    if (skipped.length > 0) {
      console.log(`\n${t("init.skipped")}`);
      console.log(skipped.map((filePath) => `- ${path.relative(targetDir, filePath)}`).join("\n"));
    }

    if (existingCI) {
      console.log(`\n${t("init.ciDetected")}`);
    }

    if (hookResult.injected) {
      console.log(`\n${t("init.hookInjected")}`);
    } else {
      console.log(`\n${t("init.hookSkipped")}`);
    }

    if (slashResult.installed.length > 0) {
      console.log(`\n${t("init.slashInstalled")}`);
      console.log(slashResult.installed.map((cmd) => `- /ag:${cmd.replace(".md", "")}`).join("\n"));
    }

    console.log(`\n${t("init.nextSteps")}`);
    console.log(t("init.nextPlan"));
    console.log(t("init.nextChange"));
    console.log(t("init.nextEvidence"));
    console.log(t("init.nextCheck"));
  }

  return {
    targetDir,
    preset,
    adapters,
    created,
    appended,
    skipped,
    existingCI,
    hookInjected: hookResult.injected,
    locale: resolvedLocale
  };
}
