# OpenClaw Instructions

Use this repo with `agent-guardrails` as the shared workflow guardrail layer.

## Read First

Before editing, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the target files for the task

## Working Flow

1. Before finishing any task, run: `agent-guardrails check --base-ref HEAD~1`
2. If issues found: **STOP and fix before telling user "done"**
3. If clean: include the check result in your summary

## Task Contract (when available)

If `.agent-guardrails/task-contract.json` exists:
- Stay inside the declared scope
- Run the required commands listed in the contract
- Update `.agent-guardrails/evidence/current-task.md`

## MCP (Optional)

If OpenClaw is connected to `agent-guardrails mcp`, you may also use `check_after_edit` for instant feedback. But the CLI check is always required.

## Rules

- Keep tasks small and reviewable.
- Prefer the existing repo structure over new abstractions.
- If the task scope is narrow or high-risk, tighten it with `--intended-files`, `--allowed-change-types`, `--allow-paths`, or `--required-commands`.
- If the task touches behavior, include tests.
- If `check` fails, fix the scope or the tests before expanding the change.
