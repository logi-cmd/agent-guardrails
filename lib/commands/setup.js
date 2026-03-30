import fs from "node:fs";
import path from "node:path";
import { runInit } from "./init.js";
import { createTranslator } from "../i18n.js";
import { getSetupAgentDefinition } from "../setup/agents.js";
import { ensureDirectory, projectRoot, readConfig, supportedAdapters } from "../utils.js";

function formatList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildChecks({
  agent,
  repoInitialized,
  snippet,
  repoLocalFilesReady
}) {
  return {
    supportedAgent: Boolean(agent),
    packageBinaryAvailable: fs.existsSync(path.join(projectRoot, "bin", "agent-guardrails.js")),
    mcpCommandAvailable: fs.existsSync(path.join(projectRoot, "lib", "commands", "mcp.js")),
    repoInitialized,
    snippetGenerated: Boolean(snippet),
    targetLocationAvailable: Boolean(agent?.targetLocationDescription),
    repoLocalFilesReady
  };
}

function toRelativeList(repoRoot, filePaths) {
  return filePaths.map((filePath) => path.relative(repoRoot, filePath).replaceAll("\\", "/"));
}

function maybeWriteRepoConfig({ repoRoot, agent }) {
  if (!agent.safeRepoConfigPath) {
    return {
      attempted: false,
      supported: false,
      wrote: false,
      configPath: null
    };
  }

  const absoluteConfigPath = path.join(repoRoot, agent.safeRepoConfigPath.replaceAll("/", path.sep));
  ensureDirectory(path.dirname(absoluteConfigPath));

  const snippetParsed = JSON.parse(agent.snippet);
  let finalContent;

  if (fs.existsSync(absoluteConfigPath)) {
    const existingContent = fs.readFileSync(absoluteConfigPath, "utf8");
    try {
      const existingParsed = JSON.parse(existingContent);
      Object.assign(existingParsed, snippetParsed);
      finalContent = JSON.stringify(existingParsed, null, 2);
    } catch {
      finalContent = agent.snippet;
    }
  } else {
    finalContent = agent.snippet;
  }

  fs.writeFileSync(absoluteConfigPath, `${finalContent}\n`, "utf8");

  return {
    attempted: true,
    supported: true,
    wrote: true,
    configPath: agent.safeRepoConfigPath
  };
}

function buildSetupResult({
  repoRoot,
  preset,
  agent,
  initResult,
  autoInitialized,
  repoConfigExisted,
  repoConfigWrite
}) {
  const pilotRecordPath = agent.pilotRecordPath;
  const pilotSummaryPath = path.posix.join("docs", "pilots", "SUMMARY.md");
  const repoLocalFiles = toRelativeList(
    repoRoot,
    [...initResult.created, ...initResult.skipped].filter((filePath) =>
      agent.repoLocalHelperFiles.some((relativePath) =>
        filePath === path.join(repoRoot, relativePath.replaceAll("/", path.sep))
      )
    )
  );

  const repoLocalFilesReady = agent.repoLocalHelperFiles.every((relativePath) =>
    fs.existsSync(path.join(repoRoot, relativePath.replaceAll("/", path.sep)))
  );

  const checks = buildChecks({
    agent,
    repoInitialized: Boolean(readConfig(repoRoot)),
    snippet: agent.snippet,
    repoLocalFilesReady
  });

  return {
    ok: Object.values(checks).every(Boolean),
    repoRoot,
    agent: {
      id: agent.id,
      displayName: agent.displayName
    },
    initialization: {
      alreadyInitialized: repoConfigExisted,
      autoInitialized,
      preset,
      repoLocalFilesWritten: toRelativeList(repoRoot, initResult.created),
      repoLocalFilesReady,
      adapterHelperFiles: repoLocalFiles
    },
    mcp: {
      snippet: agent.snippet,
      targetKind: agent.targetKind,
      targetLocation: agent.targetLocation,
      targetLocationDescription: agent.targetLocationDescription,
      repoConfigWrite
    },
    completedSteps: [
      autoInitialized
        ? `Initialized repo guardrails with preset "${preset}".`
        : `Confirmed existing repo guardrails for preset "${preset}".`,
      agent.repoLocalHelperFiles.length > 0
        ? `Prepared repo-local helper files: ${agent.repoLocalHelperFiles.join(", ")}.`
        : `No agent-specific repo-local helper file was needed.`,
      repoConfigWrite.wrote
        ? `Wrote repo-local agent config: ${repoConfigWrite.configPath}.`
        : "Prepared the agent config snippet and the first chat message.",
    ],
    firstChatPrompt: agent.firstChatPrompt,
    canonicalFlow: agent.canonicalFlow,
    pilot: {
      entryTier: agent.pilotEntryTier,
      recordPath: pilotRecordPath,
      summaryPath: pilotSummaryPath
    },
    youWillGet: [
      "A repo-aware task contract shaped from your request.",
      "A bounded implementation loop that stays inside the declared scope.",
      "A reviewer summary with changed files, validation status, and remaining risk."
    ],
    checks,
    remainingManualStep: repoConfigWrite.wrote
      ? agent.safeRepoConfigPath
        ? `Open ${agent.displayName}, point it at ${agent.safeRepoConfigPath}, and send the first chat message.`
        : `Open ${agent.displayName} and send the first chat message.`
      : `Open ${agent.displayName}, paste the MCP snippet into ${agent.targetLocation}, and send the first chat message.`,
    nextStep: repoConfigWrite.wrote
      ? agent.safeRepoConfigPath
        ? `Open ${agent.displayName}, point it at ${agent.safeRepoConfigPath}, and send the first chat message.`
        : `Open ${agent.displayName} and send the first chat message.`
      : `Open ${agent.displayName}, paste the MCP snippet into ${agent.targetLocation}, and send the first chat message.`
  };
}

