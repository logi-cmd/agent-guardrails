# Cursor Pilot Record

Entry tier: Secondary

## Pilot record

- Agent: `cursor`
- Repo type: `bounded-scope-demo` OSS sandbox repo
- User background: `Unknown`
- Time from install to first successful chat: `Unknown`
- Did the user reach the first chat? `No`
- Where did the user stop or hesitate? `Open Cursor and send the first chat prompt`
- Was manual explanation needed? `No`
- Did the user fall back to CLI? `No`
- Did the agent stay on the canonical MCP flow? `Unknown`
- Was the reviewer summary trusted? `Unknown`
- Strongest friction: `The sandbox setup completed, but the Cursor chat still has to be launched in a supported interactive Cursor environment`
- Most valuable feedback: `Repo-local setup and MCP config generation completed successfully on the bounded-scope demo sandbox`
- Recommended next change: `Run the first actual Cursor chat on the sandbox repo and record the reviewer summary`
- Should this entry block the next release? `No`

## Pilot status

- Setup completed on `bounded-scope-demo`
- Repo-local MCP config written: `.cursor/mcp.json`
- `.cursor/rules/agent-guardrails.mdc` seeded
- First chat step still pending in Cursor

## Fill-in order

1. Run `npx agent-guardrails setup --agent cursor --write-repo-config`
2. Open Cursor and send the first chat prompt
3. Fill in the pilot record immediately after the first successful run

## Canonical flow check

- `read_repo_guardrails`
- `start_agent_native_loop`
- implementation
- `finish_agent_native_loop`
