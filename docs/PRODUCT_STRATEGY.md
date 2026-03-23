# Product Strategy

Last updated: 2026-03-23

## Product truth

`agent-guardrails` should not position itself as:

- a generic AI coding helper
- a prompt-wrapper product
- a PR review bot
- a static-analysis replacement

It should position itself as:

> A repo-aware, stateful, agent-native production-safety runtime for AI coding workflows.

That wording matters because the real problem is not "AI cannot write code."
The real problem is that AI-written changes are expensive to trust, expensive to review, and expensive to maintain inside real repos.

The product wins when it reduces:

- merge risk
- review burden
- maintenance drift
- manual workflow overhead

## Product goal

The durable goal is not perfect code generation.

The durable goal is:

- AI-generated changes are small by default
- repo rules are explicit before code is written
- validation actually happens and is visible
- semantic drift is caught before merge
- review output makes the change easier to judge
- follow-up changes stay maintainable instead of fragmenting into AI-shaped patchwork

Operationally, the product is successful when AI-written code can enter a normal PR flow with materially lower review cost and rollback risk.

## Pain model

The core Vibe Coding pains to solve are:

### 1. Context does not fit

- large repos contain too many rules, paths, and conventions for one prompt
- agents start improvising when the repo shape is not loaded cleanly

Product answer:

- repo-local policy
- preset-backed defaults
- runtime session bootstrap
- task contract before implementation

### 2. Rules are unclear, so AI drifts

- too many files change at once
- new abstractions appear without justification
- protected surfaces change silently

Product answer:

- allowed paths
- intended files
- protected paths
- allowed change types
- semantic detectors for pattern, interface, and boundary drift

### 3. The task chain loses control

- AI work turns into "generate first, sort it out later"
- validation and evidence become optional or forgotten

Product answer:

- finish-time `check`
- required commands
- evidence notes
- runtime next actions

### 4. Debugging and review cost explode

- a diff may compile or pass tests while still being weakly justified
- reviewers still need to reconstruct what changed and why

Product answer:

- review-oriented findings
- residual risk surface
- runtime summary and next actions

### 5. Maintenance gets worse over time

- later edits create parallel abstractions
- the repo becomes patchwork shaped by agent sessions instead of project intent

Product answer:

- continuity hints
- module history
- preferred reuse hints
- future maintainer risk

### 6. Important risks stay implicit

Even when the diff looks small, teams still worry about:

- security
- dependency drift
- performance
- explainability

Product answer:

- explicit risk dimensions in contracts
- runtime hints
- reviewer output sections
- future semantic detectors for higher-signal coverage

## Product architecture

Keep the public command surface stable:

- `init`
- `plan`
- `check`
- `check --review`
- `check --json`
- `mcp`

Internally, the product should keep converging on four layers:

### 1. Core Engine

- task contract
- repo policy
- detector pipeline
- finding aggregation
- review formatting
- evidence model

### 2. Automation Runtime

- session bootstrap
- contract suggestion
- finish-time command planning
- next-action planning
- continuity hints

### 3. Semantic Layer

- pattern drift
- interface drift
- boundary violation
- source-to-test relevance
- future security, dependency, performance, and continuity detectors

### 4. Agent-native Interfaces

- baseline Skill flow
- MCP server
- future agent-native loop
- future IDE integrations

The critical rule is:

> CLI, Skill, MCP, and future agent-native flows must all reuse the same runtime judgment.

The product should never split into multiple risk systems that disagree.

## Moat

The copyable layer is not the moat.

### Copyable layer

- README workflow wording
- adapter instructions
- prompt templates
- "plan then check" descriptions
- single-review phrasing

### Defensible layer

- stateful contract engine
- repo-aware policy runtime
- runtime session orchestration
- semantic detector pipeline
- review surface and evidence loop
- maintenance continuity
- MCP and agent-native integration path

This means the product should not try to defend a prompt.
It should defend a system that gets stronger as it learns the repo workflow and carries state across the task lifecycle.

## OSS and paid boundary

### OSS Core

The open-source core must remain independently useful and production-relevant.

OSS owns:

- `init / plan / check`
- repo-local policy and contracts
- runtime session layer
- `check --review`
- `check --json`
- baseline Skill flow
- baseline MCP server
- semantic proof visibility
- continuity hints
- risk dimensions in reviewer output
- public demos, benchmarks, CI, and i18n

If the capability is required for a repo to use `agent-guardrails` as a real merge gate, it belongs in OSS.

### Pro Local

Pro Local should sell:

- stronger auto contract generation
- repo pattern learning
- richer continuity intelligence
- higher-confidence semantic judgments
- local agent-native orchestration
- IDE-native review surfaces
- stronger reviewer summaries

The paid promise is not "basic checks finally work."
The paid promise is:

- less manual workflow overhead
- lower review effort
- lower maintenance drift

### Pro Cloud

Pro Cloud should sell:

- hosted review
- shared policies
- dashboards and trends
- centralized orchestration
- org-wide governance

## Success criteria

The product is healthy when:

- the task is bounded before code is written
- the change stays within declared scope
- validation was run and reported
- high-risk surfaces are explicit
- semantic drift is visible before merge
- review output speeds up human judgment
- the next maintainer cost is reduced, not increased

Recommended KPIs:

- out-of-scope violation catch rate
- missing-validation catch rate
- semantic drift catch rate
- reviewer triage time
- PR bounce rate
- rollback or hotfix rate
- maintainer friction after follow-up edits

## Next 90 days

1. Build the first agent-native loop MVP on top of the shared runtime and MCP layer.
2. Add the first continuity layer MVP:
   - module history
   - preferred reuse hints
   - continuity break warnings
   - future maintainer risk in review output
3. Deepen risk-dimension coverage from hints into stronger semantic signals:
   - security-sensitive path checks
   - dependency drift checks
   - performance-sensitive change hints
   - understanding or explainability risk
4. Run at least one external pilot beyond the current source-repo pilot.
5. Keep all of the above inside the same OSS runtime path before expanding paid surfaces.
