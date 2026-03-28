# Gemini CLI Instructions

Use this repo with `agent-guardrails` as the shared workflow guardrail layer.

## Read First

Before editing, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the target files for the task

## Working Rules

- Keep tasks small and reviewable.
- Prefer the existing repo structure over new abstractions.
- If Gemini CLI is connected to `agent-guardrails mcp`, prefer:
  1. `read_repo_guardrails`
  2. `start_agent_native_loop`
  3. implement inside the declared scope
  4. `finish_agent_native_loop`
- If the task scope is narrow or high-risk, tighten it with `--intended-files`, `--allowed-change-types`, `--allow-paths`, or `--required-commands`.
- If the task touches behavior, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
- Before finishing, run the `agent-guardrails check ... --review` command recommended by the runtime with the commands that actually ran.
- Use `agent-guardrails check --json` for automation or CI, not as the primary local loop.

## Default Task Pattern

1. Read the repo state and the task brief.
2. If the runtime is not being called through MCP, run `agent-guardrails plan --task "<task>"` to bootstrap the task contract and session.
3. Make the smallest implementation that fits the task contract.
4. Update `.agent-guardrails/evidence/current-task.md` with the real commands run and results, then finish with the `agent-guardrails check ... --review` command recommended by the runtime.
5. Update `docs/PROJECT_STATE.md` if the next step changed.

## Notes

- If the task needs broader scope, update the task contract first.
- If `check` fails, fix the scope or the tests before expanding the change.
