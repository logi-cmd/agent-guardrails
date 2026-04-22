import { runCheck } from "./commands/check.js";
import { runDoctor } from "./commands/doctor.js";
import { runEnforce, runUnenforce } from "./commands/enforce.js";
import { runInit } from "./commands/init.js";
import { runMcp } from "./commands/mcp.js";
import { runServe } from "./commands/serve.js";
import { runSetup } from "./commands/setup.js";
import { runProActivate, runProCleanup, runProReport, runProStatus, runProWorkbench } from "./commands/pro-status.js";
import { createTranslator, supportedLocales } from "./i18n.js";
import { runPlan } from "./commands/plan.js";
import { runGenerateAgentsMd } from "./commands/agents-md.js";
import { startDaemon, stopDaemon, showDaemonStatus } from "./commands/daemon.js";
import { supportedAdapters, supportedPresets, readOwnPackageJson, resolveRepoRoot } from "./utils.js";

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
  agent-guardrails setup [targetDir] --agent <name> [--preset <name>] [--lang <locale>] [--json] [--write-repo-config]
  agent-guardrails plan --task "<task description>" [--intended-files "src/service.js,tests/service.test.js"] [--allowed-change-types "implementation-only"] [--allow-paths "src/,tests/"] [--required-commands "npm test"] [--evidence ".agent-guardrails/evidence/current-task.md"] [--risk-level high] [--lang <locale>] [--print-only]
  agent-guardrails doctor [targetDir] [--json] [--lang <locale>]
  agent-guardrails check [--contract-path <path>] [--base-ref <ref>] [--commands-run "npm test"] [--review] [--lang <locale>] [--json]
  agent-guardrails enforce [--agent <name>] [--all] [--lang <locale>] [--json]
  agent-guardrails unenforce [--agent <name>] [--all] [--lang <locale>] [--json]
  agent-guardrails start [--foreground] - ${t("cli.startSummary")}
  agent-guardrails stop    - ${t("cli.stopSummary")}
  agent-guardrails status  - ${t("cli.statusSummary")}
  agent-guardrails pro status [--json]
  agent-guardrails pro activate <license-key> [--instance-name <name>] [--json]
  agent-guardrails pro report [--json]
  agent-guardrails pro workbench [--open] [--json]
  agent-guardrails pro cleanup [--apply] [--json]
  agent-guardrails generate-agents [targetDir] [--preset <name>] [--lang <locale>]
  agent-guardrails serve [--port <port>] [--host <host>] [--lang <locale>]
  agent-guardrails mcp
  agent-guardrails --version

${t("cli.globalOptions")}
  --version, -v    ${t("cli.versionSummary") ?? "Show version number"}
  --help, -h       ${t("cli.helpSummary") ?? "Show this help"}
  --lang <locale>  ${t("cli.langSummary") ?? "Language for output (en, zh-CN)"}

${t("cli.commands")}
  init            ${t("cli.initSummary")}
  setup           ${t("cli.setupSummary")}
  plan            ${t("cli.planSummary")}
  check           ${t("cli.checkSummary")}
  doctor          ${t("cli.doctorSummary")}
  enforce          ${t("cli.enforceSummary")}
  unenforce        ${t("cli.unenforceSummary")}
  start           ${t("cli.startSummary")}
  stop            ${t("cli.stopSummary")}
  status          ${t("cli.statusSummary")}
  pro status      Show optional Pro package install and license status
  pro activate    Activate an installed Pro package and save a local activation cache
  pro report      Print the optional Pro go-live report when Pro is installed
  pro workbench   Write and optionally open the local Pro operator workbench
  pro cleanup     Preview or apply Pro proof memory cleanup when Pro is installed
  generate-agents ${t("cli.generateAgentsSummary") ?? "Generate AGENTS.md for agent setup"}
  serve           ${t("cli.serveSummary") ?? "Start chat API server for desktop apps and chat tools"}
  mcp             ${t("cli.mcpSummary")}

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

  if (flags.version || flags.v) {
    const pkg = readOwnPackageJson();
    console.log(`agent-guardrails v${pkg.version}`);
    return;
  }

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

  if (command === "setup") {
    await runSetup({ positional: rest, flags, locale });
    return;
  }

  if (command === "check") {
    await runCheck({ positional: rest, flags, locale });
    return;
  }

  if (command === "doctor") {
    await runDoctor({ positional: rest, flags, locale });
    return;
  }

  if (command === "enforce") {
    await runEnforce({ positional: rest, flags, locale });
    return;
  }

  if (command === "unenforce") {
    await runUnenforce({ positional: rest, flags, locale });
    return;
  }

  if (command === "mcp") {
    await runMcp({ positional: rest, flags, locale });
    return;
  }

  if (command === "serve") {
    await runServe({ positional: rest, flags, locale });
    return;
  }

  if (command === "start") {
    await startDaemon(resolveRepoRoot(process.cwd()), { locale, foreground: flags.foreground || false });
    return;
  }

  if (command === "stop") {
    stopDaemon(resolveRepoRoot(process.cwd()), { locale });
    return;
  }

  if (command === "status") {
    showDaemonStatus(resolveRepoRoot(process.cwd()), { locale });
    return;
  }

  if (command === "pro-status" || (command === "pro" && rest[0] === "status")) {
    return runProStatus({ flags, locale });
  }

  if (command === "pro-activate" || (command === "pro" && rest[0] === "activate")) {
    return runProActivate({ positional: command === "pro" ? rest.slice(1) : rest, flags, locale });
  }

  if (command === "pro-report" || (command === "pro" && rest[0] === "report")) {
    return runProReport({ flags, locale });
  }

  if (command === "pro-workbench" || (command === "pro" && rest[0] === "workbench")) {
    return runProWorkbench({ flags, locale });
  }

  if (command === "pro-cleanup" || (command === "pro" && rest[0] === "cleanup")) {
    return runProCleanup({ flags, locale });
  }

  if (command === "generate-agents" || command === "gen-agents") {
    await runGenerateAgentsMd({ positional: rest, flags, locale });
    return;
  }

  const { t } = createTranslator(locale);
  throw new Error(t("cli.unknownCommand", { command }));
}
