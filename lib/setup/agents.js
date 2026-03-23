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

const jsonSnippet = buildJsonSnippet();
const canonicalFlow = [
  "read_repo_guardrails",
  "start_agent_native_loop",
  "implement inside the declared scope",
  "finish_agent_native_loop"
];
const shortFirstChatPrompt =
  "Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, make the smallest safe change for: <describe your task here>, then finish with a reviewer summary.";

export const setupAgentDefinitions = {
  codex: {
    id: "codex",
    displayName: "Codex",
    adapterId: null,
    targetKind: "user-global-config",
    targetLocation: "~/.codex/config.toml",
    targetLocationDescription: "Add the MCP server block to your Codex config (commonly `~/.codex/config.toml`).",
    safeRepoConfigPath: null,
    snippet: [
      "[mcp_servers.agent-guardrails]",
      'command = "npx"',
      'args = ["agent-guardrails", "mcp"]'
    ].join("\n"),
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: [],
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
      "Paste this into the Claude Code MCP config for this repo (a common location is `.mcp.json` in the repo root).",
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
      "Paste this into Cursor's MCP settings for the workspace (a common repo-local location is `.cursor/mcp.json`).",
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
      "Paste this into the OpenHands MCP server settings for the current workspace, or let setup write the repo-local `.openhands/mcp.json` file when `--write-repo-config` is used.",
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
    targetKind: "repo-local-config",
    targetLocation: ".openclaw/mcp.json",
    targetLocationDescription:
      "Paste this into the OpenClaw MCP configuration for the current workspace, or let setup write the repo-local `.openclaw/mcp.json` file when `--write-repo-config` is used.",
    safeRepoConfigPath: ".openclaw/mcp.json",
    snippet: jsonSnippet,
    firstChatPrompt: shortFirstChatPrompt,
    canonicalFlow,
    repoLocalHelperFiles: ["OPENCLAW.md"],
    pilotEntryTier: "supplementary",
    pilotRecordPath: path.posix.join("docs", "pilots", "openclaw.md")
  }
};

export function getSetupAgentDefinition(agentId) {
  return setupAgentDefinitions[agentId] ?? null;
}
