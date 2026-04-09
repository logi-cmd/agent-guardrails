# Product Blueprint

Last updated: 2026-04-09
Status: Canonical

## Product definition

`agent-guardrails` is the control plane for AI-generated code in production repositories.

It is not:

- a coding agent
- a generic PR review bot
- a static analysis replacement
- a compliance dashboard

It is the system that turns unsafe, vague, or oversized AI coding work into:

- bounded tasks
- controlled implementation
- evidence-backed trust decisions
- clearer merge and deploy actions
- lower long-term repo drift

## Product line

### OSS Core: Merge Gate

The free product must remain production-relevant on its own.

OSS owns:

- setup and initialization
- task contracts
- scope and policy enforcement
- required validation and evidence
- baseline review output
- baseline merge-readiness guidance
- baseline deploy-readiness guidance
- agent adapters and MCP integration

### Pro Local: Change Pilot

The first paid product.

Pro Local owns:

- rough-intent to contract generation
- repo-aware scope intelligence
- smart decomposition before change sprawl
- context quality assurance
- repo memory and continuity
- stronger semantic analysis
- independent second-pass verification
- merge-to-deploy handoff

### Pro Cloud: Control Tower

Later phase only.

Pro Cloud owns:

- shared policies
- dashboards and trends
- approvals and auditability
- multi-repo history
- team workflows and centralized orchestration

## Users

### Primary users

- solo developers shipping real product code with AI daily
- consultants and agencies working across many repos
- small teams using mixed agents

### Secondary users

- technical leads who need consistent AI change discipline
- reviewers who need faster trust decisions
- operators who need better deploy and rollback handoff

## Core user jobs

### 1. Start from vague intent without losing control

The user often knows the business outcome, not the exact task contract.

The product must help convert rough intent into:

- smallest-safe task shapes
- likely files
- likely validations
- likely risk surfaces

### 2. Keep AI changes bounded while coding

The user should not have to babysit the agent.

The product must:

- detect when the task is growing too large
- flag risky spillover
- preserve scope and conventions

### 3. Prove more than "the agent says tests passed"

The product must:

- require evidence
- check whether validation matches the change
- expose residual risk

### 4. Reduce review time without weakening standards

The product must make it faster to answer:

- what changed
- why it matters
- what is still risky
- what should happen next

### 5. Prevent AI-induced repo drift over time

The product must:

- detect repeated pattern drift
- remember preferred abstractions
- carry continuity signals into later sessions

### 6. Extend safety beyond merge into deploy

The product must:

- identify production-shaped changes
- require deploy-sensitive proof
- generate verify and rollback guidance

## Product promises

These are the promises the product is allowed to make:

- lower trust work around AI-generated changes
- smaller, safer changes
- faster review and merge decisions
- lower maintenance drift over repeated AI usage
- better operational safety around production-shaped diffs

These are promises the product must not make:

- guaranteed correctness
- no need for human review
- complete elimination of self-verification bias
- perfect understanding of user intent
- complete semantic certainty

## Non-negotiable product rules

### 1. The product must change decisions, not just produce analysis

It must help answer:

- should this task be split?
- is this still in safe scope?
- is the proof sufficient to merge?
- is this deploy-sensitive?
- what should happen next?

### 2. Paid features must remove pain, not add polish

No paid feature should exist only because it:

- adds another score
- writes a nicer paragraph
- adds a more colorful report

Every paid feature must remove manual work, reduce real risk, or preserve continuity.

### 3. The workflow must stay agent-agnostic

Claude Code, Cursor, OpenCode, Codex, and Gemini should all use the same core runtime judgment.

### 4. OSS must remain a real merge gate

The upgrade path should feel like:

> the free version already works, the paid version removes friction and adds depth

### 5. Depth beats breadth

It is better to solve 5 painful jobs deeply than 20 jobs shallowly.

## UX model

The product experience has four stages.

### Stage 1: Shape

Inputs:

- rough intent or explicit task
- current repo context
- user-selected or auto-detected preset

Outputs:

- task contract
- allowed scope
- intended files
- required commands
- evidence expectations
- likely risk class

### Stage 2: Control

Inputs:

- active file changes
- evolving diff
- current contract
- repo policy

Outputs:

- scope violations
- decomposition suggestions
- continuity warnings
- semantic risk signals

### Stage 3: Decide

Inputs:

- diff
- executed validations
- evidence
- findings

Outputs:

- trust decision
- category-level reasoning
- residual risk
- next steps

### Stage 4: Handoff

Inputs:

- final change shape
- production sensitivity
- risk surfaces

Outputs:

- merge guidance
- deploy verification checklist
- rollback hints
- future continuity notes

## OSS feature contract

OSS must ship:

- `setup`
- `plan`
- `check`
- `check --review`
- `check --json`
- task contracts
- evidence handling
- baseline scope controls
- baseline risk and continuity checks
- agent adapters
- MCP server
- baseline reviewer output
- baseline deploy-readiness output

OSS must not depend on Pro in order to be useful.

## Pro Local feature contract

Pro Local must ship deeply enough to be hard to replace.

### Feature 1: Rough intent to contract

Must:

- handle vague prompts
- propose multiple smallest-safe task shapes
- infer likely validations and risks
- explain why a suggested scope is safe

### Feature 2: Scope intelligence

Must:

- classify changed files by role
- detect spillover early
- suggest concrete batch boundaries
- distinguish expansion from decomposition cases

### Feature 3: Context quality assurance

Must:

- detect stale or missing context before code is written
- recommend which files or evidence are missing
- detect mismatch between task and loaded context

### Feature 4: Repo memory and continuity

Must:

- remember preferred abstractions
- remember rejected patterns
- preserve repair history
- improve future guidance

### Feature 5: Merge-to-deploy handoff

Must:

- identify operationally sensitive changes
- request stronger proof when needed
- output verify and rollback actions

If these five features are not deep, Pro Local will feel optional.

## Out of scope for first paid release

- large enterprise governance
- cloud dashboards
- compliance reporting
- broad multi-language semantic parity
- a brand-new coding agent shell
- hosted control plane infrastructure

## Success metrics

### Product metrics

- median changed files per accepted AI task decreases
- first-pass merge rate improves
- reviewer triage time decreases
- follow-up cleanup tasks decrease
- repeated pattern drift decreases
- deploy-sensitive changes have better verify coverage

### Commercial metrics

- weekly active users who run 10+ checks
- paid conversion among high-frequency users
- 30-day retained Pro users
- percent of paid users who say removal would hurt workflow

## Required proof of value

The product is only ready when it can demonstrate all of the following with realistic examples:

- a vague request becomes a bounded task
- a too-large change gets decomposed before it sprawls
- missing context is detected before the agent wastes time
- the review output changes a merge decision
- a production-shaped change gets deploy-specific handoff

## Build order

1. Make OSS merge gate excellent and trustworthy
2. Ship the first deep Pro Local workflow
3. Prove continuity and memory value
4. Expand to stronger semantic and operational depth
5. Move to team and cloud layers only after Pro Local is indispensable
