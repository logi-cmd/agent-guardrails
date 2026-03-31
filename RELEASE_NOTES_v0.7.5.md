# Release Notes: v0.7.5

## Active Guardrails — Human-Readable MCP Responses + `check_after_edit`

**Release date**: 2026-03-31

### What Changed

Made guardrail results appear directly in the AI chat dialog instead of requiring a separate GUI Dashboard.

### Key Features

#### 1. Human-Readable MCP Tool Responses

`start_agent_native_loop`, `check_after_edit`, and `finish_agent_native_loop` now return a human-readable text block as the **FIRST** content block, followed by JSON data. Users see check results directly in their chat without the agent needing to parse JSON.

#### 2. New `check_after_edit` Tool

Cache-first instant feedback after file edits:
- Reads `daemon-result.json` directly via `fs` (< 2 seconds)
- Falls back to `executeCheck()` if no daemon result is available
- Returns human-readable status for: clean / issues-found / stale / no-config states

#### 3. Template Updates

- Base `AGENTS.md`: Added "CRITICAL: Post-Edit Validation" section
- All 8 adapter templates updated with `check_after_edit` step:
  - Claude Code, Cursor, Codex, Gemini, OpenCode, OpenHands, OpenClaw, Windsurf

#### 4. Bug Fix

- Restored `suggest_task_contract` tool definition that was accidentally removed from `TOOL_DEFINITIONS`

### Files Changed

- `lib/mcp/server.js` — Human-readable responses, new helper function, restored tool definition
- `templates/base/AGENTS.md` — Post-edit validation instructions
- `templates/adapters/*/` — All 8 adapter templates updated
- `tests/mcp.test.js` — Updated tool list + new test

### Upgrade

```bash
# Global install
npm update -g agent-guardrails

# Or clear npx cache
npm cache clean --force
# Then restart your AI tool
```

### What This Means for Users

- **Before**: Guardrail results only appeared in the daemon GUI Dashboard (separate browser window)
- **After**: Results appear directly in the AI chat dialog as human-readable text
- AI agents automatically call `check_after_edit` after each file edit
- Feedback is instant (< 2 seconds) via daemon cache

### Previous Release

- [v0.7.4](https://github.com/logi-cmd/agent-guardrails/releases/tag/v0.7.4) — Verified all 8 agent adapters MCP config formats
