# Codex Adapter

Codex does not need an extra repo-local adapter file. The main job is:

1. run `agent-guardrails setup --agent codex`
2. paste the generated MCP snippet into your Codex config (`~/.codex/config.toml`)
3. start chatting normally

## Setup

```bash
agent-guardrails setup --agent codex
```

`setup` will:

- auto-initialize the repo if guardrail files are missing
- print the MCP config snippet for Codex in TOML format
- tell you to paste it into `~/.codex/config.toml`
- give you one recommended first chat message

## Recommended first chat

Use the first chat prompt printed by `setup`, or start with:

> Use agent-guardrails for this repo. Read the repo guardrails, start the agent-native loop, implement the smallest safe change for: `<your task>`, then finish the loop with a reviewer-friendly summary.

## Canonical MCP flow

Codex should prefer this flow:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. implement inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` remain available as lower-level MCP tools, but they are not the default first-run path.

## Fallback

If you need to debug the runtime manually, fall back to:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for CI or automation, not as the main local chat workflow.
