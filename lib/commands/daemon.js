/**
 * Agent Guardrails Daemon Mode
 *
 * Event-driven file watcher — zero resource usage when idle.
 *
 * Usage:
 *   agent-guardrails start [--foreground]   - Start daemon (--foreground for terminal)
 *   agent-guardrails stop                   - Stop daemon
 *   agent-guardrails status                 - Show status
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { createTranslator } from "../i18n.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DAEMON_PID_FILE = ".agent-guardrails/daemon.pid";
const DAEMON_LOG_FILE = ".agent-guardrails/daemon.log";
const DAEMON_CONFIG_FILE = ".agent-guardrails/daemon.json";
const DAEMON_INFO_FILE = ".agent-guardrails/daemon-info.json";

/**
 * 注入/移除 AGENTS.md 中的守护进程规则
 */

const DAEMON_AGENTS_MARKER_START = "<!-- agent-guardrails:daemon:start -->";
const DAEMON_AGENTS_MARKER_END = "<!-- agent-guardrails:daemon:end -->";
const DAEMON_AGENTS_BLOCK = `\n${DAEMON_AGENTS_MARKER_START}
## Daemon Mode / 守护模式

Daemon 正在运行。每次修改文件后，请调用 \`read_daemon_status\` MCP 工具检查 guardrail 结果。如果有 error 级别的 finding，在继续之前先修复。
${DAEMON_AGENTS_MARKER_END}\n`;

function injectDaemonRule(repoRoot) {
  const agentsFile = path.join(repoRoot, "AGENTS.md");
  if (!fs.existsSync(agentsFile)) return;
  let content = fs.readFileSync(agentsFile, "utf8");
  if (content.includes(DAEMON_AGENTS_MARKER_START)) return; // 已存在
  content = content.trimEnd() + DAEMON_AGENTS_BLOCK;
  fs.writeFileSync(agentsFile, content, "utf8");
}

function removeDaemonRule(repoRoot) {
  const agentsFile = path.join(repoRoot, "AGENTS.md");
  if (!fs.existsSync(agentsFile)) return;
  let content = fs.readFileSync(agentsFile, "utf8");
  const startIdx = content.indexOf(DAEMON_AGENTS_MARKER_START);
  const endIdx = content.indexOf(DAEMON_AGENTS_MARKER_END);
  if (startIdx === -1 || endIdx === -1) return;
  content = content.slice(0, startIdx).trimEnd() + "\n" + content.slice(endIdx + DAEMON_AGENTS_MARKER_END.length).trimStart() + "\n";
  fs.writeFileSync(agentsFile, content, "utf8");
}

/**
 * 注入/移除 Claude Code PostToolUse hook（daemon-check）
 */

const DAEMON_HOOK_ID = "agent-guardrails:daemon-check";
const DAEMON_HOOK_SCRIPT = ".claude/hooks/daemon-check.cjs";

