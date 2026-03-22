# Adapters

This directory holds small, tool-specific guidance for teams that want to use `agent-guardrails` from a particular coding agent or workflow surface.

All adapter docs now use the same docs-first task loop:

1. Run `plan` with `--allow-paths`, `--required-commands`, and `--evidence ".agent-guardrails/evidence/current-task.md"`.
2. Implement inside the task contract.
3. Update the evidence note with the task name, commands run, notable results, and residual risk or `none`.
4. Run `check --commands-run ...` locally, or `check --json` in automation.

## Available

- [Codex](./codex/README.md)
- [Claude Code](./claude-code/README.md)
- [Cursor](./cursor/README.md)
- [OpenHands](./openhands/README.md)
- [OpenClaw](./openclaw/README.md)
