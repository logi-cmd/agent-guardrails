# Claude Code Project Memory

Use `agent-guardrails` as the repo-local guardrail layer for this project.

## Read First

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the target files for the task

## Working Flow

1. Read repo state first, then run `agent-guardrails plan --task "<task>"` to bootstrap the task contract and session.
2. Implement only within the task contract unless you update the scope first.
3. If behavior changes, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
4. Before finishing, run the `agent-guardrails check ... --review` command recommended by the runtime with the commands that actually ran.

## Rules

- Prefer the existing repo structure over new abstractions.
- Keep changes small and reviewable.
- If `check` fails, fix scope or test coverage before widening the change.
- Use `agent-guardrails check --json` for automation or CI, not as the default local workflow.