function injectClaudeHook(repoRoot) {
  const settingsPath = path.join(repoRoot, ".claude", "settings.json");
  const hookScriptPath = path.join(repoRoot, DAEMON_HOOK_SCRIPT);
  const scriptSource = path.resolve(__dirname, "..", "daemon", "hooks", "daemon-check.cjs");

  // 复制 hook 脚本到项目
  const hookDir = path.dirname(hookScriptPath);
  if (!fs.existsSync(hookDir)) fs.mkdirSync(hookDir, { recursive: true });
  fs.copyFileSync(scriptSource, hookScriptPath);

  // 合并到 settings.json
  let settings = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

  // 幂等检查
  if (settings.hooks.PostToolUse.some(h => h.id === DAEMON_HOOK_ID)) return;

  settings.hooks.PostToolUse.push({
    id: DAEMON_HOOK_ID,
    matcher: "Edit|Write|MultiEdit",
    hooks: [{
      type: "command",
      command: `node "${hookScriptPath}"`,
      timeout: 10
    }]
  });

  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function removeClaudeHook(repoRoot) {
  const settingsPath = path.join(repoRoot, ".claude", "settings.json");
  const hookScriptPath = path.join(repoRoot, DAEMON_HOOK_SCRIPT);

  // 删除 hook 脚本
  if (fs.existsSync(hookScriptPath)) fs.unlinkSync(hookScriptPath);

  // 从 settings.json 移除
  if (!fs.existsSync(settingsPath)) return;
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  if (!settings.hooks?.PostToolUse) return;

  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(h => h.id !== DAEMON_HOOK_ID);
  if (settings.hooks.PostToolUse.length === 0) delete settings.hooks.PostToolUse;
  if (Object.keys(settings.hooks).length === 0) delete settings.hooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Agent hook definitions — shared metadata for all supported agents
// ---------------------------------------------------------------------------

const AGENT_HOOKS = [
  {
    id: "agent-guardrails:daemon-check",
    name: "Claude Code",
    description: "文件编辑后自动检查，结果直接显示在对话中",
    detect: (root) => fs.existsSync(path.join(root, ".claude", "settings.json")),
    inject: injectClaudeHook,
    remove: removeClaudeHook
  },
  {
    id: "agent-guardrails:windsurf-check",
    name: "Windsurf",
    description: "文件编辑后自动检查，UI + Agent 双通道反馈",
    detect: (root) => fs.existsSync(path.join(root, ".windsurf")),
    inject: injectWindsurfHook,
    remove: removeWindsurfHook
  },
  {
    id: "agent-guardrails:cursor-check",
    name: "Cursor",
    description: "文件编辑后自动检查，Output Channel 显示（Beta）",
    detect: (root) => fs.existsSync(path.join(root, ".cursor")),
    inject: injectCursorHook,
    remove: removeCursorHook
  },
  {
    id: "agent-guardrails:opencode-check",
    name: "OpenCode",
    description: "文件编辑后自动检查，Toast + 日志反馈",
    detect: (root) => fs.existsSync(path.join(root, ".opencode")),
    inject: injectOpenCodeHook,
    remove: removeOpenCodeHook
  },
  {
    id: "agent-guardrails:openclaw-check",
    name: "OpenClaw",
    description: "任务完成时推送检查报告到对话",
    detect: (root) => fs.existsSync(path.join(root, ".openclaw")),
    inject: injectOpenClawHook,
    remove: removeOpenClawHook
  },
  {
    id: "agent-guardrails:codex-check",
    name: "Codex CLI",
    description: "Turn 完成时检查（实验性 hooks）",
    detect: (root) => fs.existsSync(path.join(root, ".codex")),
    inject: injectCodexHook,
    remove: removeCodexHook
  },
  {
    id: "agent-guardrails:gemini-check",
    name: "Gemini CLI",
    description: "文件编辑后自动检查，Agent 直接看到错误",
    detect: (root) => fs.existsSync(path.join(root, ".gemini")),
    inject: injectGeminiHook,
    remove: removeGeminiHook
  },
  {
    id: "agent-guardrails:openhands-check",
    name: "OpenHands",
    description: "文件编辑后自动检查，结果直接显示在对话中",
    detect: (root) => fs.existsSync(path.join(root, ".openhands")),
    inject: injectOpenHandsHook,
    remove: removeOpenHandsHook
  },
  {
    id: "agent-guardrails:git-pre-commit",
    name: "Git",
    description: "pre-commit 拦截 error 级别 finding，阻止提交",
    detect: (root) => {
      try { return fs.existsSync(path.join(root, ".git")); } catch { return false; }
    },
    inject: injectGitHook,
    remove: removeGitHook
  }
];

/**
 * Helper: merge a hook entry into a JSON config file with idempotency
 */
function mergeHookEntry(configPath, topKey, entry, idField = "id") {
  let config = {};
  if (fs.existsSync(configPath)) {
    try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { config = {}; }
  }

  if (!config[topKey]) config[topKey] = [];
  if (Array.isArray(config[topKey]) && config[topKey].some(h => h[idField] === entry[idField])) {
    return config; // already exists
  }

  config[topKey].push(entry);

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  return config;
}

/**
 * Helper: remove a hook entry by id from a JSON config file
 */
function removeHookEntry(configPath, topKey, idField, idValue) {
  if (!fs.existsSync(configPath)) return;
  let config;
  try { config = JSON.parse(fs.readFileSync(configPath, "utf8")); } catch { return; }
  if (!config[topKey]) return;

  config[topKey] = config[topKey].filter(h => h[idField] !== idValue);
  if (config[topKey].length === 0) delete config[topKey];
  if (Object.keys(config).length === 0) {
    fs.unlinkSync(configPath);
  } else {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
}

// ---------------------------------------------------------------------------
// Windsurf hooks
// ---------------------------------------------------------------------------

function injectWindsurfHook(repoRoot) {
  const hooksDir = path.join(repoRoot, ".windsurf", "hooks");
  const hooksFile = path.join(repoRoot, ".windsurf", "hooks.json");
  const scriptSource = path.resolve(__dirname, "..", "daemon", "hooks", "windsurf-check.cjs");

  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(scriptSource, path.join(hooksDir, "windsurf-check.cjs"));

  let config = {};
  if (fs.existsSync(hooksFile)) {
    try { config = JSON.parse(fs.readFileSync(hooksFile, "utf8")); } catch { config = {}; }
  }

  if (!Array.isArray(config.hooks)) config.hooks = [];

  const ourHookId = "agent-guardrails:windsurf-check";
  const alreadyInjected = config.hooks.some(group =>
    group.hooks?.post_write_code?.some(h => h.id === ourHookId)
  );
  if (alreadyInjected) return;

  config.hooks.push({
    version: 1,
    hooks: {
      post_write_code: [{
        id: ourHookId,
        command: `node "${hooksDir}/windsurf-check.cjs"`,
        show_output: true
      }]
    }
  });

  const dir = path.dirname(hooksFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function removeWindsurfHook(repoRoot) {
  const hooksFile = path.join(repoRoot, ".windsurf", "hooks.json");
  const scriptPath = path.join(repoRoot, ".windsurf", "hooks", "windsurf-check.cjs");
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

  if (!fs.existsSync(hooksFile)) return;
  try {
    const config = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
    // config.hooks is an array of hook group objects
    if (Array.isArray(config.hooks)) {
      config.hooks = config.hooks.filter(group => {
        if (group.hooks?.post_write_code) {
          group.hooks.post_write_code = group.hooks.post_write_code
            .filter(h => h.id !== "agent-guardrails:windsurf-check");
          return group.hooks.post_write_code.length > 0;
        }
        return true;
      });
      if (config.hooks.length === 0) {
        fs.unlinkSync(hooksFile);
      } else {
        fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Cursor hooks
// ---------------------------------------------------------------------------

function injectCursorHook(repoRoot) {
  const hooksDir = path.join(repoRoot, ".cursor", "hooks");
  const hooksFile = path.join(repoRoot, ".cursor", "hooks.json");
  const scriptSource = path.resolve(__dirname, "..", "daemon", "hooks", "cursor-check.cjs");

  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(scriptSource, path.join(hooksDir, "cursor-check.cjs"));

  let config = {};
  if (fs.existsSync(hooksFile)) {
    try { config = JSON.parse(fs.readFileSync(hooksFile, "utf8")); } catch { config = {}; }
  }

  if (!Array.isArray(config.hooks)) config.hooks = [];

  const ourHookId = "agent-guardrails:cursor-check";
  const alreadyInjected = config.hooks.some(group =>
    group.hooks?.afterFileEdit?.some(h => h.id === ourHookId)
  );
  if (alreadyInjected) return;

  config.hooks.push({
    version: 1,
    hooks: {
      afterFileEdit: [{
        id: ourHookId,
        command: `node "${hooksDir}/cursor-check.cjs"`
      }]
    }
  });

  const dir = path.dirname(hooksFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function removeCursorHook(repoRoot) {
  const hooksFile = path.join(repoRoot, ".cursor", "hooks.json");
  const scriptPath = path.join(repoRoot, ".cursor", "hooks", "cursor-check.cjs");
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

  if (!fs.existsSync(hooksFile)) return;
  try {
    const config = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
    if (Array.isArray(config.hooks)) {
      config.hooks = config.hooks.filter(group => {
        if (group.hooks?.afterFileEdit) {
          group.hooks.afterFileEdit = group.hooks.afterFileEdit
            .filter(h => h.id !== "agent-guardrails:cursor-check");
          return group.hooks.afterFileEdit.length > 0;
        }
        return true;
      });
      if (config.hooks.length === 0) {
        fs.unlinkSync(hooksFile);
      } else {
        fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// OpenCode plugin
// ---------------------------------------------------------------------------

function injectOpenCodeHook(repoRoot) {
  const pluginsDir = path.join(repoRoot, ".opencode", "plugins");
  const configFile = path.join(repoRoot, ".opencode", "config.json");
  const pluginSource = path.resolve(__dirname, "..", "daemon", "hooks", "opencode-plugin.js");

  if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
  fs.copyFileSync(pluginSource, path.join(pluginsDir, "guardrails.js"));

  // Register plugin in config
  let config = {};
  if (fs.existsSync(configFile)) {
    try { config = JSON.parse(fs.readFileSync(configFile, "utf8")); } catch { config = {}; }
  }
  if (!config.plugin) config.plugin = [];
  if (!Array.isArray(config.plugin)) config.plugin = [config.plugin];

  const pluginPath = ".opencode/plugins/guardrails.js";
  if (!config.plugin.includes(pluginPath)) {
    config.plugin.push(pluginPath);
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
}

function removeOpenCodeHook(repoRoot) {
  const pluginPath = path.join(repoRoot, ".opencode", "plugins", "guardrails.js");
  const configFile = path.join(repoRoot, ".opencode", "config.json");
  if (fs.existsSync(pluginPath)) fs.unlinkSync(pluginPath);

  if (!fs.existsSync(configFile)) return;
  try {
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (Array.isArray(config.plugin)) {
      config.plugin = config.plugin.filter(p => p !== ".opencode/plugins/guardrails.js");
      if (config.plugin.length === 0) delete config.plugin;
      if (Object.keys(config).length === 0) {
        fs.unlinkSync(configFile);
      } else {
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf8");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// OpenClaw hooks
// ---------------------------------------------------------------------------

function injectOpenClawHook(repoRoot) {
  const hookDir = path.join(repoRoot, ".openclaw", "hooks", "daemon-guardrail-check");
  const handlerSource = path.resolve(__dirname, "..", "daemon", "hooks", "openclaw-handler.cjs");

  if (!fs.existsSync(hookDir)) fs.mkdirSync(hookDir, { recursive: true });
  fs.copyFileSync(handlerSource, path.join(hookDir, "handler.cjs"));

  // Create HOOK.md metadata
  fs.writeFileSync(path.join(hookDir, "HOOK.md"), [
    "# daemon-guardrail-check",
    "",
    "Runs agent-guardrails check when an agent command completes.",
    "",
    "- Event: command:stop",
    "- Handler: handler.cjs",
    ""
  ].join("\n"), "utf8");
}

function removeOpenClawHook(repoRoot) {
  const hookDir = path.join(repoRoot, ".openclaw", "hooks", "daemon-guardrail-check");
  if (!fs.existsSync(hookDir)) return;
  try {
    const files = fs.readdirSync(hookDir);
    for (const f of files) fs.unlinkSync(path.join(hookDir, f));
    fs.rmdirSync(hookDir);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Codex CLI hooks (experimental)
// ---------------------------------------------------------------------------

function injectCodexHook(repoRoot) {
  const hooksDir = path.join(repoRoot, ".codex", "hooks");
  const hooksFile = path.join(repoRoot, ".codex", "hooks.json");
  const scriptSource = path.resolve(__dirname, "..", "daemon", "hooks", "codex-check.cjs");

  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(scriptSource, path.join(hooksDir, "guardrails-check.js"));

  let config = {};
  if (fs.existsSync(hooksFile)) {
    try { config = JSON.parse(fs.readFileSync(hooksFile, "utf8")); } catch { config = {}; }
  }

  if (!config.hooks) config.hooks = {};
  if (!config.hooks.Stop) config.hooks.Stop = [];

  // Idempotent check
  const id = "agent-guardrails:codex-check";
  if (config.hooks.Stop.some(s => s.id === id)) return;

  config.hooks.Stop.push({
    id,
    hooks: [{
      type: "command",
      command: `node ".codex/hooks/guardrails-check.js"`,
      statusMessage: "Running guardrails check...",
      timeout: 10
    }]
  });

  fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function removeCodexHook(repoRoot) {
  const hooksFile = path.join(repoRoot, ".codex", "hooks.json");
  const scriptPath = path.join(repoRoot, ".codex", "hooks", "guardrails-check.js");
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

  if (!fs.existsSync(hooksFile)) return;
  try {
    const config = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
    if (config.hooks?.Stop) {
      config.hooks.Stop = config.hooks.Stop.filter(s => s.id !== "agent-guardrails:codex-check");
      if (config.hooks.Stop.length === 0) delete config.hooks.Stop;
      if (Object.keys(config.hooks || {}).length === 0) {
        fs.unlinkSync(hooksFile);
      } else {
        fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Gemini CLI hooks
// ---------------------------------------------------------------------------

function injectGeminiHook(repoRoot) {
  const hooksDir = path.join(repoRoot, ".gemini", "hooks");
  const settingsFile = path.join(repoRoot, ".gemini", "settings.json");
  const scriptSource = path.resolve(__dirname, "..", "daemon", "hooks", "gemini-check.cjs");

  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(scriptSource, path.join(hooksDir, "guardrails-check.js"));

  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try { settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")); } catch { settings = {}; }
  }

  if (!settings.hooks) settings.hooks = {};
  if (!settings.hooks.AfterTool) settings.hooks.AfterTool = [];

  // Idempotent check by name
  const name = "agent-guardrails-check";
  const existing = settings.hooks.AfterTool.find(e => e.matcher === "write_file|replace|edit");
  if (existing?.hooks?.some(h => h.name === name)) return;

  settings.hooks.AfterTool.push({
    matcher: "write_file|replace|edit",
    hooks: [{
      name,
      type: "command",
      command: `node "$GEMINI_PROJECT_DIR/.gemini/hooks/guardrails-check.js"`,
      timeout: 10000,
      description: "Run agent-guardrails check after file edits"
    }]
  });

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function removeGeminiHook(repoRoot) {
  const settingsFile = path.join(repoRoot, ".gemini", "settings.json");
  const scriptPath = path.join(repoRoot, ".gemini", "hooks", "guardrails-check.js");
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

  if (!fs.existsSync(settingsFile)) return;
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    if (settings.hooks?.AfterTool) {
      settings.hooks.AfterTool = settings.hooks.AfterTool
        .filter(e => !(e.hooks?.some(h => h.name === "agent-guardrails-check")));
      if (settings.hooks.AfterTool.length === 0) delete settings.hooks.AfterTool;
      if (Object.keys(settings.hooks || {}).length === 0) delete settings.hooks;
      if (Object.keys(settings).length === 0) {
        fs.unlinkSync(settingsFile);
      } else {
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n", "utf8");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// OpenHands hooks
// ---------------------------------------------------------------------------

function injectOpenHandsHook(repoRoot) {
  const hooksDir = path.join(repoRoot, ".openhands", "hooks");
  const hooksFile = path.join(repoRoot, ".openhands", "hooks.json");
  const scriptSource = path.resolve(__dirname, "..", "daemon", "hooks", "openhands-check.cjs");

  if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
  fs.copyFileSync(scriptSource, path.join(hooksDir, "openhands-check.cjs"));

  let config = {};
  if (fs.existsSync(hooksFile)) {
    try { config = JSON.parse(fs.readFileSync(hooksFile, "utf8")); } catch { config = {}; }
  }

  if (!Array.isArray(config.hooks)) config.hooks = [];

  const ourHookId = "agent-guardrails:openhands-check";
  const alreadyInjected = config.hooks.some(group =>
    group.hooks?.post_write_code?.some(h => h.id === ourHookId)
  );
  if (alreadyInjected) return;

  config.hooks.push({
    version: 1,
    hooks: {
      post_write_code: [{
        id: ourHookId,
        command: `node "${hooksDir}/openhands-check.cjs"`,
        show_output: true
      }]
    }
  });

  const dir = path.dirname(hooksFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function removeOpenHandsHook(repoRoot) {
  const hooksFile = path.join(repoRoot, ".openhands", "hooks.json");
  const scriptPath = path.join(repoRoot, ".openhands", "hooks", "openhands-check.cjs");
  if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);

  if (!fs.existsSync(hooksFile)) return;
  try {
    const config = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
    if (Array.isArray(config.hooks)) {
      config.hooks = config.hooks.filter(group => {
        if (group.hooks?.post_write_code) {
          group.hooks.post_write_code = group.hooks.post_write_code
            .filter(h => h.id !== "agent-guardrails:openhands-check");
          return group.hooks.post_write_code.length > 0;
        }
        return true;
      });
      if (config.hooks.length === 0) {
        fs.unlinkSync(hooksFile);
      } else {
        fs.writeFileSync(hooksFile, JSON.stringify(config, null, 2) + "\n", "utf8");
      }
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Git pre-commit hook
// ---------------------------------------------------------------------------

function injectGitHook(repoRoot) {
  const hookDir = path.join(repoRoot, ".git", "hooks");
  const hookPath = path.join(hookDir, "pre-commit");
  const srcPath = path.resolve(__dirname, "..", "daemon", "hooks", "pre-commit-check.cjs");

  // Don't overwrite existing pre-commit hook — append guard
  let existing = "";
  try { existing = fs.readFileSync(hookPath, "utf8"); } catch {}
  if (existing.includes("agent-guardrails")) return; // Already injected

  const hookContent = `#!/bin/sh\n# agent-guardrails pre-commit hook\nnode "${srcPath}"\n`;

  try {
    if (!fs.existsSync(hookDir)) fs.mkdirSync(hookDir, { recursive: true });
    fs.writeFileSync(hookPath, existing ? existing + "\n" + hookContent : hookContent);
    // Make executable (Unix)
    try { fs.chmodSync(hookPath, 0o755); } catch {}
  } catch {}
}

function removeGitHook(repoRoot) {
  const hookPath = path.join(repoRoot, ".git", "hooks", "pre-commit");
  try {
    let content = fs.readFileSync(hookPath, "utf8");
    if (content.includes("agent-guardrails")) {
      // Remove our block
      const lines = content.split("\n");
      const filtered = lines.filter(line => !line.includes("agent-guardrails") && !line.includes("pre-commit-check.cjs"));
      const cleaned = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      if (cleaned && cleaned !== "#!/bin/sh") {
        fs.writeFileSync(hookPath, cleaned + "\n");
      } else {
        // File only had our content — delete it
        fs.unlinkSync(hookPath);
      }
    }
  } catch {}
}

/**
 * 默认守护配置
 */
const DEFAULT_DAEMON_CONFIG = {
  enabled: true,
  watchPaths: ["src/", "lib/", "tests/"],
  ignorePatterns: ["node_modules", ".git", "dist", "coverage"],
  checkInterval: 5000,
  notifications: {
    sound: false,
    desktop: false
  },
  autoFix: false,
  blockOnHighRisk: true
};

/**
 * 获取守护配置
 */
export function getDaemonConfig(repoRoot) {
  const configPath = path.join(repoRoot, DAEMON_CONFIG_FILE);

  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, "utf8");
      return { ...DEFAULT_DAEMON_CONFIG, ...JSON.parse(content) };
    } catch {
      // 配置解析失败，使用默认
    }
  }

  return DEFAULT_DAEMON_CONFIG;
}

/**
 * 写入守护配置
 */
export function writeDaemonConfig(repoRoot, config) {
  const configPath = path.join(repoRoot, DAEMON_CONFIG_FILE);
  const dir = path.dirname(configPath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

/**
 * 检查守护进程是否运行
 */
export function isDaemonRunning(repoRoot) {
  const pidFile = path.join(repoRoot, DAEMON_PID_FILE);

  if (!fs.existsSync(pidFile)) {
    return { running: false };
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, "utf8").trim(), 10);

    if (Number.isNaN(pid)) {
      return { running: false };
    }

    // 跨平台检查进程
    let running = false;
    try {
      if (process.platform === "win32") {
        const result = spawnSync("tasklist", ["/FI", `PID eq ${pid}`], {
          encoding: "utf8",
          timeout: 5000
        });
        // 精确匹配 PID，避免 "123" 匹配 "1234"
        running = new RegExp(`\\b${pid}\\b`).test(result.stdout);
      } else {
        process.kill(pid, 0);
        running = true;
      }
    } catch {
      running = false;
    }

    if (!running) {
      fs.unlinkSync(pidFile);
      return { running: false };
    }

    // 读取守护进程信息
    const infoFile = path.join(repoRoot, DAEMON_INFO_FILE);
    let info = {};
    if (fs.existsSync(infoFile)) {
      try {
        info = JSON.parse(fs.readFileSync(infoFile, "utf8"));
      } catch {
        // ignore
      }
    }

    return {
      running: true,
      pid,
      startTime: info.startTime,
      checksRun: info.checksRun || 0,
      lastCheck: info.lastCheck
    };
  } catch {
    return { running: false };
  }
}

/**
 * 事件驱动等待 PID 文件出现（替代 busy-wait 轮询）
 */
async function waitForPidFile(pidFile, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (fs.existsSync(pidFile)) {
      try { resolve(fs.readFileSync(pidFile, "utf8").trim()); } catch { resolve(null); }
      return;
    }

    const dir = path.dirname(pidFile);
    let watcher;
    const timer = setTimeout(() => {
      if (watcher) watcher.close();
      // 最终检查一次
      if (fs.existsSync(pidFile)) {
        try { resolve(fs.readFileSync(pidFile, "utf8").trim()); } catch { resolve(null); }
      } else {
        resolve(null);
      }
    }, timeoutMs);

    try {
      watcher = fs.watch(dir, (eventType) => {
        if (eventType === "rename" && fs.existsSync(pidFile)) {
          clearTimeout(timer);
          watcher.close();
          try { resolve(fs.readFileSync(pidFile, "utf8").trim()); } catch { resolve(null); }
        }
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

/**
 * 启动守护进程
 */
export async function startDaemon(repoRoot, options = {}) {
  const locale = options.locale || null;
  const foreground = options.foreground || false;
  const { t } = createTranslator(locale);

  // 检查是否已运行
  const status = isDaemonRunning(repoRoot);
  if (status.running && !foreground) {
    console.log(`\n${t("daemon.alreadyRunning")}`);
    console.log(`  PID: ${status.pid}`);
    console.log(`  ${t("daemon.startTime")}: ${status.startTime || "unknown"}`);
    console.log(`\n  ${t("daemon.useStop")}`);
    return { success: false, reason: "already_running", status };
  }

  const config = getDaemonConfig(repoRoot);

  // 前台模式 — 直接调用 worker.run()
  if (foreground) {
    const { run } = await import("../daemon/worker.js");
    return run({ repoRoot, config, foreground: true, locale });
  }

  // 后台模式 — spawn worker.js 子进程
  console.log(`\n${t("daemon.starting")}`);
  console.log(`  ${t("daemon.daemonPurpose")}\n`);

  const workerPath = path.resolve(__dirname, "..", "daemon", "worker.js");
  const pidFile = path.join(repoRoot, DAEMON_PID_FILE);

  const isWindows = process.platform === "win32";
  const child = spawn(process.execPath, [
    workerPath,
    "--repo-root", repoRoot,
    "--config", JSON.stringify(config)
  ], {
    detached: !isWindows,
    stdio: isWindows ? ["ignore", "pipe", "pipe"] : "ignore",
    cwd: repoRoot,
    windowsHide: true
  });

  child.on("error", (err) => {
    console.error(`  ${t("daemon.spawnError")}:`, err.message);
  });

  await new Promise(resolve => setTimeout(resolve, 1500));

  if (!isWindows) {
    child.unref();
  }

  // 事件驱动等待 PID 文件（替代 busy-wait）
  const pid = await waitForPidFile(pidFile, 10000);

  if (pid) {
    injectDaemonRule(repoRoot);

    // Inject hooks for all detected agents
    const injected = [];
    for (const agent of AGENT_HOOKS) {
      if (agent.detect(repoRoot)) {
        try {
          agent.inject(repoRoot);
          injected.push(agent);
        } catch { /* skip individual agent failures */ }
      }
    }

    console.log(`\n🛡️  ${t("daemon.daemonRunningInfo", { pid })}\n`);

    if (injected.length > 0) {
      console.log(t("daemon.hooksInjected"));
      for (const a of injected) {
        console.log(`  ✅ ${a.name.padEnd(14)} — ${a.description}`);
      }
      console.log("");
    } else {
      console.log(t("daemon.hooksEmpty") + "\n");
      console.log(t("daemon.supportedAgents"));
      for (const a of AGENT_HOOKS) {
        console.log(`  • ${a.name} (${a.detect(repoRoot) ? t("daemon.detected") : t("daemon.notDetected")})`);
      }
      console.log("");
    }

    console.log(t("daemon.stopCommandHint"));
    console.log(t("daemon.logFileHint", { file: DAEMON_LOG_FILE }));
    console.log(t("daemon.configFileHint", { file: DAEMON_CONFIG_FILE }));
    return { success: true, pid: parseInt(pid, 10), injected: injected.map(a => a.name) };
  } else {
    console.log(`${t("daemon.startFailed")}`);
    return { success: false, reason: "timeout" };
  }
}

/**
 * 停止守护进程
 */
export async function stopDaemon(repoRoot, options = {}) {
  const locale = options.locale || null;
  const { t } = createTranslator(locale);

  const status = isDaemonRunning(repoRoot);

  if (status.running) {
    console.log(`\n${t("daemon.stopping")}`);
    console.log(`  PID: ${status.pid}`);

    try {
      if (process.platform === "win32") {
        // 先尝试 taskkill /T（终止进程树，给 SIGTERM handler 机会）
        spawnSync("taskkill", ["/PID", status.pid.toString(), "/T"], {
          encoding: "utf8",
          timeout: 5000
        });
        // 等待进程退出
        const { setTimeout: delay } = await import("node:timers/promises");
        await delay(1000);
        // 如果还活着，强制终止
        if (isDaemonRunning(repoRoot).running) {
          spawnSync("taskkill", ["/PID", status.pid.toString(), "/F", "/T"], {
            encoding: "utf8",
            timeout: 5000
          });
        }
      } else {
        process.kill(status.pid, "SIGTERM");
      }

      // 清理文件
      const pidFile = path.join(repoRoot, DAEMON_PID_FILE);
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
    } catch (error) {
      console.log(`\n${t("daemon.stopFailed")}: ${error.message}`);
      return { success: false, reason: error.message };
    }
  } else {
    console.log(`\n${t("daemon.cleaningHooks")}`);
  }

  // Always clean up hooks (even if daemon wasn't running)
  try {
    removeDaemonRule(repoRoot);

    // Remove hooks for all agents
    for (const agent of AGENT_HOOKS) {
      try { agent.remove(repoRoot); } catch { /* skip */ }
    }

    console.log(`${t("daemon.stopped")}`);
    return { success: true };
  } catch (error) {
    console.log(`\n${t("daemon.stopFailed")}: ${error.message}`);
    return { success: false, reason: error.message };
  }
}

/**
 * 显示守护进程状态
 */
export function showDaemonStatus(repoRoot, options = {}) {
  const locale = options.locale || null;
  const { t } = createTranslator(locale);

  const status = isDaemonRunning(repoRoot);
  const config = getDaemonConfig(repoRoot);

  console.log(`\n${t("daemon.status")}\n`);

  if (status.running) {
    console.log(`  ${t("daemon.state")}: ${t("daemon.running")}`);
    console.log(`  PID: ${status.pid}`);
    console.log(`  ${t("daemon.startTime")}: ${status.startTime || "unknown"}`);
    console.log(`  ${t("daemon.checksRun")}: ${status.checksRun}`);
    console.log(`  ${t("daemon.lastCheck")}: ${status.lastCheck || "never"}`);
  } else {
    console.log(`  ${t("daemon.state")}: ${t("daemon.stopped")}`);
  }

  console.log(`\n  ${t("daemon.config")}:`);
  console.log(`    ${t("daemon.watchPaths")}: ${config.watchPaths.join(", ")}`);
  console.log(`    ${t("daemon.checkInterval")}: ${config.checkInterval}ms`);
  console.log(`    ${t("daemon.blockOnHighRisk")}: ${config.blockOnHighRisk ? "yes" : "no"}`);

  console.log(`\n  ${t("daemon.commands")}:`);
  if (status.running) {
    console.log(`    agent-guardrails stop     - ${t("daemon.stopDesc")}`);
  } else {
    console.log(`    agent-guardrails start   - ${t("daemon.startDesc")}`);
  }
  console.log(`    agent-guardrails status  - ${t("daemon.statusDesc")}`);

  // Show active agent hooks
  if (status.running) {
    const activeHooks = AGENT_HOOKS.filter(a => a.detect(repoRoot));
    if (activeHooks.length > 0) {
      console.log(`\n  ${t("daemon.activeHooks")}:`);
      for (const a of activeHooks) {
        console.log(`    ${a.name.padEnd(14)} ✅`);
      }
    }
  }

  return status;
}
