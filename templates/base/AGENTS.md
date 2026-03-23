# Agent Rules

## Read First

Before writing code, read:

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the specific files you plan to modify

## Working Style

- If this repo is wired into `agent-guardrails mcp`, prefer the canonical MCP flow:
  1. `read_repo_guardrails`
  2. `start_agent_native_loop`
  3. implement inside the declared scope
  4. `finish_agent_native_loop`
- If you are driving the runtime manually, run `agent-guardrails plan --task "<task>"` to bootstrap the task contract and session, then keep the implementation inside that contract.
- When the task is narrow or risky, add `--intended-files`, `--allowed-change-types`, `--allow-paths`, or `--required-commands` so the contract matches the smallest viable slice.
- Prefer existing patterns over new abstractions.
- Keep changes small and easy to review.
- List touched files before editing when the task is non-trivial.
- If context is missing, surface the gap instead of inventing details.
- When behavior changes, update or add tests.
- If the task touches review-critical paths, raise the task risk level and keep the evidence note explicit about reviewer focus.
- Before finishing, update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
- Before finishing, run the `agent-guardrails check ... --review` command recommended by the runtime with the commands that actually ran for the task.

## Definition Of Done

- The implementation matches current project conventions.
- The changed behavior has test coverage when appropriate.
- Required commands for the task were actually run and reported to `check`.
- The evidence note for the current task exists and reflects the real task outcome.
- Risks, assumptions, and follow-up work are documented.
