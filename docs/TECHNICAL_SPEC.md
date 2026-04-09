# Technical Spec

Last updated: 2026-04-09
Status: Canonical

## Objective

This document defines the full implementation architecture for `agent-guardrails` OSS and the extension points used by Pro Local.

## System model

The product is a single runtime judgment engine exposed through multiple interfaces:

- CLI
- MCP
- agent hooks / plugins
- pre-commit and CI

All interfaces must call the same core engine.

## Architecture layers

### 1. Input layer

Responsible for gathering:

- repo root
- git diff
- task contract
- config and preset
- changed files
- executed validations
- evidence files
- agent session metadata

### 2. Policy layer

Responsible for:

- loading `.agent-guardrails/config.json`
- loading task contracts
- resolving presets
- normalizing paths, scopes, and rule severity

### 3. Analysis layer

Responsible for:

- scope checks
- validation checks
- continuity checks
- semantic analysis
- production-sensitivity analysis
- Pro enrichment when available

### 4. Decision layer

Responsible for:

- verdict generation
- category score calculation
- residual-risk summary
- next-action planning
- merge/deploy readiness output

### 5. Interface layer

Responsible for:

- CLI presentation
- JSON output
- MCP output
- hook/plugin responses
- CI-friendly exit behavior

## Core modules

The implementation should converge on these stable modules:

### `contract`

Owns:

- contract creation
- contract parsing and validation
- rough-intent expansion hooks
- intended file and scope interpretation

### `policy`

Owns:

- config load
- preset resolution
- rule normalization
- risk policy resolution

### `repo`

Owns:

- repo root discovery
- changed file detection
- top-level structure analysis
- language/framework detection
- git diff parsing

### `analysis`

Owns:

- detector pipeline
- context quality checks
- semantic plugins
- production-shape classifier
- dependency-aware decomposition

### `decision`

Owns:

- verdict
- score
- category breakdown
- next actions
- deploy handoff

### `interfaces`

Owns:

- CLI
- MCP
- hook/plugin adapters
- JSON contract

## Runtime flow

### Flow A: planning / task shaping

1. Accept rough intent or explicit task
2. Load repo context and policy
3. Suggest smallest-safe task shapes
4. Build or refine task contract
5. Persist contract

### Flow B: implementation-time control

1. Intercept file-write or edit events when supported
2. Read current contract and policy
3. Check whether target file is in safe scope
4. Run lightweight incremental analysis
5. Return allow, warn, or block response
6. Persist continuity signals

### Flow C: merge decision

1. Collect diff, executed commands, evidence, and context
2. Run full check pipeline
3. Run Pro enrichment when installed
4. Generate verdict, residual risk, and next actions
5. Emit text, JSON, or MCP response

### Flow D: deploy handoff

1. Detect whether the change is production-shaped
2. Escalate proof requirements when necessary
3. Generate verify and rollback guidance
4. Persist continuity notes for the next session

## Canonical output model

All interfaces should share this result shape conceptually:

```json
{
  "verdict": "safe-to-deploy",
  "score": 87,
  "scoreVerdict": "pass-with-concerns",
  "summary": {},
  "findings": [],
  "nextActions": [],
  "deployReadiness": {},
  "contextQuality": {},
  "categoryScores": {},
  "pro": {
    "enabled": true
  }
}
```

The exact shape may remain backward-compatible, but all new capabilities must fit this model rather than inventing parallel structures.

## Data model

### Config

Primary file:

- `.agent-guardrails/config.json`

Must contain:

- checks
- scoring
- risk configuration
- preset metadata
- optional Pro license config

### Contract

Primary storage:

- `.agent-guardrails/contracts/<session-or-task>.json`

Must contain:

- task description
- session id or task id
- allowed paths
- intended files
- change types
- required commands
- evidence paths
- risk metadata
- production sensitivity hint

### Evidence

Primary storage:

- `.agent-guardrails/evidence/`

Must support:

- human notes
- generated evidence manifests
- validation command records

### Repo memory

Primary storage for Pro Local:

- `.agent-guardrails/repo-memory.json`

Must contain:

- preferred abstractions
- rejected patterns
- repair history
- repeated finding patterns
- reviewer preferences

## Detector classes

### OSS detectors

- scope
- intended-file drift
- allowed-path violations
- validation command checks
- evidence checks
- breadth and file-budget heuristics
- protected-area and config/migration warnings
- baseline continuity and risk warnings

### Pro Local detectors

- context quality
- deeper scope intelligence
- decomposition planner
- repo-memory continuity checks
- stronger semantic detectors
- production-shape classifier
- merge-to-deploy handoff planner

## Semantic tiers

### Tier 1: OSS heuristic

Use:

- filename heuristics
- token overlap
- diff-shape heuristics

Properties:

- fast
- dependency-free
- low false-positive tolerance

### Tier 2: Pro Local structured

Use:

- static import graphs
- AST-grep or tree-sitter
- repo memory

Properties:

- higher precision
- still local
- no LSP server required

### Tier 3: Pro Cloud LSP-backed

Use:

- persistent language servers
- references
- diagnostics
- symbol graphs

Properties:

- highest precision
- infrastructure-heavy
- not required for first commercial release

## Hook and plugin architecture

### Rule

Hooks and plugins are transport layers, not analysis engines.

They should:

- collect event data
- call the core runtime
- return allow/warn/block responses

They should not embed separate business logic.

### Required hook capabilities

#### Pre-write interception

Needed for:

- scope blocking
- early spillover detection
- blocking dangerous writes when possible

#### Post-write enrichment

Needed for:

- incremental review signals
- continuity updates
- semantic re-check

#### Session-end check

Needed for:

- final summary
- merge/deploy handoff
- memory persistence

## Pro integration contract

OSS should integrate Pro through a stable extension boundary:

- attempt dynamic load
- degrade silently if missing
- preserve result schema stability
- allow additive enrichment only

Required Pro hooks:

- `enrichReview`
- `getProNextActions`
- `formatProCategoryBreakdown`

Future hooks may be added only if backward-compatible.

## Performance requirements

### OSS

- normal local check should feel fast enough for daily use
- incremental checks should avoid unnecessary full-repo work
- missing optional plugins must not slow the baseline significantly

### Pro Local

- context quality and decomposition must run quickly enough to be used before coding starts
- deeper semantic checks should be incremental whenever possible
- repo memory read/write must be lightweight

## Quality rules

### Rule 1

No split-brain logic across CLI, MCP, and hook flows.

### Rule 2

No feature should require cloud infrastructure unless it is explicitly part of Pro Cloud.

### Rule 3

No Pro feature may make the OSS result less correct or less usable.

### Rule 4

Every new decision surface must be explainable to the user.

If the runtime recommends:

- split
- expand
- block
- merge
- deploy-sensitive handoff

it must be able to explain why.

## Build dependencies

### OSS dependencies

- git
- Node.js
- optional lightweight file-system and parsing helpers

### Pro Local dependencies

- local cache and storage
- optional AST-grep or tree-sitter
- no required hosted service for core functionality

### Pro Cloud dependencies

- service layer
- persistent language servers
- centralized storage
- auth and multi-user coordination

## Release discipline

No capability is considered shipped until:

1. the runtime path exists
2. the interface path exists
3. the JSON output is stable
4. acceptance criteria pass
5. docs reflect the current boundary
