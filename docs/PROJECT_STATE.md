# Project State

Last updated: 2026-04-04 (v0.13.0)

## Current Version

**v0.13.0** — OSS merge-gate baseline complete, mutation testing integrated

## Goal

Pivot from a CLI-only merge gate to an agent-native runtime with system-level auto-trigger and reproducible verification.

## Current State

- Claude Code now has repo-local PreToolUse / PostToolUse hook templates for deterministic file-write interception.
- Gemini CLI now has repo-local BeforeTool / AfterTool hook templates using the official `.gemini/settings.json` hook configuration.
- OpenCode setup now installs the runtime pieces in the right places (`AGENTS.md`, `.opencode/plugins/guardrails.js`).
- Public docs are now aligned around the 5 supported agents: `claude-code`, `cursor`, `opencode`, `codex`, `gemini`.
- Product docs now more explicitly position the first paid buyer as overseas solo developers and small teams using existing AI coding tools.
- The OSS baseline now includes Bash write interception in Claude-facing hook matchers, loop protection, daemon dedup, circuit-breaker behavior, continuity/performance review surfacing, i18n-backed baseline detector messages, a lightweight reviewer-output suppression layer, and an optional lightweight built-in mutation-testing slice.
- **Mutation testing is now fully integrated** into the OSS check pipeline with baseline-first execution, config-gated default-disabled behavior, and warning-only output.
- **Working-tree diff parsing fixed** — `git status --porcelain` paths now correctly preserve leading characters instead of being truncated.
- **Test coverage enhanced** — direct module tests for mutation detector, i18n mutation messages, and `listChangedFiles()` porcelain parsing added to existing test files.
- **Reviewer warning reduction** — eliminated public surface drift warning, reduced async-risk warnings, tightened task contract surface declarations.

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

### Mutation Testing Integration

13. **Wire mutation tester into OSS check pipeline** — **DONE**
14. **Baseline-first execution with warning on failure** — **DONE**
15. **Config-gated, default-disabled, warning-only output** — **DONE**
16. **Direct test coverage for mutation detector and i18n messages** — **DONE**
17. **Working-tree diff parsing fix for correct path extraction** — **DONE**

### Remaining Runtime Phases

18. ~~Gemini CLI hook path~~ — **DONE**
19. Codex hook path — **DEFERRED** (official support remains experimental / Bash-only / Windows-disabled)
20. `agent-guardrails doctor` OSS slice — **DONE**

## Honest capability boundary

The five pain points from practitioner reports map to the project as follows:

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
- **Commercial packaging**: the next challenge is no longer whether OSS works as a merge gate, but how clearly the project communicates the upgrade from OSS trust layer to Pro Local efficiency/depth layer for overseas solo developers and small teams.

## Recent reviewer alignment work

- Fixed `lib/utils.js` working-tree parsing so `git status --porcelain` no longer truncates leading characters from paths.
- Enhanced `tests/check.test.js` with direct mutation detector and `listChangedFiles()` coverage.
- Enhanced `tests/i18n.test.js` with direct mutation message export coverage.
- Converted `tests/check.test.js` `captureLogs` from `.then()` chains to `async/await`.
- Tightened `.agent-guardrails/task-contract.json` to declare full public surface changes.
- Eliminated public surface drift warning and reduced async-risk warnings in reviewer output.
