import { runCheck } from "./commands/check.js";
import { runInit } from "./commands/init.js";
import { createTranslator, supportedLocales } from "./i18n.js";
import { runPlan } from "./commands/plan.js";
import { supportedAdapters, supportedPresets } from "./utils.js";

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { positional, flags };
}

function printHelp(locale = null) {
  const { t } = createTranslator(locale);
  console.log(`agent-guardrails

${t("cli.usage")}
  agent-guardrails init [targetDir] [--preset <name>] [--adapter <name[,name]>] [--lang <locale>] [--force]
  agent-guardrails plan --task "<task description>" [--allow-paths "src/,tests/"] [--intended-files "src/service.js,tests/service.test.js"] [--allowed-change-types "implementation-only"] [--risk-level high] [--required-commands "npm test"] [--evidence ".agent-guardrails/evidence/current-task.md"] [--lang <locale>] [--print-only]
  agent-guardrails check [--contract-path <path>] [--base-ref <ref>] [--commands-run "npm test"] [--review] [--lang <locale>] [--json]

${t("cli.commands")}
  init   ${t("cli.initSummary")}
  plan   ${t("cli.planSummary")}
  check  ${t("cli.checkSummary")}

${t("cli.supportedPresets")}
  ${supportedPresets.join(", ")}

${t("cli.supportedAdapters")}
  ${supportedAdapters.join(", ")}

${t("cli.supportedLocales")}
  ${supportedLocales.join(", ")}
`);
}

export async function runCli(argv) {
  const { positional, flags } = parseArgs(argv);
  const [command, ...rest] = positional;
  const locale = flags.lang ?? null;

  if (!command || command === "help" || flags.help) {
    printHelp(locale);
    return;
  }

  if (command === "init") {
    await runInit({ positional: rest, flags, locale });
    return;
  }

  if (command === "plan") {
    await runPlan({ positional: rest, flags, locale });
    return;
  }

  if (command === "check") {
    await runCheck({ positional: rest, flags, locale });
    return;
  }

  const { t } = createTranslator(locale);
  throw new Error(t("cli.unknownCommand", { command }));
}
