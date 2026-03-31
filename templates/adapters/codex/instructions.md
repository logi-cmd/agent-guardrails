Use `agent-guardrails` as the repository guardrail layer for Codex CLI.

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

If Codex CLI is connected to `agent-guardrails mcp`, you may also use `check_after_edit` for instant feedback. But the CLI check is always required.

## Rules

- Read `AGENTS.md`, `docs/PROJECT_STATE.md`, and `README.md` before editing.
- Prefer the existing repo structure over new abstractions.
- Keep changes small and reviewable.
- If `check` fails, fix scope or test coverage before widening the change.
