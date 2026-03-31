# Release Notes: v0.7.7

## GUI Removal — Headless Daemon + MCP Chat Feedback

**Release date**: 2026-03-31

### What Changed

Removed the GUI Dashboard entirely. Guardrail results now appear exclusively through MCP tool responses in the AI chat dialog.

### Why

The GUI Dashboard required users to switch to a separate browser window to see check results, creating a fragmented experience. The MCP-based `check_after_edit` tool provides the same information directly in the chat — where users are already working with their AI agent.

### Removed

- **GUI Dashboard** (`lib/daemon/gui-server.js`) — 600+ lines of HTTP server + HTML/CSS/JS
- **Diagnostic page** (`lib/daemon/gui-diagnostic.html`) — debugging tool no longer needed
- **Demo page** (`docs/images/gui-dashboard-demo.html`)
- **`--no-gui` CLI flag** — daemon is now always headless
- **Browser auto-open** — no more `openBrowser()` calls

### What Replaced It

Guardrail results now flow through MCP tools:
- `check_after_edit` — instant feedback after each file edit (< 2s via daemon cache)
- `finish_agent_native_loop` — comprehensive summary at task completion

Both return human-readable text as the first content block, so results appear naturally in the chat dialog.

### Simplified Daemon

The daemon now:
1. Monitors file changes in the background
2. Runs guardrail checks automatically
3. Applies Tier-1 auto-fixes if enabled
4. Writes results to `daemon-result.json` (read by MCP tools)
5. Logs to `.agent-guardrails/daemon.log`

No browser window, no SSE connections, no GUI server.

### Upgrade

```bash
# Global install
npm update -g agent-guardrails

# Or clear npx cache
npm cache clean --force
# Then restart your AI tool
```

### Breaking Changes

- `--no-gui` flag is no longer recognized (daemon is always headless)
- GUI Dashboard URL is no longer available
- `read_daemon_status` MCP tool still works (reads `daemon-result.json`)

### Previous Release

- [v0.7.6](https://github.com/logi-cmd/agent-guardrails/releases/tag/v0.7.6) — Template hardening: strengthened check_after_edit instructions
