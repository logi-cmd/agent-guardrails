# Gemini CLI Adapter

Gemini CLI should treat `agent-guardrails` as the repo safety runtime behind the chat loop, not as a manual command checklist.

## Setup

```bash
agent-guardrails setup --agent gemini
```

`setup` will:

- auto-initialize the repo if needed
- seed `GEMINI.md`
- print the MCP snippet to paste into `~/.gemini/settings.json`
- give you one recommended first chat message

## Recommended first chat

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, implement the smallest safe change for: `<your task>`, then finish the loop with a reviewer-friendly summary.

## Canonical MCP flow

Gemini CLI should prefer:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. implement inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` remain available as lower-level MCP tools, but they are not the main first-run path.

## Repo-local helper file

`setup` seeds:

- `GEMINI.md`

## Fallback

If you need the manual runtime path, use:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for automation or CI, not as the default local loop.
