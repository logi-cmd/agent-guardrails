# OpenCode Adapter

OpenCode works best with `agent-guardrails` when the repo is set up once and the rest of the workflow stays in chat.

## Setup

```bash
agent-guardrails setup --agent opencode
```

`setup` will:

- auto-initialize the repo if needed
- seed `.opencode/rules/agent-guardrails.md`
- auto-write `opencode.json` (no paste step needed)
- give you one recommended first chat message

## Recommended first chat

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, make the smallest safe change for: `<your task>`, and finish with the reviewer summary.

## Canonical MCP flow

OpenCode should prefer:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. implement inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` still exist, but they are lower-level building blocks rather than the main first-run story.

## Pilot checklist

When you run the first real external pilot, capture the result with [docs/pilots/opencode.md](../../docs/pilots/opencode.md).

The success bar is:

- the user can get from install to first chat without hand-writing a contract
- MCP config is auto-written (no paste step needed)
- OpenCode stays on the canonical MCP flow
- the reviewer-friendly summary is understandable without explaining detector terms first

After the planned pilots are complete, roll the result into [docs/pilots/SUMMARY.md](../../docs/pilots/SUMMARY.md).

## Repo-local helper file

`setup` seeds:

- `.opencode/rules/agent-guardrails.md`

That file reinforces the same runtime-backed workflow inside the repo.

## Fallback

If you need to inspect the runtime manually, fall back to:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for CI or automation, not as the default local chat path.
