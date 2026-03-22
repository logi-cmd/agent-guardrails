# Semantic Architecture

Last updated: 2026-03-22

## Current structure

The public command surface stays:

- `init`
- `plan`
- `check`

The internals are moving toward this layered model:

- contract loader
- repo policy loader
- detector pipeline
- finding model
- review formatter
- locale layer
- benchmark runner core

## Detector pipeline

`check` now builds a context object and runs detectors through a common pipeline.

The default detector set is the OSS baseline:

- scope checks
- breadth checks
- required commands
- evidence
- protected paths
- generic config and migration warnings
- baseline reviewer summary

## Plugin interface

Semantic analyzers should load as optional plugins.

Design rules:

- missing plugins never break `check`
- the CLI falls back to the OSS baseline automatically
- findings from plugins use the same result schema as OSS findings
- `check --json` remains stable even when plugin metadata is present

Planned first plugins:

- `@agent-guardrails/plugin-ts`
- `@agent-guardrails/plugin-python`

The first milestone now ships a repo-contained local package at `plugins/plugin-ts/`.

Current behavior:

- `check` first tries to load a referenced plugin as a normal package
- when the source repo is the `agent-guardrails` repo itself, development and CI can fall back to `plugins/plugin-ts/`
- missing plugins still degrade cleanly to the OSS baseline
- plugin metadata is additive in `check --json` and does not change the core result shape

The first shipped semantic detector is intentionally narrow:

- TypeScript or JavaScript pattern-drift detection for parallel abstractions such as `refund-service.ts` plus `refund-helper.ts`
- warning severity by default
- proof-of-value via the benchmark suite and `examples/pattern-drift-demo`

The second shipped detector stays heuristic and contract-driven:

- TypeScript or JavaScript interface drift detection for obvious export forms
- hybrid severity:
  - `error` for undeclared public-surface changes inside `implementation-only` tasks
  - `warning` for undocumented public-surface changes outside that strict mode
- proof-of-value via the benchmark suite and `examples/interface-drift-demo`

The third shipped detector keeps repo policy explicit instead of inferring architecture magically:

- TypeScript or JavaScript boundary violation detection for import paths that cross declared forbidden scopes
- config-driven severity:
  - `error` for clear forbidden imports
  - `warning` only when a repo policy marks the rule as suggestive
- proof-of-value via the benchmark suite and `examples/boundary-violation-demo`

The fourth shipped detector focuses on validation quality instead of raw test-file presence:

- TypeScript or JavaScript source-to-test relevance detection using filename, symbol, and nearby path heuristics
- severity:
  - `warning` when changed tests look weakly related to the changed source surface
  - `error` when the task contract declares expected test targets and the changed tests clearly miss them
- proof-of-value via the benchmark suite and `examples/source-test-relevance-demo`

## Why this matters

This separation protects both product quality and commercialization:

- OSS stays independently useful
- semantic packs can evolve without destabilizing the baseline
- future paid layers extend detector quality instead of replacing the merge gate
