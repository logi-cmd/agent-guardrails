Before writing code:

1. Read `AGENTS.md`, `docs/PROJECT_STATE.md`, `README.md`, and the target module files.
2. Summarize the existing implementation pattern you will follow.
3. List the exact files you expect to change.
4. State the smallest viable implementation that satisfies the request.

While implementing:

- Prefer existing architecture and naming.
- Do not create a new abstraction unless the current code cannot reasonably support the change.
- Keep the change bounded and easy to review.
- Add or update tests for behavior changes.

Before finishing:

- Run the configured checks.
- Call out any residual risks or missing context.
