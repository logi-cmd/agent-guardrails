# Roadmap

## Phase 1 (Shipped)

The current public release already includes the core scaffold:

- stable `init`, `plan`, and `check`
- task contracts for scope, intended files, change types, required commands, evidence files, and risk metadata
- presets for common repo shapes
- first-pass adapters for Codex, Claude Code, Cursor, OpenHands, and OpenClaw
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

## Phase 4 (Next)

With passive understanding layer shipped, the focus shifts to broader proof and deeper language support.

- clearer current language-support packaging in the docs and proof surface
- Python as the next deeper ecosystem
- ship a Python/FastAPI baseline proof slice before semantic-depth claims
- a single proof asset for "what this catches that normal AI coding workflows miss"
- early distribution through one proof page plus one sandbox-first trial path
- expand diagnostic detector coverage beyond the initial three
- refine code archaeology with module-level pattern learning

## Phase 5 (Later)

With broader proof established, add production-readiness and post-deploy maintenance surface.

- deploy-readiness verdicts
- release and deploy checklist visibility
- rollback and recovery guidance in production-shaped outputs
- post-deploy maintenance summaries with operator next actions

## Phase 6 (Later)

Only after the runtime can judge production-readiness clearly should the project add real deployment orchestration.

- script / CI deployment orchestration
- provider adapter interface
- first provider reference implementation
- post-deploy verification hooks
- rollback / redeploy orchestration

## Phase 7 (Later)

After entry, trust, recovery, language support, proof, and deployment layering are clearer, move into deeper enforcement and team-scale layers.

- Python semantic pack
- protected-area semantic escalation
- higher-confidence review summary
- stronger policy composition
- external benchmark repos and before/after comparisons
- optional framework-aware detectors where generic heuristics are not enough
- module history and repo-learned continuity
- shared policies, approvals, audit trails, and ROI instrumentation

## Proof of value

This project should continue proving value through:

- smaller AI-generated change sets
- fewer behavior changes without tests
- fewer repo-inconsistent abstractions
- faster onboarding through templates, adapter guidance, and end-to-end demos
