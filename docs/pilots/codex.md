# Codex Pilot Record

Entry tier: Secondary

## Pilot record

- Agent: `codex`
- Repo type: `bounded-scope-demo` OSS sandbox repo
- User background: `Unknown`
- Time from install to first successful chat: `Unknown`
- Did the user reach the first chat? `Yes`
- Where did the user stop or hesitate? `None`
- Was manual explanation needed? `No`
- Did the user fall back to CLI? `No`
- Did the agent stay on the canonical MCP flow? `Yes`
- Was the reviewer summary trusted? `Yes`
- Strongest friction: `Codex still requires a manual config paste into ~/.codex/config.toml before the first chat can happen`
- Most valuable feedback: `The bounded-scope sandbox can be prepared with the same setup-first runtime even when no repo-local helper file is needed, and the first chat can complete successfully once the snippet is in place`
- Recommended next change: `Compare Codex friction against Claude Code and Cursor, then decide whether to remove or automate the last MCP paste step`
- Should this entry block the next release? `No`

## Pilot status

- Setup completed on `bounded-scope-demo`
- No agent-specific repo-local helper file was needed
- MCP snippet generated for `~/.codex/config.toml`
- First chat completed successfully in Codex

## Fill-in order

1. Run `npx agent-guardrails setup --agent codex`
2. Paste the MCP snippet into `~/.codex/config.toml`
3. Open Codex and send the first chat prompt
4. Fill in the pilot record immediately after the first successful run

## Canonical flow check

- `read_repo_guardrails`
- `start_agent_native_loop`
- implementation
- `finish_agent_native_loop`

## First chat prompt

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, implement the smallest safe change for: `<your task>`, then finish with a reviewer summary.
