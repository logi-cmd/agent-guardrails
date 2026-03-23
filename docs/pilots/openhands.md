# OpenHands Pilot Record

Entry tier: Supplementary

## Pilot record

- Agent: `openhands`
- Repo type: `bounded-scope-demo` OSS sandbox repo
- User background: `Unknown`
- Time from install to first successful chat: `Unknown`
- Did the user reach the first chat? `No`
- Where did the user stop or hesitate? `Open OpenHands and send the first chat prompt after pasting the MCP snippet`
- Was manual explanation needed? `No`
- Did the user fall back to CLI? `No`
- Did the agent stay on the canonical MCP flow? `Unknown`
- Was the reviewer summary trusted? `Unknown`
- Strongest friction: `OpenHands still needs the MCP snippet pasted into the workspace settings before the first chat can happen`
- Most valuable feedback: `The bounded-scope sandbox can be prepared with the same setup-first runtime and repo-local helper files`
- Recommended next change: `Run the first actual OpenHands chat on the sandbox repo and record the reviewer summary`
- Should this entry block the next release? `No`

## Pilot status

- Setup completed on `bounded-scope-demo`
- Repo-local helper file written: `.agents/skills/agent-guardrails.md`
- MCP snippet generated for the OpenHands workspace settings
- Repo-local MCP config support is now available through `--write-repo-config` as `.openhands/mcp.json`
- First chat step still pending in OpenHands

## Fill-in order

1. Run `npx agent-guardrails setup --agent openhands`
2. Paste the MCP snippet into the OpenHands MCP server settings
3. Open OpenHands and send the first chat prompt
4. Fill in the pilot record immediately after the first successful run

## Canonical flow check

- `read_repo_guardrails`
- `start_agent_native_loop`
- implementation
- `finish_agent_native_loop`
