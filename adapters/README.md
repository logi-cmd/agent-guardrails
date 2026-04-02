# Adapters

Setup-first, MCP-first guidance for teams that want to use `agent-guardrails` with a specific coding agent.

## Setup

```bash
agent-guardrails setup --agent <name>
```

All adapters use the same product entry:

1. Run `setup`.
2. Paste the generated MCP snippet into the target agent config.
3. Ask for the task in chat.
4. Let the runtime guide the canonical loop:
   - `read_repo_guardrails`
   - `start_agent_native_loop`
   - implementation inside the declared scope
   - `finish_agent_native_loop`

## Available

- [Claude Code](./claude-code/README.md)
- [Codex](./codex/README.md)
- [Cursor](./cursor/README.md)
- [Gemini CLI](./gemini/README.md)
- [OpenCode](./opencode/README.md)
