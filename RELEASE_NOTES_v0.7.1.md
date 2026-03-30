# Release Notes for v0.7.1

## What's Fixed

### Setup Now Auto-Writes Repo-Local MCP Config

**Problem**: Running `agent-guardrails setup --agent claude-code` printed the MCP config snippet but required users to manually paste it into their agent's config file. Users had to copy and paste, which created friction and broken the "zero friction" setup promise.

**Solution**: `setup` now automatically writes the repo-local MCP config file for agents that support it. No more copy-pasting.

```bash
# Before (v0.7.0)
agent-guardrails setup --agent claude-code
# Output: "Paste this config into ~/.claude/settings.json"
# User had to manually paste

# After (v0.7.1)
agent-guardrails setup --agent claude-code
# Output: "Wrote repo-local agent config: .mcp.json"
# User just opens Claude Code and sends first chat message
```

### Agents That Get Auto-Write

| Agent | Config Path |
|-------|------------|
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| OpenHands | `.openhands/mcp.json` |
| OpenClaw | `.openclaw/mcp.json` |
| OpenCode | `.opencode/mcp.json` |
| Windsurf | `.windsurf/mcp.json` |

### Agents That Still Need Paste

| Agent | Reason |
|-------|--------|
| Codex | Uses user-global config (`~/.codex/config.toml`) |
| Gemini | Uses user-global config |

---

## What Changed

### `--write-repo-config` Flag

The flag is now a **no-op** but kept for backward compatibility. Previously:

```bash
# Required flag to auto-write
agent-guardrails setup --agent claude-code --write-repo-config
```

Now the config is auto-written without the flag:

```bash
# Just works
agent-guardrails setup --agent claude-code
```

---

## Documentation Updates

- **README.md** — Simplified setup examples, removed `--write-repo-config` references
- **Adapter READMEs** — cursor, claude-code, openhands, openclaw all updated
- **Pilot docs** — cursor.md, openhands.md, openclaw.md updated

---

## Installation

```bash
npm install -g agent-guardrails
```

Or update:
```bash
npm update -g agent-guardrails
```

---

## Links

- **npm**: https://www.npmjs.com/package/agent-guardrails/v/0.7.1
- **GitHub Release**: https://github.com/logi-cmd/agent-guardrails/releases/tag/v0.7.1

---

**Full Changelog**: https://github.com/logi-cmd/agent-guardrails/compare/v0.7.0...v0.7.1
