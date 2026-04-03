# Gemini CLI Adapter

Gemini CLI should treat `agent-guardrails` as the repo safety runtime behind the chat loop, not as a manual command checklist.

## Setup

```bash
agent-guardrails setup --agent gemini
```

`setup` will:

- auto-initialize the repo if needed
- seed `GEMINI.md`
- write `.gemini/settings.json` with MCP server config and BeforeTool/AfterTool hooks
- install repo-local hook scripts for scope checking and post-edit verification
- give you one recommended first chat message

## Native hooks

`setup` registers two Gemini CLI native hooks in `.gemini/settings.json`:

| Hook | Event | Matcher | Purpose |
|------|-------|---------|---------|
| `gemini-pre-tool.cjs` | `BeforeTool` | `write_file\|replace\|edit\|run_shell_command` | Scope check before file writes |
| `gemini-post-tool.cjs` | `AfterTool` | `write_file\|replace\|edit\|run_shell_command` | Post-check after file writes |

Both hooks read the repo's `.agent-guardrails/config.json` and enforce allowed-paths scope. The pre-tool hook can deny out-of-scope writes. The post-tool hook surfaces guardrails findings as system messages.

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

## Repo-local helper files

`setup` seeds:

- `GEMINI.md`
- `.agent-guardrails/hooks/gemini-pre-tool.cjs`
- `.agent-guardrails/hooks/gemini-post-tool.cjs`
- `.gemini/settings.json`

## Fallback

If you need the manual runtime path, use:

```bash
agent-guardrails plan --task "<task>"
agent-guardrails check --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for automation or CI, not as the default local loop.
