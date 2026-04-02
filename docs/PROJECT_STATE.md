# Project State

Last updated: 2026-04-02 (v0.11.0)

## Current Version

**v0.12.0** — Harness-engineering audit fixes

## Goal

Pivot from a CLI-only merge gate to an agent-native runtime with system-level auto-trigger and reproducible verification.

## Current State

- Claude Code now has repo-local PreToolUse / PostToolUse hook templates for deterministic file-write interception.
- OpenCode setup now installs the runtime pieces in the right places (`AGENTS.md`, `.opencode/plugins/guardrails.js`).
- Public docs are now aligned around the 5 supported agents: `claude-code`, `cursor`, `opencode`, `codex`, `gemini`.

## Next Steps

### Harness Layer (highest priority)

Based on a harness-engineering audit across 8 dimensions, the most impactful gaps are:

1. **Hook: Bash file-write interception** — CRITICAL
   - Claude Code hooks only cover `Write`/`Edit`/`MultiEdit`. The `Bash` tool can run `sed -i`, `tee`, `echo > file` to bypass all scope checks.
   - Fix: Add `Bash` tool to pre-tool hook filter; parse shell commands for file-write patterns.
2. **Loop detection** — HIGH
   - No per-session call counter on MCP tools. An LLM agent could call `check_after_edit` indefinitely.
   - No convergence detection: identical daemon checks re-run on every file-change event.
   - Fix: Add configurable max-calls-per-session for MCP tools; add state-hash dedup for daemon checks.
3. **Failure recovery** — HIGH
   - `startAgentNativeLoop` / `finishAgentNativeLoop` return `null` on missing config — no structured error.
   - No circuit breaker: a failing check retries on every file change with zero cooldown.
   - Fix: Replace `null` returns with structured error objects; add failure counter + cooldown in daemon.
4. **Context management** — HIGH
   - `session.js` has a `purgeExpired()` function that is never called. Memory leak over long-running daemon sessions.
   - Fix: Wire `setInterval(purgeExpired, 10min)` at module level.
5. **Generator / evaluator separation** — MEDIUM
   - All detectors self-assign severity with no independent validation layer. No false-positive suppression.
   - Fix: Add a lightweight suppression layer (context-aware severity downgrade) before review output.

### Verification Harness

6. Make `auto-fix` tests run inside `npm test`
7. Add `enforce` / `unenforce` round-trip coverage
8. Add detector coverage for state-management, async-risk, and performance findings

### Runtime Output Correctness

9. Surface `continuity` / `performance` findings in review output
10. Replace detector-local hardcoded messages with `i18n` lookups
11. Add lightweight config/task-contract validation where silent failure is currently possible

### Release Safety

12. Add version consistency checks across release-facing docs
13. Add minimal static verification and cache-aware CI improvements

### Remaining Runtime Phases

14. Gemini CLI hook path
15. Codex hook path
16. `agent-guardrails doctor` + setup flow rewrite

## Known Gaps

- **Hook coverage**: Claude Code and OpenCode hooks do not intercept Bash-based file writes. This is the single largest harness gap.
- **Loop detection**: No mechanism to prevent infinite MCP tool calls or redundant daemon checks.
- **Failure propagation**: Agent loop returns `null` instead of structured errors; daemon has no circuit breaker.
- **Context leak**: Session store grows without bound because `purgeExpired()` is never invoked.
- **Runtime interception**: Still partial — Claude Code and OpenCode are ahead; Gemini CLI and Codex still need the same level of hook-backed proof.
- **Evaluation design**: Binary pass/fail with no composite scoring or configurable weights. Adequate for merge-gate use case but not for graduated enforcement.
