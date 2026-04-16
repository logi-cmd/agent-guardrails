# Semantic Architecture

Last updated: 2026-04-16

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
- runtime service layer
- MCP server layer
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

## Semantic detection tiers

The project uses a three-tier approach to semantic analysis. This section describes the architecture direction and capability boundary; it should not be read as a claim that every tier is already shipped in OSS.

### Tier 1: Heuristic (OSS - current)

Filename and token matching. This is the current OSS baseline. It catches obvious pattern, interface, and boundary drift with zero extra runtime dependencies and no language server.

```
detectPatternDrift(files) {
  // filename regex: /helper|service|controller/.test(baseName)
  // token matching: extract identifiers, compare overlap
}
```

### Tier 2: Structured (Pro Local - planned)

Static import graph plus AST-grep for structured pattern matching. This is planned for Pro Local as a bridge between heuristic OSS checks and full LSP-backed analysis. No LSP server is required, which keeps it compatible with single CLI executions.

**Static import graph** (JS/TS, zero-dependency):
```
// Regex extraction of import/require statements
// Builds a module dependency graph
// Enables: "file A changed, files B/C/D import from A"
// Enables: boundary violation detection (forbidden cross-module imports)
// Enables: smart change decomposition (group by dependency clusters)
```

**AST-grep** (optional, for deeper analysis):
```
// Structured code pattern matching
// Detects: export signature changes (params, return types)
// Detects: parallel abstractions (similar method signatures in separate files)
// Detects: deprecated API usage patterns
// Requires: tree-sitter grammar per language (bundled, no server needed)
```

### Tier 3: LSP-backed (Pro Cloud - future)

Full semantic analysis with persistent language servers. This is future Pro Cloud direction, not a current OSS or Pro Local capability.

**LSP capabilities used:**

| LSP Method | Purpose | Pro Feature |
|-----------|---------|-------------|
| `textDocument/documentSymbol` | Export signature extraction | Interface change detection |
| `textDocument/references` | Call site enumeration | Dependency impact analysis |
| `textDocument/diagnostics` | Type errors, lint warnings | Real-time error surfacing in check |
| `textDocument/definition` | Symbol origin tracking | Cross-file pattern tracing |

**Why LSP is Pro Cloud only:**
- Cold-start: TypeScript language server takes 5-30s for large projects. Unsuitable for CLI single-execution.
- Per-language: each language needs its own server (TS, Python, Go, Rust, etc.).
- Environment: requires project dependencies installed (`node_modules`, `venv`, etc.).
- Pro Cloud manages persistent servers centrally, amortizing startup cost across all check runs.

**Architecture sketch (Pro Cloud future):**
```
user check request -> Pro Cloud API
  -> warm LSP pool (per-language servers kept alive)
  -> send LSP requests (documentSymbol, references, diagnostics)
  -> merge LSP results with OSS check results
  -> return enriched check response
```

For the product-boundary matrix and release-status wording, see `docs/OSS_PRO_BOUNDARY.md` and `docs/PROJECT_STATE.md`.

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
