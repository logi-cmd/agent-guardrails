# Release Notes - v0.7.2

## Problem
OpenCode uses a non-standard MCP configuration format. The previous version wrote `.opencode/mcp.json` with the standard MCP JSON format, which OpenCode does not recognize.

## Solution
- Changed OpenCode adapter to write `opencode.json` instead of `.opencode/mcp.json`
- Config format updated to OpenCode's native schema with `$schema` field
- `setup.js` merge behavior now preserves existing configs

## Changes
- `lib/setup/agents.js`: OpenCode adapter now uses `buildOpenCodeSnippet()` with correct format
- `lib/commands/setup.js`: `maybeWriteRepoConfig()` merges with existing files
- `tests/setup.test.js`: Updated assertions to expect `opencode.json`

## Correct Format
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "agent-guardrails": {
      "type": "local",
      "command": ["npx", "agent-guardrails", "mcp"],
      "enabled": true
    }
  }
}
```

## Breaking Changes
None - fully backward compatible.

## Files Changed
- `lib/setup/agents.js`
- `lib/commands/setup.js`
- `tests/setup.test.js`
- `package.json` (version bump)
- `CHANGELOG.md`
