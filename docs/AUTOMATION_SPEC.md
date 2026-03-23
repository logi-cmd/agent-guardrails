# Automation Spec

Last updated: 2026-03-23

## Current implementation state

The first internal runtime layer is now in place:

- `plan` and `check` share a runtime-oriented service layer instead of duplicating all task logic
- task contracts now carry basic session metadata
- the runtime can read repo guardrails, suggest a contract shape, and summarize review risks
- the runtime can now bootstrap a task session and prepare a finish-time check command from the same session context

The first user-facing Skill flow now exists on top of that runtime. The next implementation step is exposing the same flow through MCP methods instead of duplicating logic in prompt text.

## Goal

Make `agent-guardrails` feel like a mature product instead of a command-line checklist by reducing the steps a user has to remember while keeping the same quality bar.

The goal is not to hide the guardrails. The goal is to make them the default path.

## Product principles

- Keep the OSS merge gate strong enough to be genuinely useful on its own.
- Reduce user friction without reducing catch quality.
- Prefer sensible defaults over asking users to hand-write everything.
- Make the result easy to understand at a glance.
- Only interrupt the user when the risk is high or the context is genuinely missing.

## Skill MVP

The first automation layer is a repo-aware Skill that helps an agent start and finish work without forcing the user to learn the entire workflow.

### Inputs

- Natural-language task request
- Repository path
- Optional selected files or changed files
- Optional repo policy and task contract files

### Outputs

- Draft task contract
- Task session metadata
- Suggested allowed paths
- Suggested intended files
- Suggested required commands
- Suggested evidence path
- Initial risk level
- Finish-time check command
- Reviewer-friendly summary

### Behavior

- Infer the most likely task shape from the request and repo context.
- Reuse repo conventions instead of inventing new ones.
- Ask at most one clarifying question when the missing context blocks safe defaults.
- Treat validation and evidence as part of the workflow, not extra ceremony.
- Route high-risk changes to explicit confirmation before continuing.
- Keep the same session alive from task bootstrap through finish-time check guidance.

## MCP MVP

The second automation layer now exists as a stdio MCP service exposed through `agent-guardrails mcp`.

### Methods

- `read_repo_guardrails`
- `suggest_task_contract`
- `run_guardrail_check`
- `summarize_review_risks`

### Behavior

- Return the same underlying guardrail judgment as the CLI.
- Keep machine-readable shapes stable.
- Add semantic help without changing the baseline merge-gate behavior.
- Fall back cleanly when semantic packs are unavailable.
- Reuse the same runtime service layer as `plan` and `check` instead of duplicating prompt logic.

## Agent-native workflow

The final user-facing mode is agent-native:

1. The user describes the change in plain language.
2. The agent reads repo guardrails.
3. The agent drafts or updates the task contract.
4. The agent implements the change inside the declared scope.
5. The agent records evidence and runs the required commands.
6. The agent runs `check`.
7. The agent returns a short summary that says what changed, what was validated, and what still needs attention.

### What the user should not need to do

- Write a complete task contract by hand every time
- Memorize workflow commands
- Decide evidence paths from scratch
- Understand detector names before they get value

## Success criteria

- The user can start from a natural-language request.
- The user sees fewer manual steps than the raw CLI workflow.
- The same guardrail quality remains in place.
- The output is clear enough to trust without reading implementation details.
- The system feels like a product, not a script collection.

## Boundaries

- Do not move baseline safety checks behind a paid gate.
- Do not add new top-level commands unless they replace friction, not add it.
- Do not split the workflow into separate systems that disagree on risk.
- Do not let automation weaken the review gate.
