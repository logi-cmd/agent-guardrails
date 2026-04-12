# Project State

Last updated: 2026-04-13 (post-v0.19.3, OSS Pro proof recipe status)

## Canonical build docs

The build-ready source of truth now lives in:

- `docs/DOCUMENTATION_INDEX.md`
- `docs/PRODUCT_BLUEPRINT.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/PRO_LOCAL_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/RELEASE_PROCESS.md`

Strategy, market, pricing, and older design docs still matter, but if there is any conflict, the canonical build docs win.

## Current Version

**v0.19.3** - Published OSS release. Post-v0.19.3 work in progress: `check --json` now exposes installed Pro proof plans at the top level, and `pro status` plus `check --review` render Pro proof-memory, proof recipes, learned proof, and prioritized proof-surface wording when available.

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
- **Basic security hygiene warnings** (v0.16.0): three new warning-only detectors â€?hardcoded secrets (API keys, passwords, tokens), unsafe code patterns (`eval()`, `innerHTML`, `chmod 777`), and sensitive file changes (`.env`, `credentials`, private keys). All are warning-only, never block, zero false-positive tolerance by default.
- **Composite scoring system** (v0.17.0): upgraded binary pass/fail to a 0-100 trust score with graduated verdicts (safe-to-deploy / pass-with-concerns / needs-attention / high-risk / blocked). Configurable per-category weights, visual score bar in CLI and MCP output. Backward compatible â€?errors still cause exit code 1.
- **OSS debt cleanup** (v0.17.0): removed TODO comments, synced self-repo config with template preset, removed dead code paths, removed reference to unpublished Python plugin, added type-check guidance to TS presets.
- **Phase 0 bug fixes** (v0.17.1): scoring.js weights now actually affect scoring (was a functional bug); i18n English locale fixed (4 Chinese strings); CLI help i18n-backed; OSS_PRO_BOUNDARY.md trust score classification corrected; README feature list updated with v0.16.0 security + v0.17.0 scoring.
- **Check output UX overhaul** (v0.18.0): `printTextResult()` completely rewritten â€?score bar + verdict at top, next actions prioritized, verdict-aware closing, collapsed details, cost awareness block.
- **Graduated scope enforcement** (v0.18.0): Configurable `scope.violationSeverity` (error/warning), `scope.violationBudget` for minor overflow, acknowledged-skips for scope, graduated threshold in all 6 presets.
- **OSS navigation features** (v0.18.1): Warning recovery guidance (9 new recovery templates), suppress/acknowledge hints on findings (`skipKey` field + CLI hint), Big Bang warning detector, scope expansion guidance in nextActions, unified verdict system.
- **README Configuration docs** (v0.18.0+): Added complete Configuration section to both README.md and README.zh-CN.md covering scope, consistency, correctness, scoring, and risk settings.
- **README cleanup** (v0.14.2â€?.14.3): removed internal strategy/engineering notes not intended for public users; added prerequisites section (must be a git repo); removed geographic restriction from target audience.
- The OSS baseline includes Bash write interception, loop protection, daemon dedup, circuit-breaker behavior, continuity/performance review surfacing, i18n-backed baseline detector messages, a lightweight reviewer-output suppression layer, and an optional lightweight built-in mutation-testing slice.
- Mutation testing is fully integrated into the OSS check pipeline with baseline-first execution, config-gated default-disabled behavior, and warning-only output.
- Pro go-live verdict surfacing is now wired into OSS `check` output when `@agent-guardrails/pro` is installed, including a first-layer CLI verdict and a top-level JSON field.
- Post-v0.19.3 update: check --json also exposes a top-level proofPlan when the installed Pro package provides one. OSS does not compute the plan; it only makes the optional Pro evidence plan machine-readable at the first layer.
- Post-v0.19.3 update: `agent-guardrails pro status` and `check --review` render installed Pro `proofMemory` summaries, including active missing proof, recently resolved proof, and top recurring proof-surface wording, while keeping the memory logic inside Pro.
- Post-v0.19.3 update: `check --review` also renders Pro-provided `proofPlan.cheapestNextProof.learnedEvidence` and the top `proofPlan.impactSurfaces` entry, so users can see the repo-specific proof recipe and why that proof surface was prioritized. OSS only renders optional Pro fields; it does not compute Pro proof logic.
- Post-v0.19.3 update: `agent-guardrails pro status` also renders Pro-provided proof recipe counts and top reusable proof recipes, giving users a status-level view of what the repo has learned from previous evidence.

## Strategic Direction Update (2026-04-07)

Deep analysis revealed three systemic problems and a product direction adjustment:

