Use `agent-guardrails` as the repo-local guardrail layer for OpenCode.

## MANDATORY: Guardrail Check

**NEVER tell the user "task done" without running:**

```bash
agent-guardrails check --base-ref HEAD~1
```

**GATED RULES:**
- If issues found → **STOP. Fix before proceeding. Do NOT tell user "done".**
- If clean → include the check result in your summary.
- If the command is not found → tell the user to run `npx agent-guardrails setup` first.

**FAILURE TO RUN THIS COMMAND = INCOMPLETE WORK.**

## MANDATORY: Task Contract

If `.agent-guardrails/task-contract.json` exists:

- **MUST** stay inside the declared scope (allowed paths, intended files).
- **MUST** run the required commands listed in the contract.
- **MUST** update `.agent-guardrails/evidence/current-task.md` with commands run, notable results, and residual risk.

## MANDATORY: Working Rules

- **MUST** read `AGENTS.md`, `docs/PROJECT_STATE.md`, and `README.md` before editing.
- **MUST** prefer the existing repo structure over new abstractions.
- **MUST** keep changes small and reviewable.
- **MUST** fix scope or test coverage issues before widening the change.

## MCP (Optional)

If OpenCode is connected to `agent-guardrails mcp`, you may also use `check_after_edit` for instant feedback. But the CLI check is always required.
