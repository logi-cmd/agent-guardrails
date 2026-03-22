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

## Phase 3 (Next)

Once the default workflow is stable, the project can move into deeper enforcement.

- Python semantic pack
- protected-area semantic escalation
- higher-confidence review summary
- stronger policy composition
- external benchmark repos and before/after comparisons
- optional framework-aware detectors where generic heuristics are not enough

## Proof of value

This project should continue proving value through:

- smaller AI-generated change sets
- fewer behavior changes without tests
- fewer repo-inconsistent abstractions
- faster onboarding through templates, adapter guidance, and end-to-end demos
