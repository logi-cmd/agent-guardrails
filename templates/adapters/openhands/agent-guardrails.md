Use `agent-guardrails` as the repository guardrail layer for OpenHands.

- Read `AGENTS.md`, `docs/PROJECT_STATE.md`, and `README.md` before editing.
- Run `agent-guardrails plan --task "<task>"` to bootstrap the task contract and session.
- Keep the implementation inside the declared contract unless the task scope is explicitly updated.
- If behavior changes, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
- Before finishing, use the `agent-guardrails check ... --review` command recommended by the runtime and pass the commands that actually ran.
- Use `agent-guardrails check --json` for automation or CI, not as the default local path.
