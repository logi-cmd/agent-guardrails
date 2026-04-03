# Project State

Last updated: 2026-04-03 (v0.13.0)

## Current Version

**v0.13.0** — OSS baseline complete

## Goal

Pivot from a CLI-only merge gate to an agent-native runtime with system-level auto-trigger and reproducible verification.

## Current State

- Claude Code now has repo-local PreToolUse / PostToolUse hook templates for deterministic file-write interception.
- Gemini CLI now has repo-local BeforeTool / AfterTool hook templates using the official `.gemini/settings.json` hook configuration.
- OpenCode setup now installs the runtime pieces in the right places (`AGENTS.md`, `.opencode/plugins/guardrails.js`).
- Public docs are now aligned around the 5 supported agents: `claude-code`, `cursor`, `opencode`, `codex`, `gemini`.
- Product docs now more explicitly position the first paid buyer as overseas solo developers and small teams using existing AI coding tools.
- The OSS baseline now includes Bash write interception in Claude-facing hook matchers, loop protection, daemon dedup, circuit-breaker behavior, continuity/performance review surfacing, i18n-backed baseline detector messages, and a lightweight reviewer-output suppression layer.

## Next Steps

### OSS Baseline Status

The intended OSS merge-gate baseline is now complete for the current product boundary:

1. **Hook: Bash file-write interception** — **DONE**
2. **Loop detection and daemon dedup** — **DONE**
3. **Failure recovery / circuit breaker** — **DONE**
4. **Context management cleanup** — **DONE**
5. **Lightweight reviewer-output suppression** — **DONE**

### Verification Harness

6. `enforce` / `unenforce` round-trip coverage — **DONE**
7. Detector coverage for state-management, async-risk, and performance findings — **DONE**

### Runtime Output Correctness

8. Surface `continuity` / `performance` findings in review output — **DONE**
9. Replace detector-local hardcoded messages with `i18n` lookups — **DONE**
10. Add lightweight config/task-contract validation where silent failure is currently possible — **DONE**

### Release Safety

11. Add version consistency checks across release-facing docs — **DONE**
12. Add minimal static verification and cache-aware CI improvements — **DONE**

### Remaining Runtime Phases

13. ~~Gemini CLI hook path~~ — **DONE**
14. Codex hook path — **DEFERRED** (official support remains experimental / Bash-only / Windows-disabled)
15. `agent-guardrails doctor` OSS slice — **DONE**

## Known Gaps

- **Codex native hook path**: remains deferred until official support is stable beyond experimental Bash-only interception.
- **Evaluation design**: Binary pass/fail with no composite scoring or configurable weights. Adequate for merge-gate use case but not for graduated enforcement.
- **Commercial packaging**: the next challenge is no longer whether OSS works as a merge gate, but how clearly the project communicates the upgrade from OSS trust layer to Pro Local efficiency layer for overseas solo developers and small teams.
