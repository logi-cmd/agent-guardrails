# Release Notes: v0.7.6

## Template Hardening — `check_after_edit` Instructions

**Release date**: 2026-03-31

### What Changed

Strengthened `check_after_edit` instructions across all 9 template files (base AGENTS.md + 8 adapter templates).

### Why

Users reported that guardrail results from the daemon GUI Dashboard were not appearing in their AI chat. The root cause: AI agents were not consistently calling `check_after_edit` after edits, and the template instructions were not strong enough to enforce this behavior.

### Key Improvements

1. **Explicit feedback channel**: All templates now state that `check_after_edit` is the **ONLY** way guardrail results appear in the AI chat. The daemon GUI is explicitly labeled as a secondary display.

2. **User change validation**: New rule instructing AI agents to call `check_after_edit` when the user says they modified files manually — not just when the AI itself makes edits.

3. **No batching**: Agents must check after EACH individual edit, not batch multiple changes before validating.

4. **Finish discipline**: Agents must call `finish_agent_native_loop` before telling the user "task done".

5. **Claude Code adapter fix**: Fixed broken numbering in the Claude Code template (3→4→5→6 was malformed).

### Files Changed

- `templates/base/AGENTS.md`
- `templates/adapters/claude-code/CLAUDE.md`
- `templates/adapters/cursor/agent-guardrails.mdc`
- `templates/adapters/codex/instructions.md`
- `templates/adapters/gemini/GEMINI.md`
- `templates/adapters/openclaw/OPENCLAW.md`
- `templates/adapters/opencode/agent-guardrails.md`
- `templates/adapters/openhands/agent-guardrails.md`
- `templates/adapters/windsurf/agent-guardrails.md`

### Upgrade

```bash
# Global install
npm update -g agent-guardrails

# Or clear npx cache
npm cache clean --force
# Then restart your AI tool
```

### What This Means for Users

After this update, AI agents will:
- Call `check_after_edit` after every file edit
- Show guardrail results directly in the chat dialog
- Validate user's manual file changes too
- Provide instant feedback without needing to open a separate GUI

### Previous Release

- [v0.7.5](https://github.com/logi-cmd/agent-guardrails/releases/tag/v0.7.5) — Active Guardrails: human-readable MCP responses + check_after_edit tool
