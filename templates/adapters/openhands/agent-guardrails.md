Use `agent-guardrails` as the repository guardrail layer for OpenHands.

- Read `AGENTS.md`, `docs/PROJECT_STATE.md`, and `README.md` before editing.
- If OpenHands is connected to `agent-guardrails mcp`, prefer:
  1. `read_repo_guardrails`
  2. `start_agent_native_loop`
  3. implement inside the declared scope
  4. **MUST call `check_after_edit`** after EVERY file edit — this catches scope violations and guardrail issues immediately.
  5. If `check_after_edit` returns "issues" (errors): **STOP and fix before proceeding.** Do NOT continue editing. If clean: proceed with the next edit or finish.
  6. Before telling user "task done" → call `finish_agent_native_loop`
- If you are driving the runtime manually, run `agent-guardrails plan --task "<task>"` to bootstrap the task contract and session.
- Keep the implementation inside the declared contract unless the task scope is explicitly updated.
- If behavior changes, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
- Before finishing, use the `agent-guardrails check ... --review` command recommended by the runtime and pass the commands that actually ran.
- Use `agent-guardrails check --json` for automation or CI, not as the default local path.