### Core insight: from "wall" to "navigator"

The current product design is **wall-style** (block/reject). Users consistently hit walls without constructive escape paths:
- Check output shows raw data with no actionable guidance
- Large changes always exceed scope â†?block â†?rollback â†?retry loop
- No context quality awareness â†?AI works without understanding project patterns

**Target**: agent-guardrails should be a **navigator** â€?guiding AI toward correct behavior, not just blocking incorrect behavior.

### Three problem areas (prioritized)

1. **Check output UX** (P0 â€?usability gate): After `check`, users don't know what to do. Fix: verdict interpretation, score bar, next actions at top, warning recovery guidance. All OSS (merge gate usability).

2. **Scope management for large changes** (P0 â€?practicality gate): AI always exceeds binary scope â†?block â†?rollback. Fix: configurable severity, graduated thresholds, acknowledged-skips for scope, Big Bang warning. OSS (basic flexibility) + Pro (intelligent decomposition).

3. **Context/memory quality** (P1 â€?Pro differentiator): AI loses context, doesn't learn patterns. Fix: context quality validation, intelligent context selection, pattern learning, cross-session consolidation. All Pro (memory quality assurance layer on top of Cursor/Aider/Claude Code indexing).

See `docs/OSS_PRO_BOUNDARY.md` for the full updated feature matrix.

## Next Steps

### Pro Private Repo â€?In Progress

Private repo: `https://github.com/logi-cmd/agent-guardrails-pro.git`
License provider: Lemon Squeezy (recommended, pending setup)

**OSS Pro interface layer â€?DONE:**

49. `lib/check/pro/index.js` â€?dynamic import stub for `@agent-guardrails/pro`, silent degradation, process-level cache
50. 3 hook points in `check.js` â€?`tryEnrichReview`, `getProNextActions`, `formatProCategoryBreakdown`
51. User upgrade path: `npm install @agent-guardrails/pro` â†?Pro activates automatically

**Pro modules (to implement in private repo):**

- `tier.js` â€?license key validation (Lemon Squeezy)
- `scoring.js` â€?per-category score breakdown (scope/validation/consistency/continuity/performance/risk)
- `recommendations.js` â€?auto maxChangedFiles, smart change decomposition
- `context-quality.js` â€?context freshness/completeness validation
- `index.js` â€?`enrichReview`, `getProNextActions`, `formatProCategoryBreakdown` (matches OSS stub contract)

### OSS Baseline â€?Complete (functional); Usability â€?Shipped

The intended OSS merge-gate baseline is complete for the current product boundary. Deep analysis identified UX gaps that make the gate impractical for real-world use. These are now planned:

**Already shipped:**

1. Hook: Bash file-write interception â€?**DONE**
2. Loop detection and daemon dedup â€?**DONE**
3. Failure recovery / circuit breaker â€?**DONE**
4. Context management cleanup â€?**DONE**
5. Lightweight reviewer-output suppression â€?**DONE**
6. `enforce` / `unenforce` round-trip coverage â€?**DONE**
7. Detector coverage for state-management, async-risk, and performance findings â€?**DONE**
8. Surface `continuity` / `performance` findings in review output â€?**DONE**
9. Replace detector-local hardcoded messages with `i18n` lookups â€?**DONE**
10. Config/task-contract validation â€?**DONE**
11. Version consistency checks across release-facing docs â€?**DONE**
12. Minimal static verification and cache-aware CI â€?**DONE**

**Shipped (check output UX â€?v0.18.0):**

28. Verdict interpretation â€?one-line explanation after verdict â€?**DONE** (v0.18.0)
29. Trust score bar in CLI output â€?`formatScoreBar()` now called â€?**DONE** (v0.18.0)
30. Next actions moved to top of output â€?**DONE** (v0.18.0)
31. Verdict-aware closing message â€?**DONE** (v0.18.0)

**Shipped (scope management â€?v0.18.0+v0.18.1):**

32. Recovery guidance for warnings â€?**DONE** (v0.18.1)
33. Suppress/acknowledge hint for findings â€?**DONE** (v0.18.1)
34. Configurable scope violation severity â€?**DONE** (v0.18.0)
35. acknowledged-skips extended to scope violations â€?**DONE** (v0.18.0)
36. Basic graduated scope thresholds â€?**DONE** (v0.18.0)
37. Big Bang warning with alternative guidance â€?**DONE** (v0.18.1)
38. "How to expand scope" in nextActions â€?**DONE** (v0.18.1)

**Pro candidates (deferred):**

