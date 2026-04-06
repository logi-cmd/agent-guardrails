# Project State

Last updated: 2026-04-06 (v0.16.0)

## Current Version

**v0.16.0** — Basic security hygiene warnings: hardcoded secrets, unsafe patterns, sensitive file changes

## Goal

Pivot from a CLI-only merge gate to an agent-native runtime with system-level auto-trigger and reproducible verification.

## Current State

- Claude Code has repo-local PreToolUse / PostToolUse hook templates for deterministic file-write interception, including Bash tool interception (`sed -i`, `tee`, `echo >`, `mv`, `cp`).
- Gemini CLI has repo-local BeforeTool / AfterTool hook templates using the official `.gemini/settings.json` hook configuration.
- OpenCode setup installs the runtime pieces in the right places (`AGENTS.md`, `.opencode/plugins/guardrails.js`).
- Public docs are aligned around the 5 supported agents: `claude-code`, `cursor`, `opencode`, `codex`, `gemini`.
- **New presets** (v0.15.0): `static-frontend` for pure HTML/CSS/JS/Vue/Svelte projects, and `generic` as a universal fallback for any project type.
- **Default preset changed** (v0.15.0) from `node-service` to `generic`, so non-Node.js projects get a usable config out of the box.
- **Parent directory detection fixed** (v0.14.1): running inside a subdirectory of a larger git repo no longer incorrectly uses the parent repo's `.git`. Includes Windows MSYS Git path normalization.
- **base-ref fallback** (v0.14.4): when `--base-ref` points to a non-existent ref (e.g. `origin/main` without a remote), check falls back to `git diff HEAD` with an actionable warning instead of silently returning 0 files.
- **`createFinding` runtime error fixed** (v0.14.5): missing import in `check.js` no longer crashes when base-ref fallback warning triggers.
- **False config warning suppressed** (v0.15.1): `.agent-guardrails/` files now classified as `guardrails-internal` instead of `config`, eliminating the false `config-or-migration-change` warning on every check run.
- **Basic security hygiene warnings** (v0.16.0): three new warning-only detectors — hardcoded secrets (API keys, passwords, tokens), unsafe code patterns (`eval()`, `innerHTML`, `chmod 777`), and sensitive file changes (`.env`, `credentials`, private keys). All are warning-only, never block, zero false-positive tolerance by default.
- **README cleanup** (v0.14.2–0.14.3): removed internal strategy/engineering notes not intended for public users; added prerequisites section (must be a git repo); removed geographic restriction from target audience.
- The OSS baseline includes Bash write interception, loop protection, daemon dedup, circuit-breaker behavior, continuity/performance review surfacing, i18n-backed baseline detector messages, a lightweight reviewer-output suppression layer, and an optional lightweight built-in mutation-testing slice.
- Mutation testing is fully integrated into the OSS check pipeline with baseline-first execution, config-gated default-disabled behavior, and warning-only output.

## Next Steps

### OSS Baseline — Complete

The intended OSS merge-gate baseline is complete for the current product boundary:

1. Hook: Bash file-write interception — **DONE**
2. Loop detection and daemon dedup — **DONE**
3. Failure recovery / circuit breaker — **DONE**
4. Context management cleanup — **DONE**
5. Lightweight reviewer-output suppression — **DONE**
6. `enforce` / `unenforce` round-trip coverage — **DONE**
7. Detector coverage for state-management, async-risk, and performance findings — **DONE**
8. Surface `continuity` / `performance` findings in review output — **DONE**
9. Replace detector-local hardcoded messages with `i18n` lookups — **DONE**
10. Config/task-contract validation — **DONE**
11. Version consistency checks across release-facing docs — **DONE**
12. Minimal static verification and cache-aware CI — **DONE**

### Mutation Testing Integration — Complete

13. Wire mutation tester into OSS check pipeline — **DONE**
14. Baseline-first execution with warning on failure — **DONE**
15. Config-gated, default-disabled, warning-only output — **DONE**
16. Direct test coverage for mutation detector and i18n messages — **DONE**
17. Working-tree diff parsing fix for correct path extraction — **DONE**

### Robustness — Complete

