import { runCheck } from "./commands/check.js";
import { runDoctor } from "./commands/doctor.js";
import { runEnforce, runUnenforce } from "./commands/enforce.js";
import { runInit } from "./commands/init.js";
import { runMcp } from "./commands/mcp.js";
import { runServe } from "./commands/serve.js";
import { runSetup } from "./commands/setup.js";
import { runProActivate, runProCleanup, runProReport, runProStatus, runProWorkbench } from "./commands/pro-status.js";
import { runWorkbenchPanel } from "./commands/workbench-panel.js";
import { createTranslator, supportedLocales } from "./i18n.js";
import { runPlan } from "./commands/plan.js";
import { runGenerateAgentsMd } from "./commands/agents-md.js";
import { startDaemon, stopDaemon, showDaemonStatus } from "./commands/daemon.js";
import { supportedAdapters, supportedPresets, readOwnPackageJson, resolveRepoRoot } from "./utils.js";
import {
  runRustCheckRuntime,
  runRustRuntime,
  selectCheckRuntime,
  selectDoctorRuntime,
  selectEnforceRuntime,
  selectGenerateAgentsRuntime,
  selectInitRuntime,
  selectMcpRuntime,
  selectPlanRuntime,
  selectServeRuntime,
  selectSetupRuntime,
  selectStartRuntime,
  selectStatusRuntime,
  selectStopRuntime,
  selectUnenforceRuntime,
  selectWorkbenchPanelRuntime
} from "./rust-runtime.js";

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
  agent-guardrails pro activate <license-key> [--instance-name <name>] [--instance-id <id>] [--json]
  agent-guardrails pro report [--json]
  agent-guardrails pro workbench [--open] [--live] [--native-panel] [--json]
  agent-guardrails pro cleanup [--apply] [--json]
  agent-guardrails workbench-panel [--file <operator-workbench-panel.json>] [--json]
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
  pro workbench   Write, open, or run the local Pro operator workbench in live mode
  pro cleanup     Preview or apply Pro proof memory cleanup when Pro is installed
  workbench-panel Render a local Pro Workbench panel model
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
    const initRuntime = selectInitRuntime();
    if (initRuntime.kind === "rust") {
      await runRustRuntime("init", argv.slice(1), { binary: initRuntime.binary });
      return;
    }
    await runInit({ positional: rest, flags, locale });
    return;
  }

  if (command === "plan") {
    const planRuntime = selectPlanRuntime();
    if (planRuntime.kind === "rust") {
      await runRustRuntime("plan", argv.slice(1), { binary: planRuntime.binary });
      return;
    }
    await runPlan({ positional: rest, flags, locale });
    return;
  }

  if (command === "setup") {
    const setupRuntime = selectSetupRuntime();
    if (setupRuntime.kind === "rust") {
      await runRustRuntime("setup", argv.slice(1), { binary: setupRuntime.binary });
      return;
    }
    await runSetup({ positional: rest, flags, locale });
    return;
  }

  if (command === "check") {
    const checkRuntime = selectCheckRuntime({ repoRoot: resolveRepoRoot(process.cwd()) });
    if (checkRuntime.kind === "rust") {
      await runRustCheckRuntime(argv.slice(1), { binary: checkRuntime.binary });
      return;
    }
    await runCheck({ positional: rest, flags, locale });
    return;
  }

  if (command === "doctor") {
    const doctorRuntime = selectDoctorRuntime();
    if (doctorRuntime.kind === "rust") {
      await runRustRuntime("doctor", argv.slice(1), { binary: doctorRuntime.binary });
      return;
    }
    await runDoctor({ positional: rest, flags, locale });
    return;
  }

  if (command === "enforce") {
    const enforceRuntime = selectEnforceRuntime();
    if (enforceRuntime.kind === "rust") {
      await runRustRuntime("enforce", argv.slice(1), { binary: enforceRuntime.binary });
      return;
    }
    await runEnforce({ positional: rest, flags, locale });
    return;
  }

  if (command === "unenforce") {
    const unenforceRuntime = selectUnenforceRuntime();
    if (unenforceRuntime.kind === "rust") {
      await runRustRuntime("unenforce", argv.slice(1), { binary: unenforceRuntime.binary });
      return;
    }
    await runUnenforce({ positional: rest, flags, locale });
    return;
  }

  if (command === "mcp") {
    const mcpRuntime = selectMcpRuntime();
    if (mcpRuntime.kind === "rust") {
      await runRustRuntime("mcp", argv.slice(1), { binary: mcpRuntime.binary });
      return;
    }
    await runMcp({ positional: rest, flags, locale });
    return;
  }

  if (command === "serve") {
    const serveRuntime = selectServeRuntime();
    if (serveRuntime.kind === "rust") {
      await runRustRuntime("serve", argv.slice(1), { binary: serveRuntime.binary });
      return;
    }
    await runServe({ positional: rest, flags, locale });
    return;
  }

  if (command === "start") {
    const startRuntime = selectStartRuntime();
    if (startRuntime.kind === "rust") {
      await runRustRuntime("start", argv.slice(1), { binary: startRuntime.binary, stdio: "pipe" });
      return;
    }
    await startDaemon(resolveRepoRoot(process.cwd()), { locale, foreground: flags.foreground || false });
    return;
  }

  if (command === "stop") {
    const stopRuntime = selectStopRuntime();
    if (stopRuntime.kind === "rust") {
      await runRustRuntime("stop", argv.slice(1), { binary: stopRuntime.binary, stdio: "pipe" });
      return;
    }
    stopDaemon(resolveRepoRoot(process.cwd()), { locale });
    return;
  }

  if (command === "status") {
    const statusRuntime = selectStatusRuntime();
    if (statusRuntime.kind === "rust") {
      await runRustRuntime("status", argv.slice(1), { binary: statusRuntime.binary, stdio: "pipe" });
      return;
    }
    showDaemonStatus(resolveRepoRoot(process.cwd()), { locale });
    return;
  }

  if (command === "workbench-panel") {
    const workbenchPanelRuntime = selectWorkbenchPanelRuntime();
    if (workbenchPanelRuntime.kind === "rust") {
      try {
        await runRustRuntime("workbench-panel", argv.slice(1), {
          binary: workbenchPanelRuntime.binary,
          stdio: "pipe",
          rejectOnNonZero: true
        });
        return;
      } catch (error) {
        if (workbenchPanelRuntime.reason === "forced-rust" || flags.native) {
          throw error;
        }
      }
    }
    await runWorkbenchPanel({ positional: rest, flags });
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
    const generateAgentsRuntime = selectGenerateAgentsRuntime();
    if (generateAgentsRuntime.kind === "rust") {
      await runRustRuntime(command, argv.slice(1), { binary: generateAgentsRuntime.binary });
      return;
    }
    await runGenerateAgentsMd({ positional: rest, flags, locale });
    return;
  }

  const { t } = createTranslator(locale);
  throw new Error(t("cli.unknownCommand", { command }));
}
