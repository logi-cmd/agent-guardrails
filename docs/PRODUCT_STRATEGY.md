# Product Strategy

Last updated: 2026-03-24

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

The primary entry should be:

- conversation-first
- MCP-first for existing coding agents
- CLI as infrastructure, fallback, CI, and debugging

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

The support boundary should stay honest:

- deepest support today is JavaScript / TypeScript
- baseline runtime support today exists for Next.js, Python/FastAPI, and monorepos
- Python is the next language to deepen after TS/JS

## Pain model

The core Vibe Coding pains to solve are now modeled as ten categories, not just scope and tests.

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

### 7. The user does not know how to ask

- many users only have a rough idea
- they do not want to pre-write a clean task, scope, or acceptance criteria

Product answer:

- setup-first entry
- rough-intent examples
- future rough-intent mode that turns vague requests into the smallest safe task

### 8. Failure and recovery stay fuzzy

- users can see risk but still do not know how to recover cleanly
- bad AI changes need a clear narrowing or rollback path

Product answer:

- finish-time next actions
- continuity guidance
- future recovery guidance with contract narrowing and rollback hints

### 9. Secrets, privacy, and auditability are easy to get wrong

- users worry about leaking config, secrets, internal paths, or sensitive surfaces
- teams need clearer boundaries around what is safe to store repo-locally versus user-globally

Product answer:

- explicit setup guidance for safe repo-local config targets
- future secrets-safe setup rules, redaction guidance, and stronger policy/audit layers

### 10. Teams need shared trust, not only solo confidence

- team adoption depends on approvals, shared policy, and review trust
- ROI must eventually be visible across multiple users and repos

Product answer:

- reviewer-facing outputs that are easy to forward and trust
- future shared policies, audit trails, approval flows, and ROI instrumentation

## Product architecture

Keep the public command surface stable:

- `init`
- `setup`
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

The user-facing preference order should now be:

1. existing agent chat through MCP
2. agent-native loop on top of the same runtime
3. CLI fallback for manual, CI, or debugging use

The critical rule is:

> CLI, Skill, MCP, and future agent-native flows must all reuse the same runtime judgment.

The product should never split into multiple risk systems that disagree.

## Current execution order

The next sequence should be:

1. entry compression plus category clarity so users understand this is for real repos, not one-off prototypes
2. rough-intent mode for users who cannot state the task cleanly yet
3. a short trust verdict layer above the reviewer summary
4. recovery, secrets-safe guidance, and cost-awareness hints
5. language support expansion, with Python as the next deeper ecosystem
6. proof asset plus early distribution around real failure modes
7. production-readiness and post-deploy maintenance surface
8. deployment orchestration as a later automation layer
9. deeper runtime signals and higher-confidence detectors
10. team and Pro wedges such as shared policy, approvals, auditability, and ROI instrumentation

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
- trust verdicts
- recovery, secrets-safe, and cost-awareness guidance
- deploy-readiness judgment
- release and deploy checklist visibility
- post-deploy maintenance summaries
- public demos, benchmarks, CI, and i18n

If the capability is required for a repo to use `agent-guardrails` as a real merge gate, it belongs in OSS.

### Pro Local

Pro Local should sell:

- stronger auto contract generation
- repo pattern learning
- richer continuity intelligence
- higher-confidence semantic judgments
- local agent-native orchestration
- local production-profile assistants
- script or CI deployment orchestration
- local post-deploy verify and rollback assistance
- provider adapter support
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
- hosted deployment orchestration
- approvals and release gates
- audit trails
- rollout visibility
- centralized monitoring and trend views
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
- deploy-readiness is explicit before release
- post-deploy recovery and operator next actions are visible when production surfaces change

Recommended KPIs:

- out-of-scope violation catch rate
- missing-validation catch rate
- semantic drift catch rate
- reviewer triage time
- PR bounce rate
- rollback or hotfix rate
- maintainer friction after follow-up edits

## Next 90 days

1. Finish the low-cognitive-load product entry:
   - bilingual first screen
   - clearer category contrast versus one-shot generation tools
   - setup output that reads like a short path, not a manual
2. Prototype rough-intent mode on the same runtime path so vague requests become 2 to 3 smallest-safe task suggestions.
3. Add a short trust verdict plus clearer recovery, secrets-safe, and cost-awareness guidance above the existing reviewer summary.
4. Turn language support into a growth lever:
   - keep JS/TS as the deepest path
   - ship a Python/FastAPI baseline proof path that demonstrates runtime and deploy-readiness credibility without semantic-parity claims
   - define the first Python semantic roadmap slice only after that baseline proof lands
5. Publish a single proof asset that shows what this runtime catches that normal AI coding workflows miss, then use that same proof page as the entry for early distribution.
6. Add deploy-readiness judgment and a post-deploy maintenance surface to the OSS reviewer output before any real deployment orchestration is attempted.
7. Keep deployment orchestration as a later automation layer so the runtime stays the product and provider adapters do not outrun trust, recovery, and proof.
