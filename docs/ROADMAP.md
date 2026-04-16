# Roadmap

## Canonical planning note

For execution, the canonical build docs are:

- `docs/DOCUMENTATION_INDEX.md`
- `docs/PRODUCT_BLUEPRINT.md`
- `docs/TECHNICAL_SPEC.md`
- `docs/PRO_LOCAL_SPEC.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/ACCEPTANCE_CRITERIA.md`
- `docs/RELEASE_PROCESS.md`

This roadmap is directional. If roadmap wording conflicts with the canonical build docs, the canonical build docs win.

## Phase 1 (Shipped)

The current public release already includes the core scaffold:

- stable `init`, `plan`, and `check`
- task contracts for scope, intended files, change types, required commands, evidence files, and risk metadata
- presets for common repo shapes
- first-pass adapters for Claude Code, Cursor, OpenCode, Codex, and Gemini CLI
- a bounded-scope demo and install smoke validation
- GitHub Actions templates for initialized repos
- review-oriented `check --review` output built from the same guardrail findings as local and CI checks

## Phase 2 (Shipped)

The open-source baseline now has clearer layering and first semantic proof points.

- detector pipeline foundation under `check`
- benchmark harness with executable OSS scenarios
- semantic proof points for pattern drift, interface drift, boundary violation, and source-to-test relevance
- clearer OSS versus Pro Local versus Pro Cloud boundaries
- optional stricter repo policies for protected areas and module boundaries
- a source-repo self-pilot written up in public docs

## Phase 3 (Shipped)

The next sequence is about lowering cognitive load before adding more detector breadth.

- bilingual README first screen with one obvious setup-first happy path
- sharper category contrast so users understand this is for real repos, not one-off prototypes
- setup output compression into "already done / do this now / say this / you will get"
- rough-intent mode so users can start from a vague request
- short trust verdict above the reviewer summary
- recovery guidance, secrets-safe guidance, and cost-awareness hints
- **被动理解层 (Passive Understanding Layer)** - automatic change explanations without forced review
- **诊断检测器 (Diagnostic Detectors)** - state-mgmt-complexity, async-logic-risk, performance-degradation
- new MCP tools: `explain_change`, `query_archaeology`
- new API endpoints: `POST /api/explain`, `POST /api/archaeology`
- precision prompts as yes/no questions during agent loop completion

## Phase 4 (Shipped — v0.5.0)

Smart layer goes live with real diff analysis, persistent archaeology, and repo structure awareness.

- real git diff analysis engine for `explain_change`
- persistent archaeology store across sessions (`query_archaeology`)
- repo structure analysis with framework detection (Next.js/Express/FastAPI/Django)
- 3 new task types: deploy/security/database + compound keyword matching
- MCP structured output for `explain_change` and `query_archaeology`
- 5-agent support with templates and daemon hooks

## Phase 5 (Complete — OSS v0.19.0)

OSS merge gate is production-ready. Pro development has started in a private repo.

### OSS (shipped)

