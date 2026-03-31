# OpenClaw Instructions

Use this repo with `agent-guardrails` as the shared workflow guardrail layer.

## Read First

Before editing, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the target files for the task

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

- **MUST** keep tasks small and reviewable.
- **MUST** prefer the existing repo structure over new abstractions.
- **MUST** include tests when the task touches behavior.
- **MUST** fix scope or test coverage issues before widening the change.

## MCP (Optional)

If OpenClaw is connected to `agent-guardrails mcp`, you may also use `check_after_edit` for instant feedback. But the CLI check is always required.