# OpenClaw Instructions

Use this repo with `agent-guardrails` as the shared workflow guardrail layer.

## Read First

Before editing, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. `adapters/openclaw/README.md`
5. the target files for the task

## Working Rules

- Keep tasks small and reviewable.
- Prefer the existing repo structure over new abstractions.
- If the task scope is narrow, declare it with `agent-guardrails plan --allow-paths ... --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"`.
- If the task touches behavior, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
- Before finishing, run `agent-guardrails check --base-ref origin/main --commands-run "npm test"`.
- Use `agent-guardrails check --json` for automation or CI, not as the primary local loop.

## Default Task Pattern

1. Read the repo state and the task brief.
2. Run `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"`.
3. Make the smallest implementation that fits the task contract.
4. Update `.agent-guardrails/evidence/current-task.md` with the real commands run and results, then run `agent-guardrails check --base-ref origin/main --commands-run "npm test"`.
5. Update `docs/PROJECT_STATE.md` if the next step changed.

## Notes

- If the task needs broader scope, update the task contract first.
- If `check` fails, fix the scope or the tests before expanding the change.