39. Intelligent "next step" with file-level suggestions
40. Auto maxChangedFiles recommendation (repo-aware)
41. Smart change decomposition ("suggest splitting into batches")
42. Dependency-aware scope analysis
43. Progressive scope auto-expansion
44. Context quality validation
45. Intelligent context selection
46. Pattern learning
47. Cross-session context consolidation
48. Metacognitive self-verification

### Mutation Testing Integration â€?Complete

13. Wire mutation tester into OSS check pipeline â€?**DONE**
14. Baseline-first execution with warning on failure â€?**DONE**
15. Config-gated, default-disabled, warning-only output â€?**DONE**
16. Direct test coverage for mutation detector and i18n messages â€?**DONE**
17. Working-tree diff parsing fix for correct path extraction â€?**DONE**

### Robustness â€?Complete

18. Parent directory detection (subdirectory inside larger git repo) â€?**DONE** (v0.14.1)
19. base-ref fallback when remote branch not found â€?**DONE** (v0.14.4)
20. `createFinding` import error in check.js â€?**DONE** (v0.14.5)
21. README public-facing cleanup and prerequisites â€?**DONE** (v0.14.2â€?.14.3)
22. False config-or-migration warning for `.agent-guardrails/` files â€?**DONE** (v0.15.1)

### Presets â€?Complete

22. `static-frontend` preset (HTML/CSS/JS/Vue/Svelte, no test commands) â€?**DONE** (v0.15.0)
23. `generic` preset (universal fallback, no assumptions) â€?**DONE** (v0.15.0)
24. Default preset changed from `node-service` to `generic` â€?**DONE** (v0.15.0)

### Remaining Runtime Phases

25. ~~Gemini CLI hook path~~ â€?**DONE**
26. Codex hook path â€?**DEFERRED** (official support remains experimental / Bash-only / Windows-disabled)
27. `agent-guardrails doctor` OSS slice â€?**DONE**

## Honest capability boundary

