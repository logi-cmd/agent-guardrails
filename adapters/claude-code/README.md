# Claude Code Adapter

Claude Code works best with `agent-guardrails` when the repo is set up once and the rest of the workflow stays in chat.

## Setup

```bash
agent-guardrails setup --agent claude-code
```

`setup` will:

- auto-initialize the repo if needed
- seed `CLAUDE.md`
- install `.agent-guardrails/hooks/claude-code-pre-tool.cjs`
- install `.agent-guardrails/hooks/claude-code-post-tool.cjs`
- register hooks in `.claude/settings.json`
- auto-write `.mcp.json` (no paste step needed)
- give you one recommended first chat message

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

## Repo-local helper file

`setup` seeds:

- `CLAUDE.md`
- `.agent-guardrails/hooks/claude-code-pre-tool.cjs`
- `.agent-guardrails/hooks/claude-code-post-tool.cjs`
- `.claude/settings.json`

These files reinforce the same runtime-backed workflow inside the repo and install deterministic Claude Code hooks for file-write interception.

## Fallback

If you need to inspect the runtime manually, fall back to:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for CI or automation, not as the default local chat path.
