# Release Notes v0.7.4

**Date:** 2026-03-31

## Summary

Verified all 8 agent adapters have correct MCP config paths and formats. Added missing adapter documentation for Gemini CLI, Windsurf, and OpenCode.

## What Changed

### Agent Adapter Verification

| Agent | Config Path | Format | Status |
|-------|-----------|--------|--------|
| claude-code | `.mcp.json` | Standard MCP JSON | ✅ Verified |
| cursor | `.cursor/mcp.json` | Standard MCP JSON | ✅ Verified |
| openhands | `.openhands/mcp.json` | Standard MCP JSON | ✅ Verified |
| opencode | `opencode.json` | OpenCode native schema | ✅ Verified |
| openclaw | `~/.openclaw/openclaw.json` | OpenClaw `mcp.servers` | ✅ Verified |
| windsurf | `~/.codeium/windsurf/mcp_config.json` | Standard MCP JSON | ✅ Verified |
| codex | `~/.codex/config.toml` | TOML `[mcp_servers.xxx]` | ✅ Verified |
| gemini | `~/.gemini/settings.json` | Standard MCP JSON | ✅ Verified |

### New Documentation

Created adapter README files for previously undocumented agents:

- `adapters/gemini/README.md` - Gemini CLI adapter setup guide
- `adapters/windsurf/README.md` - Windsurf adapter setup guide
- `adapters/opencode/README.md` - OpenCode adapter setup guide

### Tests

- Added `gemini` write-repo-config test case (no-op behavior for user-global config)

## Migration Guide

No breaking changes. If you're already using `agent-guardrails` with any of the 8 supported agents, simply update:

```bash
npm install -g agent-guardrails
```

## Full Changelog

See [CHANGELOG.md](./CHANGELOG.md) for complete history.
