# Agent Rules (MANDATORY - not optional)

## MANDATORY: Read First

Before writing ANY code, you MUST read:

1. `AGENTS.md` (this file)
2. `docs/PROJECT_STATE.md`
3. `README.md` if it exists
4. the specific files you plan to modify

Skipping this step is a RULE VIOLATION.

## MANDATORY: Guardrail Check Before Finishing

**NEVER tell the user "task done" without running this command:**

```bash
npx agent-guardrails check --base-ref HEAD~1
```

**GATED RULES:**
- If issues found: **STOP. Fix before proceeding. Do NOT tell user "done".**
- If clean: include the check result in your summary.
- If the command is not found: tell the user to run `npx agent-guardrails setup` first.

Windows PowerShell note: if `npx` or `npm` is blocked by the `.ps1` shim policy, use `npx.cmd` and `npm.cmd`.

**FAILURE TO RUN THIS COMMAND = INCOMPLETE WORK.**

## MANDATORY: Task Contract

If `.agent-guardrails/task-contract.json` exists:

- **MUST** stay inside the declared scope (allowed paths, intended files).
- **MUST** run the required commands listed in the contract.
- **MUST** update `.agent-guardrails/evidence/current-task.md` with commands run, notable results, and residual risk.

If no contract exists and the task is non-trivial, **MUST** run:

```bash
npx agent-guardrails plan --task "<task description>"
```

Then implement inside the generated contract.

## MANDATORY: Working Rules

- **MUST** prefer existing patterns over new abstractions.
- **MUST** keep changes small and easy to review.
- **MUST** list touched files before editing when the task is non-trivial.
- **MUST** surface missing context instead of inventing details.
- **MUST** update or add tests when behavior changes.

## MANDATORY: Definition Of Done

ALL of these must be true before reporting completion:

- [ ] Implementation matches current project conventions.
- [ ] Changed behavior has test coverage when appropriate.
- [ ] Guardrail check passed (`npx agent-guardrails check --base-ref HEAD~1`).
- [ ] Required commands for the task were actually run and reported.
- [ ] Evidence note for the current task exists and reflects the real outcome.
- [ ] Risks, assumptions, and follow-up work are documented.

**IF ANY ITEM IS FALSE, THE TASK IS NOT DONE.**
