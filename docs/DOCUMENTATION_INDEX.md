# Documentation Index

Last updated: 2026-04-09
Status: Canonical

## Purpose

This file defines the documentation system for building `agent-guardrails`.

From this point onward, the docs are split into two layers:

### 1. Canonical build docs

These are the source of truth for product design, architecture, scope, sequencing, and acceptance.
If two docs disagree, the canonical build docs win.

### 2. Reference docs

These exist to support positioning, marketing, research, proof, or historical context.
They are useful, but they are not the final implementation contract.

## Canonical build docs

Read these in order when building the product:

1. [PRODUCT_BLUEPRINT.md](D:/opencode/agent-guardrails/docs/PRODUCT_BLUEPRINT.md)
   The product definition, user jobs, boundaries, UX model, OSS vs Pro split, and success criteria.

2. [TECHNICAL_SPEC.md](D:/opencode/agent-guardrails/docs/TECHNICAL_SPEC.md)
   The end-to-end system architecture, runtime model, plugin model, data model, and execution flow.

3. [PRO_LOCAL_SPEC.md](D:/opencode/agent-guardrails/docs/PRO_LOCAL_SPEC.md)
   The paid product spec, including deep feature requirements, heuristics, outputs, and non-goals.

4. [IMPLEMENTATION_PLAN.md](D:/opencode/agent-guardrails/docs/IMPLEMENTATION_PLAN.md)
   The phased build sequence, dependencies, milestones, and deliverables.

5. [ACCEPTANCE_CRITERIA.md](D:/opencode/agent-guardrails/docs/ACCEPTANCE_CRITERIA.md)
   The release gates, feature acceptance tests, and definition of done for OSS and Pro Local.

6. [RELEASE_PROCESS.md](D:/opencode/agent-guardrails/docs/RELEASE_PROCESS.md)
   The canonical OSS release and publish process, including GitHub/npm identity, packaging hygiene, release notes, and required doc updates.

## Strategy docs

These remain important and should stay aligned with the canonical build docs:

- [PRODUCT_STRATEGY.md](D:/opencode/agent-guardrails/docs/PRODUCT_STRATEGY.md)
- [COMMERCIALIZATION.md](D:/opencode/agent-guardrails/docs/COMMERCIALIZATION.md)
- [ROADMAP.md](D:/opencode/agent-guardrails/docs/ROADMAP.md)
- [PROJECT_STATE.md](D:/opencode/agent-guardrails/docs/PROJECT_STATE.md)
- [OSS_PRO_BOUNDARY.md](D:/opencode/agent-guardrails/docs/OSS_PRO_BOUNDARY.md)

## Reference docs

These docs support go-to-market, messaging, research, or historical decision-making:

- [MARKET_RESEARCH.md](D:/opencode/agent-guardrails/docs/MARKET_RESEARCH.md)
- [FAQ_WHY_BUY.md](D:/opencode/agent-guardrails/docs/FAQ_WHY_BUY.md)
- [DIY_VS_AGENT_GUARDRAILS.md](D:/opencode/agent-guardrails/docs/DIY_VS_AGENT_GUARDRAILS.md)
- [PRICING_COPY.md](D:/opencode/agent-guardrails/docs/PRICING_COPY.md)
- [LANDING_PAGE_COPY.md](D:/opencode/agent-guardrails/docs/LANDING_PAGE_COPY.md)
- [PROOF.md](D:/opencode/agent-guardrails/docs/PROOF.md)
- [BENCHMARKS.md](D:/opencode/agent-guardrails/docs/BENCHMARKS.md)
- [USER_GUIDE.md](D:/opencode/agent-guardrails/docs/USER_GUIDE.md)
- [WORKFLOWS.md](D:/opencode/agent-guardrails/docs/WORKFLOWS.md)
- [ROUGH_INTENT.md](D:/opencode/agent-guardrails/docs/ROUGH_INTENT.md)
- [SEMANTIC_ARCHITECTURE.md](D:/opencode/agent-guardrails/docs/SEMANTIC_ARCHITECTURE.md)
- [RUNTIME_PIVOT_PLAN.md](D:/opencode/agent-guardrails/docs/RUNTIME_PIVOT_PLAN.md)

## How to use this set

### If you are building the product

Use only the canonical build docs for implementation decisions.

### If you are writing README, pricing, landing copy, or investor material

Use the strategy docs plus the reference docs.

### If you find a contradiction

Resolve in this order:

1. Acceptance criteria
2. Technical spec
3. Product blueprint
4. Implementation plan
5. Strategy docs
6. Reference docs

## Documentation rules

- Canonical docs must stay implementation-ready.
- Features should appear in canonical docs before implementation starts.
- A feature is not "done" until it satisfies [ACCEPTANCE_CRITERIA.md](D:/opencode/agent-guardrails/docs/ACCEPTANCE_CRITERIA.md).
- Strategy docs should describe the same product boundary as canonical docs.
- Reference docs may simplify or omit details, but may not contradict canonical docs.
