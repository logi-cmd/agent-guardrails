# Cursor Adapter

Cursor should use `agent-guardrails` as the repo safety runtime behind the chat, not as a manual command checklist.

## Setup

```bash
agent-guardrails setup --agent cursor
```

`setup` will:

- auto-initialize the repo if needed
- seed `.cursor/rules/agent-guardrails.mdc`
- auto-write `.cursor/mcp.json` (no paste step needed)
- give you one recommended first chat message

## Recommended first chat

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, implement the smallest safe change for: `<your task>`, then finish the loop and summarize the reviewer-facing result.

## Canonical MCP flow

Cursor should prefer:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. implement inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` are still available, but they are not the recommended first-run path.

## Repo-local helper file

`setup` seeds:

- `.cursor/rules/agent-guardrails.mdc`

## Pilot checklist

When you run the broader external pilot pass, record the Cursor result with [docs/pilots/cursor.md](../../docs/pilots/cursor.md).

For Cursor, the key questions are:

- does setup stay clear enough for a heavy vibe-coding user to reach first chat quickly
- is MCP config paste still the main blocker
- does the reviewer summary feel worth keeping versus falling back to raw chat output

## Fallback

If you need the manual runtime path, use:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for automation or CI integrations, not as the primary local chat loop.