| Pain point | OSS status | Pro target | Not claimed |
|------------|-----------|------------|-------------|
| Verification failure (AI code passes weak checks) | OSS merge gate bounds scope, requires explicit commands and evidence. Drift detection is basic/heuristic. | Pro adds deeper semantic analysis, full mutation integration (Stryker/mutmut), independent model review. | General correctness proof. |
| Self-verification bias (same agent generates and judges) | OSS separates generation from merge-gate enforcement. Optional lightweight mutation testing catches the most egregious vacuous tests when explicitly enabled. Does not add an independent reviewer. | Pro adds independent model review, structured context handoff, deeper mutation integration with automation. | Eliminating all bias. The generating agent still writes the tests. Mutation testing narrows the gap, it does not close it. |
| Route/plan mistakes (agent picks wrong approach) | OSS task contracts make intent explicit before code is written. `plan` constrains scope upfront. | Pro adds auto contract generation, repo pattern learning, smarter suggestions. | Guaranteeing the plan is strategically correct. |
| Long-context / session memory decay | OSS has no session continuity mechanism. Each task starts from the contract only. | Pro adds structured context handoff, session management, context compression. | Solving long-context degradation at the model layer. |
| Objective calipers (external tools the agent cannot influence) | OSS ships an optional lightweight built-in mutation-testing slice (basic mutations: boolean flips, operator swaps, literal replacements) when explicitly enabled with a runnable test command. Users can also wire in type-check, coverage, and external mutation-testing commands as required commands. | Pro adds automatic caliper configuration, full mutation testing integration (Stryker/mutmut, diff-scoped runs, survivor thresholds, historical tracking), independent review, runtime smoke tests. | Formal verification. Runtime smoke tests are a later phase. Mutation testing improves evidence that tests are non-vacuous; it does not prove correctness or comprehensive coverage. |
| Post-check guidance (user doesn't know what to do) | CLI output shows raw data without interpretation. MCP output is better but still lacks actionable specificity. | Pro adds intelligent file-level "what to do next" suggestions, automatic fix suggestions based on project patterns, history-aware remediation. | Replacing human judgment. |
| Large change scope enforcement (block â†?rollback loop) | All scope violations are hard errors. No graduated thresholds or constructive escape paths. | Pro adds smart change decomposition, dependency-aware scope analysis, progressive auto-expansion. | Eliminating all scope violations. |
| AI context quality (agent works without project awareness) | Task contracts provide structured working context. AGENTS.md provides persistent project context. No awareness of context freshness or completeness. | Pro adds context quality validation, intelligent context selection, pattern learning, cross-session consolidation. | Building its own codebase indexer (Cursor/Aider territory). Pro sits above existing tools as a quality assurance layer. |

## Known gaps

- **Codex native hook path**: deferred until official support is stable beyond experimental Bash-only interception.
- **Check output UX (v0.18.0+)**: CLI output completely restructured with score bar, verdict interpretation, next actions at top, verdict-aware closing, and cost awareness. Warning recovery guidance and suppress hints added in v0.18.1.
- **Scope enforcement (v0.18.0+v0.18.1)**: Configurable severity, graduated thresholds, acknowledged-skips, Big Bang warning, and scope expansion guidance. All OSS scope features complete.
- **Verdict system unified (v0.18.1)**: `result.verdict` now uses `scoreVerdict` values when the generic default would apply. Two verdict sources still exist but produce consistent results.
- **Evaluation design**: Upgraded from binary pass/fail to composite scoring with configurable weights and graduated verdicts. Score is informational; errors still cause exit code 1. Weights now actually affect scoring (v0.17.1 fix).
- **Trust calipers**: partially shipped. An optional lightweight built-in mutation-testing slice (Caliper 3) is now shipped in OSS. Type-check and coverage gates remain trivial preset edits (not yet done). Full mutation integration, independent review, context handoff, and runtime smoke tests are still proposal-stage.
- **Mutation testing in OSS**: the built-in tester applies basic mutations (boolean flips, operator swaps, literal replacements) to detect the most egregious cases of vacuous tests. It is config-gated, requires an explicit runnable `testCommand`, and skips to a warning if the baseline command fails. It improves evidence that tests are non-vacuous. It does not prove correctness or comprehensive coverage, and does not replace stronger tools like Stryker or mutmut.
- **Drift detection**: basic and heuristic. OSS catches obvious pattern/interface/boundary drift through filename and token matching. Full AST-based analysis and LSP-backed semantic detection belong to Pro. Lightweight static import analysis (regex-based, zero-dependency) can be shipped in Pro Local as a bridge between heuristic and full LSP.
- **LSP integration direction**: LSP can significantly improve interface change detection, dependency impact analysis, and semantic drift detection. However, LSP server cold-start (2-10s) and per-language server requirements make it unsuitable for OSS CLI single-execution model. LSP-backed analysis is planned for Pro Cloud (persistent language servers) with Pro Local using lighter alternatives (static import graphs, AST-grep, tree-sitter).
- **Context/memory quality**: OSS provides structured working context (task contracts, evidence, AGENTS.md). No awareness of context freshness, completeness, or project patterns. Pro will add context quality validation, pattern learning, and cross-session consolidation as a memory quality assurance layer above existing tools (Cursor, Aider, Claude Code).
- **Commercial packaging**: Pro interface layer is now embedded in OSS. Private repo `agent-guardrails-pro` under active development. License provider selected: Lemon Squeezy. Three Pro differentiators: (1) intelligent guidance (not just blocking), (2) scope intelligence (not just enforcement), (3) context quality assurance (not just contracts).
- **Semantic detection strategy**: Three-tier approach. (1) OSS: filename/token heuristics (current). (2) Pro Local: static import graph + AST-grep for structured pattern matching (zero-dependency, no LSP server needed). (3) Pro Cloud: full LSP-backed analysis with persistent language servers for interface changes, dependency impact, and semantic drift.


## 2026-04-12 OSS status addendum

- OSS now exposes `agent-guardrails pro status` and `agent-guardrails pro-status` to show Pro install state, license state, and the demo go-live decision.
- `check` still surfaces the Pro go-live verdict at the top level when `@agent-guardrails/pro` is installed.
- Verified with `npm test` and `npm pack --dry-run`; no internal docs were added to the published package.
- Next step: keep OSS docs synchronized with any future command or output changes, and avoid touching `docs/SEMANTIC_ARCHITECTURE.md` unless explicitly requested.
- 2026-04-12 follow-up: OSS `agent-guardrails pro status` now renders richer Pro metadata when available: readiness, activation checklist, capability value, and buyer-facing value moments. Pro `buildProStatus()` is the source of truth for those fields.

## Status addendum - 2026-04-12

- OSS `agent-guardrails pro status` now renders Pro-provided `activationFlow.nextAction` and `primaryCommand` when available, giving users one concrete next command after install, license, and readiness checks.
- This is a post-v0.19.2 draft change and should be released as the next patch version if published to npm/GitHub.

## Release addendum - 2026-04-12 v0.19.3

- OSS v0.19.3 is published and covers the Pro status next-action guidance shipped after v0.19.2.
- GitHub tag/release v0.19.3 and npm latest 0.19.3 are confirmed under the logi-cmd account.
