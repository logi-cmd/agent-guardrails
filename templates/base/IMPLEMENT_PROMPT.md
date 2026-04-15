Before writing code:

1. Read `AGENTS.md`, `docs/PROJECT_STATE.md`, `README.md` if it exists, and the target module files.
2. Summarize the existing implementation pattern you will follow.
3. List the exact files you expect to change.
4. State the smallest viable implementation that satisfies the request, plus any intended files, risk level, or change-type constraints that should be declared in the task contract.

While implementing:

- Prefer existing architecture and naming.
- Do not create a new abstraction unless the current code cannot reasonably support the change.
- Keep the change bounded and easy to review.
- Add or update tests for behavior changes.
- Keep a short evidence note for the task at `.agent-guardrails/evidence/current-task.md`.
- Keep interface, config, and migration changes explicit instead of letting them hide inside a generic implementation task.

Before finishing:

- Record the commands you actually ran and summarize the notable results plus residual risk or `none` in `.agent-guardrails/evidence/current-task.md`.
- Run the configured checks and pass the executed commands to `npx agent-guardrails check --commands-run "..." --review`.
- Call out any residual risks or missing context.
