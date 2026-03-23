# Claude Code Adapter

Claude Code works best with `agent-guardrails` when the repo is set up once and the rest of the workflow stays in chat.

This is still the primary path in the broader five-entry external pilot.

## Setup

```bash
agent-guardrails setup --agent claude-code
```

If you want setup to also write the repo-local MCP file for you:

```bash
agent-guardrails setup --agent claude-code --write-repo-config
```

`setup` will:

- auto-initialize the repo if needed
- seed `CLAUDE.md`
- print the MCP config snippet for Claude Code
- tell you where to paste it
- give you one recommended first chat message
- leave only one manual step: paste the snippet and start chatting

With `--write-repo-config`, setup can also write `.mcp.json` directly so the remaining step becomes just opening Claude Code and sending the first chat message.

## Recommended first chat

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, make the smallest safe change for: `<your task>`, and finish with the reviewer summary.

## Canonical MCP flow

Claude Code should prefer:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. implement inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` still exist, but they are lower-level building blocks rather than the main first-run story.

## Pilot checklist

When you run the first real external pilot, capture the result with [docs/pilots/claude-code.md](../../docs/pilots/claude-code.md).

The success bar is:

- the user can get from install to first chat without hand-writing a contract
- MCP config paste is the only remaining manual setup step
- Claude Code stays on the canonical MCP flow
- the reviewer-friendly summary is understandable without explaining detector terms first

After the five planned pilots are complete, roll the result into [docs/pilots/SUMMARY.md](../../docs/pilots/SUMMARY.md).

## Repo-local helper file

`setup` seeds:

- `CLAUDE.md`

That file reinforces the same runtime-backed workflow inside the repo.

## Fallback

If you need to inspect the runtime manually, fall back to:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for CI or automation, not as the default local chat path.