18. Parent directory detection (subdirectory inside larger git repo) — **DONE** (v0.14.1)
19. base-ref fallback when remote branch not found — **DONE** (v0.14.4)
20. `createFinding` import error in check.js — **DONE** (v0.14.5)
21. README public-facing cleanup and prerequisites — **DONE** (v0.14.2–0.14.3)
22. False config-or-migration warning for `.agent-guardrails/` files — **DONE** (v0.15.1)

### Presets — Complete

22. `static-frontend` preset (HTML/CSS/JS/Vue/Svelte, no test commands) — **DONE** (v0.15.0)
23. `generic` preset (universal fallback, no assumptions) — **DONE** (v0.15.0)
24. Default preset changed from `node-service` to `generic` — **DONE** (v0.15.0)

### Remaining Runtime Phases

25. ~~Gemini CLI hook path~~ — **DONE**
26. Codex hook path — **DEFERRED** (official support remains experimental / Bash-only / Windows-disabled)
27. `agent-guardrails doctor` OSS slice — **DONE**

## Honest capability boundary

| Pain point | OSS status | Pro target | Not claimed |
|------------|-----------|------------|-------------|
| Verification failure (AI code passes weak checks) | OSS merge gate bounds scope, requires explicit commands and evidence. Drift detection is basic/heuristic. | Pro adds deeper semantic analysis, full mutation integration (Stryker/mutmut), independent model review. | General correctness proof. |
| Self-verification bias (same agent generates and judges) | OSS separates generation from merge-gate enforcement. Optional lightweight mutation testing catches the most egregious vacuous tests when explicitly enabled. Does not add an independent reviewer. | Pro adds independent model review, structured context handoff, deeper mutation integration with automation. | Eliminating all bias. The generating agent still writes the tests. Mutation testing narrows the gap, it does not close it. |
| Route/plan mistakes (agent picks wrong approach) | OSS task contracts make intent explicit before code is written. `plan` constrains scope upfront. | Pro adds auto contract generation, repo pattern learning, smarter suggestions. | Guaranteeing the plan is strategically correct. |
| Long-context / session memory decay | OSS has no session continuity mechanism. Each task starts from the contract only. | Pro adds structured context handoff, session management, context compression. | Solving long-context degradation at the model layer. |
| Objective calipers (external tools the agent cannot influence) | OSS ships an optional lightweight built-in mutation-testing slice (basic mutations: boolean flips, operator swaps, literal replacements) when explicitly enabled with a runnable test command. Users can also wire in type-check, coverage, and external mutation-testing commands as required commands. | Pro adds automatic caliper configuration, full mutation testing integration (Stryker/mutmut, diff-scoped runs, survivor thresholds, historical tracking), independent review, runtime smoke tests. | Formal verification. Runtime smoke tests are a later phase. Mutation testing improves evidence that tests are non-vacuous; it does not prove correctness or comprehensive coverage. |

## Known gaps

- **Codex native hook path**: deferred until official support is stable beyond experimental Bash-only interception.
- **Evaluation design**: Binary pass/fail with no composite scoring or configurable weights. Adequate for merge-gate use case but not for graduated enforcement.
- **Trust calipers**: partially shipped. An optional lightweight built-in mutation-testing slice (Caliper 3) is now shipped in OSS. Type-check and coverage gates remain trivial preset edits (not yet done). Full mutation integration, independent review, context handoff, and runtime smoke tests are still proposal-stage.
- **Mutation testing in OSS**: the built-in tester applies basic mutations (boolean flips, operator swaps, literal replacements) to detect the most egregious cases of vacuous tests. It is config-gated, requires an explicit runnable `testCommand`, and skips to a warning if the baseline command fails. It improves evidence that tests are non-vacuous. It does not prove correctness or comprehensive coverage, and does not replace stronger tools like Stryker or mutmut.
- **Drift detection**: basic and heuristic. OSS catches obvious pattern/interface/boundary drift through filename and token matching. Full AST-based analysis belongs to Pro.
- **Commercial packaging**: the next challenge is no longer whether OSS works as a merge gate, but how clearly the project communicates the upgrade from OSS trust layer to Pro Local efficiency/depth layer for solo developers and small teams.
