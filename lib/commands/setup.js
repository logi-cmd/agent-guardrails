import fs from "node:fs";
import path from "node:path";
import { runInit } from "./init.js";
import { createTranslator } from "../i18n.js";
import { getSetupAgentDefinition } from "../setup/agents.js";
import { ensureDirectory, loadTemplate, projectRoot, readConfig, resolveRepoRoot, supportedAdapters, writeText } from "../utils.js";

function formatList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function injectGitHook(repoRoot, t) {
  const hooksDir = path.join(repoRoot, ".git", "hooks");
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

function injectSlashCommands(t) {
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

function mergeClaudeSettings(repoRoot) {
  const settingsPath = path.join(repoRoot, ".claude", "settings.json");
  ensureDirectory(path.dirname(settingsPath));

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }

  if (!settings.hooks || typeof settings.hooks !== "object") {
    settings.hooks = {};
  }

  const ensureHook = (eventName, matcher, command) => {
    if (!Array.isArray(settings.hooks[eventName])) {
      settings.hooks[eventName] = [];
    }

    let eventEntry = settings.hooks[eventName].find(
      (entry) => entry && entry.matcher === matcher && Array.isArray(entry.hooks)
    );

    if (!eventEntry) {
      eventEntry = { matcher, hooks: [] };
      settings.hooks[eventName].push(eventEntry);
    }

    const exists = eventEntry.hooks.some(
      (hook) => hook && hook.type === "command" && hook.command === command
    );

    if (!exists) {
      eventEntry.hooks.push({
        type: "command",
        command,
        timeout: 30
      });
    }
  };

  ensureHook("PreToolUse", "Write|Edit|MultiEdit|Bash", "node .agent-guardrails/hooks/claude-code-pre-tool.cjs");
  ensureHook("PostToolUse", "Write|Edit|MultiEdit|Bash", "node .agent-guardrails/hooks/claude-code-post-tool.cjs");

  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return ".claude/settings.json";
}

function mergeGeminiSettings(repoRoot) {
  const settingsPath = path.join(repoRoot, ".gemini", "settings.json");
  ensureDirectory(path.dirname(settingsPath));

  let settings = {};
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    } catch {
      settings = {};
    }
  }

  if (!settings.hooks || typeof settings.hooks !== "object") {
    settings.hooks = {};
  }

  const ensureHook = (eventName, matcher, command) => {
    if (!Array.isArray(settings.hooks[eventName])) {
      settings.hooks[eventName] = [];
    }

    let eventEntry = settings.hooks[eventName].find(
      (entry) => entry && entry.matcher === matcher && Array.isArray(entry.hooks)
    );

    if (!eventEntry) {
      eventEntry = { matcher, hooks: [] };
      settings.hooks[eventName].push(eventEntry);
    }

    const exists = eventEntry.hooks.some(
      (hook) => hook && hook.type === "command" && hook.command === command
    );

    if (!exists) {
      eventEntry.hooks.push({
        type: "command",
        command,
        timeout: 30
      });
    }
  };

  ensureHook("BeforeTool", "write_file|replace|edit|run_shell_command", "node .agent-guardrails/hooks/gemini-pre-tool.cjs");
  ensureHook("AfterTool", "write_file|replace|edit|run_shell_command", "node .agent-guardrails/hooks/gemini-post-tool.cjs");

  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return ".gemini/settings.json";
}

function installAgentRuntimeFiles(repoRoot, agent) {
  const installed = [];

  if (agent.id === "opencode") {
    const targetPath = path.join(repoRoot, ".opencode", "plugins", "guardrails.js");
    const sourcePath = path.join(projectRoot, "lib", "daemon", "hooks", "opencode-plugin.js");
    if (!fs.existsSync(targetPath) && fs.existsSync(sourcePath)) {
      ensureDirectory(path.dirname(targetPath));
      fs.copyFileSync(sourcePath, targetPath);
      installed.push(path.posix.join(".opencode", "plugins", "guardrails.js"));
    }
  }

  if (agent.id === "claude-code") {
    const hookTargets = [
      {
        target: path.join(repoRoot, ".agent-guardrails", "hooks", "claude-code-pre-tool.cjs"),
        template: "hooks/claude-code-pre-tool.cjs"
      },
      {
        target: path.join(repoRoot, ".agent-guardrails", "hooks", "claude-code-post-tool.cjs"),
        template: "hooks/claude-code-post-tool.cjs"
      }
    ];

    for (const item of hookTargets) {
      ensureDirectory(path.dirname(item.target));
      fs.writeFileSync(item.target, loadTemplate(item.template), "utf8");
      installed.push(path.relative(repoRoot, item.target).replaceAll("\\", "/"));
    }

    installed.push(mergeClaudeSettings(repoRoot));
  }

  if (agent.id === "gemini") {
    const hookTargets = [
      {
        target: path.join(repoRoot, ".agent-guardrails", "hooks", "gemini-pre-tool.cjs"),
        template: "hooks/gemini-pre-tool.cjs"
      },
      {
        target: path.join(repoRoot, ".agent-guardrails", "hooks", "gemini-post-tool.cjs"),
        template: "hooks/gemini-post-tool.cjs"
      }
    ];

    for (const item of hookTargets) {
      ensureDirectory(path.dirname(item.target));
      fs.writeFileSync(item.target, loadTemplate(item.template), "utf8");
      installed.push(path.relative(repoRoot, item.target).replaceAll("\\", "/"));
    }

    installed.push(mergeGeminiSettings(repoRoot));
  }

  return { installed };
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
  repoConfigWrite,
  pluginInstallResult
}) {
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

  const installedPluginFiles = pluginInstallResult.installed;

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
      adapterHelperFiles: repoLocalFiles,
      pluginFilesInstalled: installedPluginFiles
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

  if (result.initialization.pluginFilesInstalled.length > 0) {
    console.log("");
    console.log(t("setup.repoLocalFilesReady"));
    console.log(formatList(result.initialization.pluginFilesInstalled));
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
  const repoRoot = resolveRepoRoot(positional[0] ? path.resolve(positional[0]) : process.cwd());
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

  const hookResult = injectGitHook(repoRoot, t);
  const slashCommandsResult = injectSlashCommands(t);

  const pluginInstallResult = installAgentRuntimeFiles(repoRoot, agent);

  const result = buildSetupResult({
    repoRoot,
    preset,
    agent,
    initResult,
    autoInitialized: !repoConfigExisted,
    repoConfigExisted,
    repoConfigWrite,
    pluginInstallResult
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result;
  }

  printTextSummary(result, t);
  return result;
}
