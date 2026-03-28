import path from "node:path";
import { createTranslator } from "../i18n.js";
import {
  applyTemplate,
  loadJson,
  loadTemplate,
  parseAdapterList,
  supportedAdapters,
  supportedPresets,
  writeText
} from "../utils.js";

export async function runInit({ positional, flags, locale = null, silent = false }) {
  const targetDir = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const preset = String(flags.preset || "node-service");
  const force = Boolean(flags.force);
  const adapters = parseAdapterList(flags.adapter);
  const projectName = path.basename(targetDir);
  const currentDate = new Date().toISOString().slice(0, 10);
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
  const replacements = {
    PROJECT_NAME: projectName,
    PRESET_NAME: preset,
    CURRENT_DATE: currentDate
  };

  const writes = [
    {
      filePath: path.join(targetDir, "AGENTS.md"),
      template: applyTemplate(loadTemplate("base/AGENTS.md", { locale: resolvedLocale }), replacements)
    },
    {
      filePath: path.join(targetDir, "docs", "PROJECT_STATE.md"),
      template: applyTemplate(loadTemplate("base/PROJECT_STATE.md", { locale: resolvedLocale }), replacements)
    },
    {
      filePath: path.join(targetDir, "docs", "PR_CHECKLIST.md"),
      template: loadTemplate("base/PR_CHECKLIST.md", { locale: resolvedLocale })
    },
    {
      filePath: path.join(targetDir, ".agent-guardrails", "tasks", "TASK_TEMPLATE.md"),
      template: loadTemplate("base/TASK_TEMPLATE.md", { locale: resolvedLocale })
    },
    {
      filePath: path.join(targetDir, ".agent-guardrails", "prompts", "IMPLEMENT_PROMPT.md"),
      template: loadTemplate("base/IMPLEMENT_PROMPT.md", { locale: resolvedLocale })
    },
    {
      filePath: path.join(targetDir, ".agent-guardrails", "config.json"),
      template: JSON.stringify(presetConfig, null, 2) + "\n"
    },
    {
      filePath: path.join(targetDir, ".github", "workflows", "agent-guardrails.yml"),
      template: loadTemplate("base/workflows/agent-guardrails.yml")
    }
  ];

  if (adapters.includes("openclaw")) {
    writes.push({
      filePath: path.join(targetDir, "OPENCLAW.md"),
      template: loadTemplate("adapters/openclaw/OPENCLAW.md", { locale: resolvedLocale })
    });
  }

  if (adapters.includes("claude-code")) {
    writes.push({
      filePath: path.join(targetDir, "CLAUDE.md"),
      template: loadTemplate("adapters/claude-code/CLAUDE.md", { locale: resolvedLocale })
    });
  }

  if (adapters.includes("cursor")) {
    writes.push({
      filePath: path.join(targetDir, ".cursor", "rules", "agent-guardrails.mdc"),
      template: loadTemplate("adapters/cursor/agent-guardrails.mdc", { locale: resolvedLocale })
    });
  }

  if (adapters.includes("openhands")) {
    writes.push({
      filePath: path.join(targetDir, ".agents", "skills", "agent-guardrails.md"),
      template: loadTemplate("adapters/openhands/agent-guardrails.md", { locale: resolvedLocale })
    });
  }

  // New adapters blocks: Windsurf, OpenCode, Gemini, Codex
  if (adapters.includes("windsurf")) {
    writes.push({
      filePath: path.join(targetDir, ".windsurf", "rules", "agent-guardrails.md"),
      template: loadTemplate("adapters/windsurf/agent-guardrails.md", { locale: resolvedLocale })
    });
  }

  if (adapters.includes("opencode")) {
    writes.push({
      filePath: path.join(targetDir, ".opencode", "rules", "agent-guardrails.md"),
      template: loadTemplate("adapters/opencode/agent-guardrails.md", { locale: resolvedLocale })
    });
  }

  if (adapters.includes("gemini")) {
    writes.push({
      filePath: path.join(targetDir, "GEMINI.md"),
      template: loadTemplate("adapters/gemini/GEMINI.md", { locale: resolvedLocale })
    });
  }

  if (adapters.includes("codex")) {
    writes.push({
      filePath: path.join(targetDir, ".codex", "instructions.md"),
      template: loadTemplate("adapters/codex/instructions.md", { locale: resolvedLocale })
    });
  }

  const created = [];
  const skipped = [];

  for (const entry of writes) {
    const didWrite = writeText(entry.filePath, entry.template, { force });
    if (didWrite) {
      created.push(entry.filePath);
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

    if (skipped.length > 0) {
      console.log(`\n${t("init.skipped")}`);
      console.log(skipped.map((filePath) => `- ${path.relative(targetDir, filePath)}`).join("\n"));
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
    skipped,
    locale: resolvedLocale
  };
}
