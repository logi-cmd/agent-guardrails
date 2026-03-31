# Claude Code Project Memory

Use `agent-guardrails` as the repo-local guardrail layer for this project.

## Read First

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. the target files for the task

## Working Flow

1. If Claude Code is connected to `agent-guardrails mcp`, prefer the canonical MCP flow:
   - `read_repo_guardrails`
   - `start_agent_native_loop`
   - implement inside the declared scope
   4. **MUST call `check_after_edit`** after EVERY file edit — this catches scope violations and guardrail issues immediately.
   5. If `check_after_edit` returns "issues" (errors): **STOP and fix before proceeding.** Do NOT continue editing. If clean: proceed with the next edit or finish.
   6. Before telling user "task done" → call `finish_agent_native_loop`
2. If you are driving the runtime manually, run `agent-guardrails plan --task "<task>"` to bootstrap the task contract and session.
3. Implement only within the task contract unless you update the scope first.
4. If behavior changes, include tests and update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`.
5. Before finishing, run the `agent-guardrails check ... --review` command recommended by the runtime with the commands that actually ran.

## Rules

- Prefer the existing repo structure over new abstractions.
- Keep changes small and reviewable.
- If `check` fails, fix scope or test coverage before widening the change.
- Use `agent-guardrails check --json` for automation or CI, not as the default local workflow.