- clearer current language-support packaging in the docs and proof surface
- Python as the next deeper ecosystem — ship a Python/FastAPI baseline proof slice before semantic-depth claims
- a single proof asset for "what this catches that normal AI coding workflows miss"
- early distribution through one proof page plus one sandbox-first trial path
- refine code archaeology with module-level pattern learning
- deploy-readiness verdicts
- release and deploy checklist visibility
- rollback and recovery guidance in production-shaped outputs
- post-deploy maintenance summaries with operator next actions
- homepage / proof / pricing packaging for overseas solo developers and small teams
- clearer upgrade path from OSS trust layer to Pro Local efficiency layer
- mutation testing fully integrated into OSS check pipeline with baseline-first, config-gated, warning-only behavior
- working-tree diff parsing fixed for correct path extraction in reviewer output
- direct module test coverage for mutation detector, i18n messages, and `listChangedFiles()`
- reviewer warning reduction — eliminated public surface drift, reduced async-risk warnings, tightened surface declarations
- quality audit (v0.19.0): security hardening, code deduplication, i18n cleanup, test coverage
- **Pro interface layer (v0.19.0)**: `lib/check/pro/index.js` with 3 dynamic-import hooks (`tryEnrichReview`, `getProNextActions`, `formatProCategoryBreakdown`). Silent degradation when `@agent-guardrails/pro` is not installed. 18 test suites all passing.
- rough-intent mode so users can start from a vague request
- short trust verdict above the reviewer summary
- recovery guidance, secrets-safe guidance, and cost-awareness hints
- **被动理解层 (Passive Understanding Layer)** — automatic change explanations without forced review
- **诊断检测器 (Diagnostic Detectors)** — state-mgmt-complexity, async-logic-risk, performance-degradation
- first-pass adapters for Claude Code, Cursor, OpenCode, Codex, and Gemini CLI

### Pro (in private repo `agent-guardrails-pro`)

- Paddle hosted billing with local entitlement/cache validation
- per-category score breakdown
- auto maxChangedFiles recommendation (repo-aware)
- smart change decomposition
- context quality validation
- intelligent next-action suggestions

## Phase 6 (Pro — Active Development)

Pro Local development is active in the private repo `agent-guardrails-pro`.

- product rule: go deeper before going wider; every Pro feature must remove real workflow pain, not add cosmetic analysis
- rough-intent to smallest-safe contract generation with multiple task-shape suggestions
- Paddle billing plus `agent-guardrails-entitlement` license activation with local cache
- per-category trust score breakdown (scope, validation, consistency, continuity, performance, risk)
- repo-aware file budget recommendation based on project structure and task shape
- smart change decomposition with concrete batch boundaries and spillover detection
- context quality validation with missing-input detection before coding starts
- intelligent next-action suggestions with file-level detail and merge/deploy guidance
- lightweight local repo memory for repeated pattern and repair guidance
- production-shaped change detection plus verify / rollback handoff
- private npm package `@agent-guardrails/pro` with transparent OSS upgrade path

## Phase 7 (Later — Pro Cloud)

After Pro Local is stable and gaining users, extend to team-scale features.

- Python semantic pack
- protected-area semantic escalation
- higher-confidence review summary
- stronger policy composition
- external benchmark repos and before/after comparisons
- optional framework-aware detectors where generic heuristics are not enough
- module history and repo-learned continuity
- shared policies, approvals, audit trails, and ROI instrumentation
- script / CI deployment orchestration
- provider adapter interface
- first provider reference implementation
- post-deploy verification hooks
- rollback / redeploy orchestration
- **static import graph analysis** (zero-dependency, regex-based dependency extraction for JS/TS)
- **AST-grep / tree-sitter pattern matching** for structured code analysis without LSP server dependency
- **LSP-backed semantic detection** (persistent language servers for interface change detection, dependency impact analysis, semantic drift)

## Phase 8 (Future — LSP Integration)

Full LSP integration requires persistent language servers, making it a Pro Cloud feature.

- persistent language server management (TypeScript, Python, Go, Rust)
- LSP `findReferences` for precise dependency impact analysis
- LSP `documentSymbols` for export signature change detection
- LSP `diagnostics` for real-time type error surfacing in check results
- call-graph-aware change decomposition (group mutually dependent files into batches)
- semantic drift detection via AST comparison across files
- cross-language support via language-specific LSP adapters
- incremental analysis (only re-analyze changed files and their dependents)

## Proof of value

This project should continue proving value through:

- smaller AI-generated change sets
- fewer behavior changes without tests
- fewer repo-inconsistent abstractions
- faster onboarding through templates, adapter guidance, and end-to-end demos
- faster trust decisions from vague intent to merge-ready proof
- fewer oversized AI sessions that require manual cleanup
- fewer merge-safe but deploy-risky changes
