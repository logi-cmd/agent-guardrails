# OpenHands Adapter

OpenHands works best when `agent-guardrails` handles the runtime guardrails in the background and the repo still exposes the right repo-local context.

## Setup

```bash
agent-guardrails setup --agent openhands
```

`setup` will:

- auto-initialize the repo if needed
- seed `.agents/skills/agent-guardrails.md`
- auto-write `.openhands/mcp.json` (no paste step needed)
- give you one recommended first chat message

## Recommended first chat

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, implement the smallest safe change for: `<your task>`, then finish the loop with a reviewer-friendly summary.

## Canonical MCP flow

OpenHands should prefer:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. implement inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` remain lower-level tools, not the main first-run chat flow.

## Repo-local helper file

`setup` seeds:

- `.agents/skills/agent-guardrails.md`

## Pilot checklist

When you run the broader external pilot pass, record the OpenHands result with [docs/pilots/openhands.md](../../docs/pilots/openhands.md).

For OpenHands, the key questions are:

- is the setup-first path still understandable for a less standard agent surface
- does MCP config placement introduce unique friction compared with Claude Code or Cursor
- does the runtime summary still feel trustworthy in this orchestration-heavy context

## Fallback

If you need to drive the runtime manually, use:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for automation or CI orchestration, not as the main local workflow.
