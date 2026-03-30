# Adapters

This directory holds setup-first, MCP-first guidance for teams that want to use `agent-guardrails` from a particular coding agent.

All adapter docs now use the same product entry:

1. Run `agent-guardrails setup --agent <name>`.
2. Paste the generated MCP snippet into the target agent config.
3. Ask for the task in chat.
4. Let the runtime guide the canonical loop:
   - `read_repo_guardrails`
   - `start_agent_native_loop`
   - implementation inside the declared scope
   - `finish_agent_native_loop`

Manual `plan` / `check` still exist as fallback infrastructure, but they are no longer the primary first-run story.

## Available

- [Claude Code](./claude-code/README.md)
- [Codex](./codex/README.md)
- [Cursor](./cursor/README.md)
- [Gemini CLI](./gemini/README.md)
- [OpenClaw](./openclaw/README.md)
- [OpenCode](./opencode/README.md)
- [OpenHands](./openhands/README.md)
- [Windsurf](./windsurf/README.md)
