# Agent Rules

## Read First

Before writing code, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the specific files you plan to modify

## Working Style

- Prefer existing patterns over new abstractions.
- Keep changes small and easy to review.
- List touched files before editing when the task is non-trivial.
- If context is missing, surface the gap instead of inventing details.
- When behavior changes, update or add tests.

## Guardrail Check (MANDATORY before finishing)

**Before telling the user "task done", you MUST run:**

```bash
agent-guardrails check --base-ref HEAD~1
```

- If issues found: **STOP and fix before proceeding.** Do NOT tell user "done".
- If clean: include the check result in your summary.
- If the command is not found: tell the user to run `npx agent-guardrails setup` first.

## Task Contract (when available)

If `.agent-guardrails/task-contract.json` exists:

- Stay inside the declared scope (allowed paths, intended files).
- Run the required commands listed in the contract.
- Update `.agent-guardrails/evidence/current-task.md` with commands run, notable results, and residual risk.

If no contract exists and the task is non-trivial, run:

```bash
agent-guardrails plan --task "<task description>"
```

Then implement inside the generated contract.

## Definition Of Done

- The implementation matches current project conventions.
- The changed behavior has test coverage when appropriate.
- Guardrail check passed (`agent-guardrails check --base-ref HEAD~1`).
- Required commands for the task were actually run and reported.
- The evidence note for the current task exists and reflects the real task outcome.
- Risks, assumptions, and follow-up work are documented.
