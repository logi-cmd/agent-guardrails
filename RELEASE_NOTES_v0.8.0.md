# Release Notes: v0.8.0

## CLI-First Guardrails — No MCP Required

**Release date**: 2026-03-31

### What Changed

Guardrail checks now work with zero configuration. No MCP setup, no adapter switching — just install and go.

### Key Changes

#### 1. AGENTS.md Template — CLI First

The default `AGENTS.md` now instructs AI to run `agent-guardrails check --base-ref HEAD~1` before finishing any task. No MCP tools required.

#### 2. Git Pre-Commit Hook — Auto-Injected

Both `setup` and `init` now automatically inject a `.git/hooks/pre-commit` hook that runs `agent-guardrails check --base-ref HEAD~1` before each commit. Bad commits are blocked. Skip with `--no-verify`.

#### 3. All 8 Adapter Templates — Rewritten

Claude Code, Cursor, Codex, Gemini, OpenHands, OpenClaw, OpenCode, and Windsurf adapters now:
- Use CLI check as primary mechanism
- Keep MCP as optional (not required)
- Each template explicitly states CLI check is always required

### Before vs After

| Aspect | Before (v0.7.x) | After (v0.8.0) |
|--------|-----------------|-----------------|
| Primary mechanism | MCP tools | CLI command |
| Setup complexity | Configure MCP JSON | Zero config |
| Git hook | None | Auto-injected |
| Adapter requirement | Must configure each | Just AGENTS.md |
| MCP dependency | Required | Optional |

### Installation

```bash
npm install -g agent-guardrails
cd my-project
agent-guardrails setup --agent claude-code
```

### What This Means

1. **For developers**: Install once, works immediately. AI reads `AGENTS.md` and runs CLI check automatically. Git hook catches any missed checks.
2. **For AI tools**: No MCP setup needed. Just read `AGENTS.md` and run shell commands.
3. **For MCP users**: MCP still works as optional enhancement for instant feedback.

### Files Changed

- `templates/base/AGENTS.md` — CLI-first instructions
- `templates/adapters/` — All 8 adapters rewritten
- `lib/commands/setup.js` — Git hook injection
- `lib/commands/init.js` — Git hook injection
- `lib/i18n.js` — New translations
- `tests/init.test.js` — Updated assertions
- `README.md` — Updated documentation
