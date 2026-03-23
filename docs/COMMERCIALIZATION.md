# Commercialization

Last updated: 2026-03-22

## Product boundary

`agent-guardrails` should commercialize from a position of trust:

- the open-source core remains independently useful
- paid tiers extend semantic depth, collaboration, and review speed
- paid tiers do not lock away baseline safety checks

This project should not weaken the open-source baseline in order to force upgrades.

The paid story should not be "basic checks finally work."

The strongest paid value should be:

- higher-signal semantic analysis
- lower manual workflow overhead
- stronger maintenance continuity
- deeper repo-aware judgment that is hard to reproduce with prompt text alone

The product moat should not be described as "we have better prompts."

The moat should be described as:

- stateful contracts
- repo-aware runtime behavior
- semantic detector quality
- continuity and review memory
- deeper workflow integration across Skill, MCP, and agent-native flows

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
- basic integration surfaces for agent-native adoption
- a baseline skill workflow
- a baseline MCP service layer

If the feature is required for a repo to use `agent-guardrails` as a real merge gate, it belongs in OSS.

That means OSS should continue to own:

- baseline runtime-backed workflow
- baseline automation surfaces
- baseline reviewer output
- baseline risk dimensions for security, dependency, performance, understanding, and continuity

## Pro Local

`Pro Local` is the first paid layer.

It should sell higher-signal semantic analysis, not basic usability:

- TypeScript or JavaScript semantic pack
- Python semantic pack
- auto task generation
- smarter contract suggestion
- public interface diff
- module boundary and dependency direction checks
- source-to-test impact analysis
- pattern drift and duplicate abstraction detection
- production profile assistants
- richer local IDE review surface
- maintenance continuity insights
- local agent-native orchestration
- BYO model key

The first semantic pack in `plugins/plugin-ts/` is public in this repository as an early semantic milestone. That does not change the product boundary:

- OSS still owns the merge-gate baseline and public benchmark visibility
- Pro Local owns deeper semantic detection quality over time
- the current local package is an early public milestone, not a replacement for the OSS merge gate

Today that public proof layer includes:

- pattern drift detection
- interface drift detection
- boundary violation detection
- source-to-test relevance detection

Those semantic examples are visible so users can evaluate product value honestly, even though the long-term Pro Local boundary still centers on deeper semantic quality and higher signal.

The strongest paid promise for Pro Local should be:

- less manual setup
- lower review effort
- lower maintenance drift over time
- stronger repo-specific memory and reuse guidance

Suggested starting price range:

- `$12-$15/month`
- or `$99-$129/year`

## Pro Cloud

`Pro Cloud` should sell collaboration and centralization:

- hosted PR review
- historical trend reports
- shared policies and rule-pack sync
- centralized benchmark dashboards
- org-wide workflow orchestration
- centralized MCP or automation services
- included compute

Suggested starting price range:

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
- lower manual workflow overhead
- stronger maintenance continuity
- stronger team and org workflows
