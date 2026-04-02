import path from "node:path";

function buildJsonSnippet() {
  return JSON.stringify(
    {
      mcpServers: {
        "agent-guardrails": {
          command: "npx",
          args: ["agent-guardrails", "mcp"]
        }
      }
    },
    null,
    2
  );
}

function buildOpenCodeSnippet() {
  return JSON.stringify(
    {
      $schema: "https://opencode.ai/config.json",
      mcp: {
        "agent-guardrails": {
          type: "local",
          command: ["npx", "agent-guardrails", "mcp"],
          enabled: true
        }
      }
    },
    null,
    2
  );
}

const jsonSnippet = buildJsonSnippet();
const canonicalFlow = [
  "read_repo_guardrails",
  "start_agent_native_loop",
  "implement inside the declared scope",
  "finish_agent_native_loop"
];
const shortFirstChatPrompt =
  "Please use agent-guardrails for this repo. Read the repo guardrails, turn my rough idea into the smallest safe task, keep the change inside the declared scope, and finish with a reviewer summary.";

export const setupAgentDefinitions = {
  codex: {
    id: "codex",
    displayName: "Codex",
    adapterId: "codex",
    targetKind: "user-global-config",
    targetLocation: "~/.codex/config.toml",
    targetLocationDescription: "Your Codex user config file, commonly `~/.codex/config.toml`.",
    safeRepoConfigPath: null,
    snippet: [
      "[mcp_servers.agent-guardrails]",
      'command = "npx"',
      'args = ["agent-guardrails", "mcp"]'
    ].join("\n"),
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: [path.posix.join(".codex", "instructions.md")],
    pilotEntryTier: "secondary",
    pilotRecordPath: path.posix.join("docs", "pilots", "codex.md")
  },
  "claude-code": {
    id: "claude-code",
    displayName: "Claude Code",
    adapterId: "claude-code",
    targetKind: "repo-local-config",
    targetLocation: ".mcp.json",
    targetLocationDescription:
      "Your Claude Code repo config file, commonly `.mcp.json` in the repo root.",
    safeRepoConfigPath: ".mcp.json",
    snippet: jsonSnippet,
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: ["CLAUDE.md"],
    pilotEntryTier: "primary",
    pilotRecordPath: path.posix.join("docs", "pilots", "claude-code.md")
  },
  cursor: {
    id: "cursor",
    displayName: "Cursor",
    adapterId: "cursor",
    targetKind: "workspace-config",
    targetLocation: ".cursor/mcp.json",
    targetLocationDescription:
      "Your Cursor workspace config file, commonly `.cursor/mcp.json`.",
    safeRepoConfigPath: ".cursor/mcp.json",
    snippet: jsonSnippet,
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: [path.posix.join(".cursor", "rules", "agent-guardrails.mdc")],
    pilotEntryTier: "secondary",
    pilotRecordPath: path.posix.join("docs", "pilots", "cursor.md")
  },
  opencode: {
    id: "opencode",
    displayName: "OpenCode",
    adapterId: "opencode",
    targetKind: "repo-local-config",
    targetLocation: "opencode.json",
    targetLocationDescription:
      "Your OpenCode workspace config file, commonly `opencode.json`.",
    safeRepoConfigPath: "opencode.json",
    snippet: buildOpenCodeSnippet(),
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: ["AGENTS.md", path.posix.join(".opencode", "plugins", "guardrails.js")],
    pilotEntryTier: "primary",
    pilotRecordPath: path.posix.join("docs", "pilots", "opencode.md")
  },
  gemini: {
    id: "gemini",
    displayName: "Gemini CLI",
    adapterId: "gemini",
    targetKind: "user-global-config",
    targetLocation: "~/.gemini/settings.json",
    targetLocationDescription:
      "Your Gemini CLI user settings file, commonly `~/.gemini/settings.json`.",
    safeRepoConfigPath: null,
    snippet: JSON.stringify(
      {
        mcpServers: {
          "agent-guardrails": {
            command: "npx",
            args: ["agent-guardrails", "mcp"]
          }
        }
      },
      null,
      2
    ),
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: ["GEMINI.md"],
    pilotEntryTier: "primary",
    pilotRecordPath: path.posix.join("docs", "pilots", "gemini.md")
  }
};

export function getSetupAgentDefinition(agentId) {
  return setupAgentDefinitions[agentId] ?? null;
}
