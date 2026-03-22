Use `agent-guardrails` as the repository guardrail layer for OpenHands.

- Read `AGENTS.md`, `docs/PROJECT_STATE.md`, and `README.md` before editing.
- Run `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --intended-files "src/file.js,tests/file.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"` to write a task contract.
- Keep the implementation inside the declared contract unless the task scope is explicitly updated.
- If behavior changes, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
- Before finishing, run `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`.
- Use `agent-guardrails check --json` for automation or CI, not as the default local path.
