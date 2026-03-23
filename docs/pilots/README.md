# Pilot Kit

Last updated: 2026-03-24

Use this folder to run and record the five planned setup-first external pilots.

Run order:

1. `claude-code`
2. `cursor`
3. `codex`
4. `openhands`
5. `openclaw`

For each entry:

1. run `npx agent-guardrails setup --agent <name>`
2. paste the generated MCP snippet into that agent's MCP config
3. send the generated first chat prompt
4. confirm the agent uses:
   - `read_repo_guardrails`
   - `start_agent_native_loop`
   - `finish_agent_native_loop`
5. record the result in the matching file in this folder

Files:

- [claude-code.md](./claude-code.md)
- [cursor.md](./cursor.md)
- [codex.md](./codex.md)
- [openhands.md](./openhands.md)
- [openclaw.md](./openclaw.md)
- [SUMMARY.md](./SUMMARY.md)

These records should stay short and operational. The goal is to decide whether the next step is:

- one more setup-friction pass
- better review-surface trust
- or a return to deeper runtime and risk-signal work
