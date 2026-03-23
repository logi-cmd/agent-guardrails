# Automation Spec

Last updated: 2026-03-23

## Goal

Make `agent-guardrails` feel like a product, not a checklist, by turning the existing OSS runtime into the default path for agent work.

The goal is not to hide the guardrails.
The goal is to make them happen automatically while keeping the same quality bar.

## Product principles

- Keep the OSS merge gate strong enough to be genuinely useful on its own.
- Reduce manual steps without reducing catch quality.
- Prefer sensible defaults over asking users to hand-write everything.
- Keep one runtime judgment path across CLI, Skill, MCP, and future agent-native flows.
- Only interrupt the user when the risk is high or the context is genuinely missing.

## Current implementation state

Today the runtime already provides:

- repo guardrail loading
- task-contract suggestion
- session bootstrap
- finish-time check planning
- review-risk summarization
- agent-native loop bootstrap and finish helpers

The first baseline Skill flow already exists through `plan` plus `check`, the first MCP MVP already exists through `agent-guardrails mcp`, and the first OSS agent-native loop now exists as runtime-backed MCP actions.

The next implementation step is not more prompt text.
It is strengthening continuity and future-maintainer guidance on top of the same loop.

## Runtime model

The automation stack should remain four layers:

### 1. Core Engine

- repo policy
- task contract
- detector pipeline
- finding aggregation
- review formatter

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

### 4. Agent-facing Interfaces

- baseline Skill flow
- MCP methods
- future agent-native loop
- future IDE integrations

## Skill flow

The baseline Skill flow should keep doing one thing well:

- start from natural-language task input
- produce a bounded runtime-backed contract
- guide the agent to the finish-time `check`

### Inputs

- natural-language task request
- repository path
- optional selected files or changed files

### Outputs

- draft task contract
- task session metadata
- suggested allowed paths
- suggested intended files
- suggested required commands
- suggested evidence path
- risk dimensions
- finish-time check command
- reviewer-friendly next actions

### Rules

- reuse repo conventions instead of inventing new ones
- ask at most one clarifying question only when safe defaults fail
- treat validation and evidence as part of the workflow, not extra ceremony
- keep the same session alive from bootstrap through finish-time check

## MCP

The MCP server should remain a thin interface over the same runtime.

### Current methods

- `read_repo_guardrails`
- `suggest_task_contract`
- `start_agent_native_loop`
- `finish_agent_native_loop`
- `run_guardrail_check`
- `summarize_review_risks`

### Rules

- return the same judgment as the CLI
- keep machine-readable shapes stable
- add semantic help without changing baseline merge-gate behavior
- never duplicate prompt logic outside the runtime

## Agent-native loop

The first MVP is now in place through the runtime plus MCP.

The current loop lets an agent:

1. read repo guardrails
2. draft and write the task contract
3. seed the evidence note
4. implement inside the declared scope
5. run required commands
6. update evidence
7. run `check`
8. return a short reviewer-friendly summary

The next loop milestone is not a second command path.
It is adding stronger continuity and reuse guidance on top of the same runtime-backed loop.

The user should not need to:

- hand-write a complete task contract
- memorize workflow commands
- choose evidence paths from scratch
- understand detector names before getting value

## Continuity and risk dimensions

Automation should not stop at pass/fail.

The runtime and reviewer surface should keep making these dimensions visible:

- security
- dependency
- performance
- understanding
- continuity

Near-term follow-on work:

- module history
- preferred reuse hints
- continuity break warnings
- future maintainer risk

## Boundaries

- Do not move baseline safety checks behind a paid gate.
- Do not create a separate automation path that disagrees with the CLI.
- Do not let automation weaken validation, evidence, or risk escalation.
- Do not treat prompts as the product; the runtime is the product.
