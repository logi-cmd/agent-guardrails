# Pro Local Spec

Last updated: 2026-04-09
Status: Canonical

## Goal

Define the first paid product deeply enough that it feels necessary, not optional.

Pro Local exists to remove high-cost manual work from daily AI coding workflows while reducing trust risk and long-term repo drift.

## Product promise

Pro Local should make users feel:

- I waste less time shaping AI work
- I catch oversized or risky changes earlier
- I make faster merge decisions
- my repo degrades less over repeated AI sessions
- production-shaped changes get better handoff

If Pro Local only feels like "nicer review output," it has failed.

## Feature set

### 1. Rough intent to contract

#### User problem

Users often start with weak prompts:

- "Add refunds"
- "Fix auth edge cases"
- "Upgrade onboarding flow"

They do not know the safe scope yet.

#### Product behavior

The system should:

- analyze the repo and prompt
- propose 2 to 3 smallest-safe task shapes
- suggest likely changed surfaces
- suggest likely validations
- classify likely risk
- recommend whether to split immediately

#### Output requirements

For each suggested task shape:

- task summary
- likely files or folders
- likely change type
- likely validations
- likely risks
- reason this scope is considered safe

#### Depth bar

Not enough:

- rephrasing the user prompt
- generating a generic checklist

Must do:

- repo-aware suggestions
- decomposition logic
- explicit safety reasoning

### 2. Scope intelligence

#### User problem

AI changes often sprawl across too many files before the user notices.

#### Product behavior

The system should:

- classify changed files as core, spillover, validation, config, docs, risky, or operational
- estimate whether the task has exceeded safe size
- suggest concrete batches
- detect when scope expansion is justified by dependencies
- distinguish accidental sprawl from necessary dependent changes

#### Output requirements

- current file budget vs safe budget
- file classification
- recommended split boundaries
- explanation of spillover
- recommended next action: continue, split, expand, or stop

#### Depth bar

Not enough:

- "too many files changed"
- "consider splitting"

Must do:

- concrete file grouping
- dependency-aware or pattern-aware reasoning
- actionable next steps

### 3. Context quality assurance

#### User problem

AI sessions often start with missing context, stale contracts, or poor evidence expectations.

#### Product behavior

The system should detect before coding:

- stale task contracts
- missing evidence paths
- missing required commands
- mismatch between prompt and loaded context
- missing repo files that likely need to be read

#### Output requirements

- context score
- missing input list
- suggested files to inspect
- suggested contract fixes
- confidence warning when context is weak

#### Depth bar

Not enough:

- a generic score with vague advice

Must do:

- identify concrete missing inputs
- suggest concrete corrective action
- reduce false confidence

### 4. Repo memory and continuity

#### User problem

Repeated AI sessions gradually create repo drift because earlier lessons are forgotten.

#### Product behavior

The system should store and reuse:

- preferred abstractions
- previously rejected approaches
- recurring drift patterns
- repair history
- reviewer preferences

#### Output requirements

- continuity hints during planning
- warning on repeated bad patterns
- suggestions to reuse known good structures
- memory updates after successful or repaired changes

#### Depth bar

Not enough:

- static notes
- raw logs without operational effect

Must do:

- change future recommendations
- influence scope and continuity warnings
- improve with repeated use

### 5. Stronger semantic detection

#### User problem

Heuristics alone miss important drift and over-warn in complex repos.

#### Product behavior

Pro Local should add:

- static import graph analysis
- structured pattern matching
- stronger interface drift detection
- stronger source-to-test relevance
- stronger boundary analysis

#### Output requirements

- affected abstractions
- likely impact areas
- confidence level when useful
- remediation-oriented suggestions

#### Depth bar

Not enough:

- more heuristic warnings with higher volume

Must do:

- improve precision
- improve explanation
- improve actionability

### 6. Independent second-pass verification

#### User problem

The same agent that wrote the code is a poor judge of whether it is truly safe.

#### Product behavior

Pro Local should support a separate verification pass that:

- reviews the diff independently
- checks for proof gaps
- challenges merge confidence when evidence is weak

#### Output requirements

- independent concerns
- proof gaps
- changed verdict confidence
- explicit unresolved questions

#### Depth bar

Not enough:

- a second summary that repeats the first one

Must do:

- surface materially different concerns
- improve the merge decision

### 7. Merge-to-deploy handoff

#### User problem

A change can be safe enough to merge but still operationally risky to deploy.

#### Product behavior

The system should:

- detect production-shaped changes
- identify operational surfaces
- require deploy-sensitive proof
- generate verify steps
- generate rollback considerations

#### Output requirements

- production sensitivity classification
- why this change is operationally sensitive
- pre-deploy checks
- post-deploy verify steps
- rollback notes

#### Depth bar

Not enough:

- generic deployment checklist text

Must do:

- change-specific operational guidance
- stronger proof requirements for risky changes

## Shared Pro rules

### Rule 1

Every feature must affect a real user decision.

### Rule 2

Every feature must beat DIY within the first week of use.

### Rule 3

Every feature should compound over time when possible.

### Rule 4

Every feature must preserve local-first operation.

### Rule 5

Every feature must degrade cleanly when inputs are incomplete.

## Storage

Pro Local may store local data under:

- `.agent-guardrails/repo-memory.json`
- `.agent-guardrails/pro/`
- local cache in user home when necessary for licensing or performance

No hosted service should be required for the core Pro Local workflow.

## Non-goals

Pro Local does not aim to:

- prove correctness
- replace architectural judgment
- provide enterprise dashboards
- provide centralized governance
- support every language deeply on day one

## Release gate

Pro Local is not release-ready until all seven feature areas have:

- defined output
- runtime behavior
- acceptance tests
- user-facing explanation
- clear failure and fallback behavior
