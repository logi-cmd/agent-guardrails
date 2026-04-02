# Current Task Evidence

## Task

Assess harness-oriented optimization opportunities using the `harness-engineering` skill, and update maintainer-facing docs.

## Commands Run

- `task(subagent_type="explore", ...)` — repo-wide general engineering scan (first pass)
- `task(subagent_type="explore", ...)` — harness-layer audit across 8 dimensions (second pass, with harness-engineering skill)

## Notable Results

### First pass (general engineering scan)
- Confirmed `docs/PROJECT_STATE.md` was stale (v0.10.1) relative to shipped `package.json` (v0.11.0).
- Found gaps in test runner (auto-fix tests not running), review output (continuity/performance findings invisible), i18n (hardcoded Chinese in detectors).

### Second pass (harness-engineering audit)
- **(e) Hook completeness — CRITICAL**: Claude Code hooks only cover Write/Edit/MultiEdit. Bash tool can bypass all scope checks via sed/tee/echo.
- **(g) Loop detection — HIGH**: No per-session MCP call counter, no convergence detection, no state-hash dedup.
- **(d) Failure recovery — HIGH**: Agent loop returns null on error (no structured error); daemon has no circuit breaker.
- **(c) Context management — HIGH**: `purgeExpired()` in session.js is never called — latent memory leak.
- **(b) Generator/evaluator — MEDIUM**: Detectors self-grade with no independent validation or false-positive suppression.
- **(a) Execution loop — LOW**: Daemon debounce is appropriate; add max-check-per-interval later.
- **(f) Evaluation design — LOW**: Binary pass/fail works for merge-gate; add weighted scoring for CI quality gates later.
- **(h) Tool boundaries — LOW**: MCP tools are well-structured; add per-request timeout and clarify overlapping tools later.

### Docs updated
- `README.md` — Added Engineering Harness Priorities (critical/important/principle) and Maintainer Verification Loop.
- `docs/PROJECT_STATE.md` — Updated to v0.11.0, restructured next steps around harness priorities with specific fixes.
- `.agent-guardrails/evidence/current-task.md` — This file.

## Residual Risk

- Documentation now reflects the discovered gaps, but the underlying code issues remain until implemented.
- The Bash file-write bypass is the single largest harness gap — hooks are incomplete until it's closed.

## Notes

- First pass used a general engineering scan because `harness-engineering` skill was not yet available.
- Second pass loaded the full skill (SKILL.md + reference/principles.md) and audited all 8 dimensions against its verification checklist.
