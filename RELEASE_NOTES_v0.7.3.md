# Release Notes - v0.7.3

## Problem
OpenClaw and Windsurf were configured with incorrect MCP server file paths. The previous versions wrote to wrong locations with potentially incompatible formats.

## Root Cause Discovery
Research revealed that:
- **Windsurf** uses `~/.codeium/windsurf/mcp_config.json` (NOT `.windsurf/mcp.json`)
- **OpenClaw** uses `~/.openclaw/openclaw.json` with `mcp.servers` structure (NOT `.openclaw/mcp.json`)

## Solution

### OpenClaw Fix
- Path: `~/.openclaw/openclaw.json` (user-global, not repo-local)
- Format: Uses OpenClaw's native `mcp.servers` structure
- Config snippet now outputs:
```json
{
  "mcp": {
    "servers": {
      "agent-guardrails": {
        "command": "npx",
        "args": ["agent-guardrails", "mcp"]
      }
    }
  }
}
```

### Windsurf Fix
- Path: `~/.codeium/windsurf/mcp_config.json` (user-global, not repo-local)
- Format: Standard `mcpServers` format (same as before but correct path)

## Changes
- `lib/setup/agents.js`: Added `buildWindsurfSnippet()` and `buildOpenClawSnippet()`
- Updated OpenClaw adapter: `targetLocation`, `safeRepoConfigPath: null`, `buildOpenClawSnippet()`
- Updated Windsurf adapter: `targetLocation`, `safeRepoConfigPath: null`, `buildWindsurfSnippet()`
- `tests/setup.test.js`: Updated expectations for openclaw and windsurf (expect "paste" not "point it at")
- `README.md`: Corrected setup paths
- `adapters/openclaw/README.md`: Updated to reflect user-global config behavior

## Breaking Changes
None - both are user-global configs, no auto-write behavior changed.

## Agent Config Status (v0.7.3)
| Agent | Config Path | Format | Auto-Write |
|-------|-----------|--------|------------|
| claude-code | `.mcp.json` | Standard MCP | ✅ |
| cursor | `.cursor/mcp.json` | Standard MCP | ✅ |
| openhands | `.openhands/mcp.json` | Standard MCP | ✅ |
| opencode | `opencode.json` | OpenCode native | ✅ |
| codex | `~/.codex/config.toml` | TOML | ❌ (user-global) |
| gemini | `~/.gemini/settings.json` | Standard MCP | ❌ (user-global) |
| openclaw | `~/.openclaw/openclaw.json` | OpenClaw native | ❌ (user-global) |
| windsurf | `~/.codeium/windsurf/mcp_config.json` | Standard MCP | ❌ (user-global) |

## Files Changed
- `lib/setup/agents.js`
- `tests/setup.test.js`
- `README.md`
- `adapters/openclaw/README.md`
- `package.json` (version bump)
- `CHANGELOG.md`
