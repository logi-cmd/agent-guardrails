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

function buildWindsurfSnippet() {
  // Windsurf uses ~/.codeium/windsurf/mcp_config.json with standard mcpServers format
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

function buildOpenClawSnippet() {
  // OpenClaw stores MCP servers in ~/.openclaw/openclaw.json under mcp.servers
  return JSON.stringify(
    {
      mcp: {
        servers: {
          "agent-guardrails": {
            command: "npx",
            args: ["agent-guardrails", "mcp"]
          }
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
  openhands: {
    id: "openhands",
    displayName: "OpenHands",
    adapterId: "openhands",
    targetKind: "repo-local-config",
    targetLocation: ".openhands/mcp.json",
    targetLocationDescription:
      "Your OpenHands workspace config file, commonly `.openhands/mcp.json`.",
    safeRepoConfigPath: ".openhands/mcp.json",
    snippet: jsonSnippet,
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: [path.posix.join(".agents", "skills", "agent-guardrails.md")],
    pilotEntryTier: "supplementary",
    pilotRecordPath: path.posix.join("docs", "pilots", "openhands.md")
  },
  openclaw: {
    id: "openclaw",
    displayName: "OpenClaw",
    adapterId: "openclaw",
    targetKind: "user-global-config",
    targetLocation: "~/.openclaw/openclaw.json",
    targetLocationDescription:
      "Your OpenClaw config file, commonly `~/.openclaw/openclaw.json`. Add to the `mcp.servers` section.",
    safeRepoConfigPath: null,
    snippet: buildOpenClawSnippet(),
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: ["OPENCLAW.md"],
    pilotEntryTier: "supplementary",
    pilotRecordPath: path.posix.join("docs", "pilots", "openclaw.md")
  }
  ,
  gemini: {
    id: "gemini",
    displayName: "Gemini CLI",
    adapterId: "gemini",
    targetKind: "user-global-config",
    targetLocation: "~/.gemini/settings.json",
    targetLocationDescription: "Your Gemini CLI user config file, commonly `~/.gemini/settings.json`.",
    safeRepoConfigPath: null,
    snippet: jsonSnippet,
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: ["GEMINI.md"],
    pilotEntryTier: "supplementary",
    pilotRecordPath: path.posix.join("docs", "pilots", "gemini.md")
  },
  windsurf: {
    id: "windsurf",
    displayName: "Windsurf",
    adapterId: "windsurf",
    targetKind: "user-global-config",
    targetLocation: "~/.codeium/windsurf/mcp_config.json",
    targetLocationDescription:
      "Your Windsurf MCP config file, commonly `~/.codeium/windsurf/mcp_config.json`.",
    safeRepoConfigPath: null,
    snippet: buildWindsurfSnippet(),
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: [path.posix.join(".windsurf", "rules", "agent-guardrails.md")],
    pilotEntryTier: "supplementary",
    pilotRecordPath: path.posix.join("docs", "pilots", "windsurf.md")
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
    repoLocalHelperFiles: [path.posix.join(".opencode", "rules", "agent-guardrails.md")],
    pilotEntryTier: "supplementary",
    pilotRecordPath: path.posix.join("docs", "pilots", "opencode.md")
  }
};

export function getSetupAgentDefinition(agentId) {
  return setupAgentDefinitions[agentId] ?? null;
}