function printTextSummary(result, t) {
  console.log(t("setup.title"));
  console.log("");
  console.log(t("setup.agent", { value: result.agent.displayName }));
  console.log(t("setup.repoRoot", { value: result.repoRoot }));
  console.log(
    t(
      result.initialization.autoInitialized
        ? "setup.initializationAuto"
        : "setup.initializationReady",
      { preset: result.initialization.preset }
    )
  );

  console.log("");
  console.log(t("setup.completed"));
  console.log(formatList(result.completedSteps));

  if (result.initialization.repoLocalFilesWritten.length > 0) {
    console.log("");
    console.log(t("setup.repoLocalFilesWritten"));
    console.log(formatList(result.initialization.repoLocalFilesWritten));
  }

  if (result.initialization.adapterHelperFiles.length > 0) {
    console.log("");
    console.log(t("setup.repoLocalFilesReady"));
    console.log(formatList(result.initialization.adapterHelperFiles));
  }

  console.log("");
  console.log(t("setup.doThisNow"));
  console.log(`- ${result.remainingManualStep}`);
  console.log(`- ${t("setup.targetLocation", { value: result.mcp.targetLocationDescription })}`);

  if (result.mcp.repoConfigWrite.wrote) {
    console.log(`- ${t("setup.repoConfigWritten", { value: result.mcp.repoConfigWrite.configPath })}`);
  } else if (result.mcp.repoConfigWrite.attempted && !result.mcp.repoConfigWrite.supported) {
    console.log(`- ${t("setup.repoConfigNotSafe")}`);
  }

  console.log("");
  console.log(t("setup.connectYourAgent"));
  console.log(t("setup.snippet"));
  console.log("```json");
  console.log(result.mcp.snippet);
  console.log("```");
  console.log("");
  console.log(t("setup.sayThis"));
  console.log(t("setup.firstChatPrompt"));
  console.log("```text");
  console.log(result.firstChatPrompt);
  console.log("```");
  console.log("");
  console.log(t("setup.youWillGet"));
  console.log(formatList(result.youWillGet));
  console.log("");
  console.log(t("setup.canonicalFlow"));
  console.log(formatList(result.canonicalFlow));
  console.log("");
  console.log(t("setup.pilotRecord", { value: result.pilot.recordPath }));
  console.log(t("setup.pilotSummary", { value: result.pilot.summaryPath }));
  console.log("");
  console.log(t("setup.selfCheck"));

  for (const [key, value] of Object.entries(result.checks)) {
    const label = t(`setup.checks.${key}`);
    console.log(`- ${label}: ${value ? t("setup.checkPassed") : t("setup.checkFailed")}`);
  }

  console.log("");
  console.log(t("setup.nextStep"));
  console.log(`- ${result.nextStep}`);
}

export async function runSetup({ positional, flags, locale = null }) {
  const repoRoot = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const existingConfig = readConfig(repoRoot);
  const preset = String(flags.preset || existingConfig?.preset || "node-service");
  const agentId = String(flags.agent || "").trim().toLowerCase();
  const { t } = createTranslator(flags.lang || locale);

  if (!agentId) {
    throw new Error(t("errors.missingSetupAgent"));
  }

  const agent = getSetupAgentDefinition(agentId);
  if (!agent) {
    throw new Error(
      t("errors.unknownAdapters", {
        adapters: agentId,
        supportedAdapters: supportedAdapters.join(", ")
      })
    );
  }

  const repoConfigExisted = Boolean(existingConfig);
  const repoConfigWrite = maybeWriteRepoConfig({
    repoRoot,
    agent
  });
  const initResult = await runInit({
    positional: [repoRoot],
    flags: {
      preset,
      adapter: agent.adapterId ?? undefined,
      lang: flags.lang
    },
    locale,
    silent: true
  });

  const result = buildSetupResult({
    repoRoot,
    preset,
    agent,
    initResult,
    autoInitialized: !repoConfigExisted,
    repoConfigExisted,
    repoConfigWrite
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  printTextSummary(result, t);
  return result;
}
