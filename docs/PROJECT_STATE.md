# Project State

Last updated: 2026-04-02 (v0.10.1)

## Current Version

**v0.10.1** — Docs cleanup

## Goal

Pivot from CLI tool to agent-native runtime with system-level auto-trigger.

## Next Steps

1. **Phase 2**: Claude Code PreToolUse/PostToolUse hooks
2. **Phase 3**: Gemini CLI BeforeTool hooks, Codex hooks
3. **Phase 4**: `agent-guardrails doctor` command + setup flow rewrite

## Blockers

- L0 auto-trigger (plugin/hook interception) not yet implemented — Phase 2-4 of RUNTIME_PIVOT_PLAN
- OpenCode enforce path still writes to `.opencode/rules/` instead of `AGENTS.md`
