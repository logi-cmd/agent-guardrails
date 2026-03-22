# Commercialization

Last updated: 2026-03-22

## Product boundary

`agent-guardrails` should commercialize from a position of trust:

- the open-source core remains independently useful
- paid tiers extend semantic depth, collaboration, and review speed
- paid tiers do not lock away baseline safety checks

This project should not use open-core bait-and-switch tactics.

## OSS Core

The open-source core stays free and production-relevant:

- `init / plan / check`
- repo-local policy and task contracts
- `check --review`
- `check --json`
- `en + zh-CN` CLI, docs, and templates
- adapters for Codex, Claude Code, Cursor, OpenHands, and OpenClaw
- baseline scope, validation, protected-path, and review checks
- presets, demos, benchmark harness, and OSS benchmark scenarios
- cross-platform CI baseline

If the feature is required for a repo to use `agent-guardrails` as a real merge gate, it belongs in OSS.

## Pro Local

`Pro Local` is the first paid layer.

It should sell higher-signal semantic analysis, not basic usability:

- TypeScript or JavaScript semantic pack
- Python semantic pack
- public interface diff
- module boundary and dependency direction checks
- source-to-test impact analysis
- pattern drift and duplicate abstraction detection
- production profile assistants
- richer local IDE review surface
- BYO model key

The first repo-contained semantic pack in `plugins/plugin-ts/` is public as a development milestone and proof point. That does not change the product boundary:

- OSS still owns the merge-gate baseline and public benchmark visibility
- Pro Local owns deeper semantic detection quality over time
- the current local package is a transparent bridge toward that boundary, not a bait-and-switch

Today that public proof layer includes:

- pattern drift detection
- interface drift detection
- boundary violation detection
- source-to-test relevance detection

Those proof points are visible so users can evaluate product value honestly, even though the long-term Pro Local boundary still centers on deeper semantic quality and higher signal.

Suggested price hypothesis:

- `$12-$15/month`
- or `$99-$129/year`

## Pro Cloud

`Pro Cloud` should sell collaboration and centralization:

- hosted PR review
- historical trend reports
- shared policies and rule-pack sync
- centralized benchmark dashboards
- included compute

Suggested price hypothesis:

- `$24-$29/month per developer`

## Guardrails

Do not move these into paid tiers:

- repo-local task contracts
- `check --json`
- CI integration
- baseline scope and validation gating
- cross-agent adapters
- benchmark visibility

Paid tiers may only add:

- deeper semantic checks
- higher-confidence reviewer summaries
- lower manual triage cost
- stronger team and org workflows
