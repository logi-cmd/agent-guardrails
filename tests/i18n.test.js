import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTranslator, resolveLocale, supportedLocales } from "../lib/i18n.js";
import { runCli } from "../lib/cli.js";
import { runInit } from "../lib/commands/init.js";
import { runPlan } from "../lib/commands/plan.js";

function captureLogs(run) {
  const original = console.log;
  let output = "";
  console.log = (...args) => {
    output += `${args.join(" ")}\n`;
  };

  return Promise.resolve()
    .then(run)
    .then(() => output)
    .finally(() => {
      console.log = original;
    });
}

async function cliHelpSupportsChinese() {
  const output = await captureLogs(() => runCli(["help", "--lang", "zh-CN"]));
  assert.match(output, /用法：/);
  assert.match(output, /支持的语言：/);
}

async function initSeedsChineseTemplates() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-i18n-init-"));

  const output = await captureLogs(() =>
    runInit({
      positional: [tempDir],
      flags: { preset: "node-service", adapter: "claude-code,gemini", lang: "zh-CN" },
      locale: "zh-CN"
    })
  );

  const agents = fs.readFileSync(path.join(tempDir, "AGENTS.md"), "utf8");
  const claude = fs.readFileSync(path.join(tempDir, "CLAUDE.md"), "utf8");
  const gemini = fs.readFileSync(path.join(tempDir, "GEMINI.md"), "utf8");

  assert.match(output, /下一步：/);
  assert.match(agents, /强制：先阅读/);
  assert.match(claude, /强制：守卫检查/);
  assert.match(gemini, /强制：守卫检查/);
}

async function planRespectsLocaleEnvAndOverride() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-guardrails-i18n-plan-"));
  await runInit({
    positional: [tempDir],
    flags: { preset: "node-service" }
  });

  const originalCwd = process.cwd();
  const originalLocale = process.env.AGENT_GUARDRAILS_LOCALE;
  process.chdir(tempDir);
  process.env.AGENT_GUARDRAILS_LOCALE = "zh-CN";

  try {
    const zhOutput = await captureLogs(() =>
      runPlan({
        positional: [],
        flags: {
          task: "更新订单服务",
          "allow-paths": "src/,tests/"
        }
      })
    );
    assert.match(zhOutput, /任务简报/);
    assert.match(zhOutput, /允许路径：/);

    const enOutput = await captureLogs(() =>
      runPlan({
        positional: [],
        flags: {
          task: "Update order service",
          "allow-paths": "src/,tests/",
          lang: "en"
        },
        locale: "en"
      })
    );
    assert.match(enOutput, /Task Brief/);
    assert.match(enOutput, /Allowed path:/);
  } finally {
    process.chdir(originalCwd);
    if (originalLocale === undefined) {
      delete process.env.AGENT_GUARDRAILS_LOCALE;
    } else {
      process.env.AGENT_GUARDRAILS_LOCALE = originalLocale;
    }
  }
}

async function i18nExposesMutationMessages() {
  assert.equal(supportedLocales.includes("zh-CN"), true);
  assert.equal(resolveLocale("fr-FR"), "en");

  const { t } = createTranslator("en");
  const finding = t("findings.mutation-test-error");
  const action = t("actions.reviewMutationSurvivors");

  assert.match(finding, /mutation/i);
  assert.match(action, /mutation/i);
}

export async function run() {
  await cliHelpSupportsChinese();
  await initSeedsChineseTemplates();
  await planRespectsLocaleEnvAndOverride();
  await i18nExposesMutationMessages();
}
