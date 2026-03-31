# Claude Code Project Memory

Use `agent-guardrails` as the repo-local guardrail layer for this project.

## Read First

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

If Claude Code is connected to `agent-guardrails mcp`, you may also use:
- `check_after_edit` after every edit for instant feedback
- `start_agent_native_loop` / `finish_agent_native_loop` for structured sessions

But the CLI check is always required regardless of MCP.

## Rules

- Prefer the existing repo structure over new abstractions.
- Keep changes small and reviewable.
- If `check` fails, fix scope or test coverage before widening the change.
