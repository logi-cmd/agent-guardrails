# Implementation Plan

Last updated: 2026-04-09
Status: Canonical

## Objective

Provide a build sequence that can take the product from current OSS baseline to a complete OSS + Pro Local product without losing focus.

## Build principles

- go deeper before going wider
- keep one runtime judgment system
- keep OSS independently useful
- only build paid features that remove real workflow pain
- finish one painful workflow completely before adding adjacent capability

## Phase map

### Phase 0: Documentation alignment

Goal:

- establish a canonical doc system
- remove ambiguity about product scope and build order

Deliverables:

- documentation index
- product blueprint
- technical spec
- Pro Local spec
- implementation plan
- acceptance criteria

Exit condition:

- canonical docs are sufficient to guide implementation without strategy drift

### Phase 1: OSS baseline hardening

Goal:

- make the OSS merge gate excellent and trustworthy

Deliverables:

- stable setup and check flows
- stable hook and adapter behavior
- trustworthy reviewer output
- deploy-readiness baseline
- clean JSON output contract

Exit condition:

- OSS is clearly production-useful without Pro

### Phase 2: Rough-intent workflow

Goal:

- allow users to start safely from vague requests

Deliverables:

- rough intent parser
- multiple smallest-safe task-shape suggestions
- contract generation or refinement
- likely validation inference
- risk classification

Dependencies:

- repo analysis
- policy resolution
- contract persistence

Exit condition:

- a vague user request can become a bounded task contract with actionable next steps

### Phase 3: Scope intelligence

Goal:

- stop oversized AI changes before they become cleanup work

Deliverables:

- file-role classification
- repo-aware file budget
- spillover detection
- split vs expand recommendation
- concrete batch planning

Dependencies:

- changed file detection
- top-level repo analysis
- optional dependency graph for deeper grouping

Exit condition:

- the system can explain when a change should split and how

### Phase 4: Context quality assurance

Goal:

- prevent wasted AI sessions caused by incomplete or stale setup

Deliverables:

- stale contract detection
- missing evidence detection
- missing required command detection
- prompt/context mismatch checks
- suggested files or inputs to load before coding

Dependencies:

- contract validation
- repo awareness
- policy rules

Exit condition:

- the system can tell users what is missing before coding starts

### Phase 5: Repo memory and continuity

Goal:

- make repeated AI sessions safer and less drifting

Deliverables:

- local repo memory store
- preferred abstraction capture
- repeated drift capture
- repair history capture
- memory-informed guidance in planning and checking

Dependencies:

- stable result schema
- local persistence model

Exit condition:

- past sessions visibly improve future recommendations

### Phase 6: Stronger semantic detection

Goal:

- improve signal quality beyond OSS heuristics

Deliverables:

- static import graph
- stronger source-to-test relevance
- stronger interface drift
- structured pattern matching
- better remediation hints

Dependencies:

- plugin contract
- stable detector pipeline

Exit condition:

- Pro Local signal is meaningfully more precise and actionable than OSS

### Phase 7: Independent second-pass verification

Goal:

- reduce self-verification bias in merge decisions

Deliverables:

- separate verification pass
- proof-gap detection
- unresolved question output
- second-pass verdict influence

Dependencies:

- stable review schema
- merge decision layer

Exit condition:

- the second pass can materially change a merge decision

### Phase 8: Merge-to-deploy handoff

Goal:

- extend trust from merge safety into deploy safety

Deliverables:

- production-shape classifier
- deploy-sensitive proof requirements
- verify step generation
- rollback note generation
- operator-facing output section

Dependencies:

- risk model
- next-action planner

Exit condition:

- production-shaped changes receive stronger handoff than routine changes

### Phase 9: Packaging and commercialization readiness

Goal:

- ship a paid product with clear value and low confusion

Deliverables:

- license and package flow
- clean OSS-to-Pro upgrade path
- refined README and docs
- pricing-ready packaging
- proof asset

Exit condition:

- users can understand, install, and evaluate the upgrade in one session

## Recommended build order inside the codebase

1. normalize output schema
2. stabilize contract and policy modules
3. add repo-analysis helpers
4. add rough-intent planner
5. add scope intelligence
6. add context quality engine
7. add repo memory persistence
8. add stronger semantic plugins
9. add second-pass verification
10. add deploy handoff planner

## Do not parallelize too early

Avoid implementing all Pro features at once.
Use this sequence:

1. rough-intent workflow
2. scope intelligence
3. context quality
4. repo memory
5. deploy handoff
6. semantic precision improvements
7. second-pass verification

Reason:

- this sequence solves user pain in the order users feel it
- it preserves a coherent product story
- it reduces the chance of building impressive but weak features

## Milestone definition

Each phase must produce:

- code
- tests
- user-facing output
- updated docs
- explicit acceptance signoff

No phase is done if it only has implementation without proof and docs.
