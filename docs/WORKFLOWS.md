# Workflows

This page holds the deeper usage details that do not need to live on the README first screen.

## Supported agents

| Tool | Seeded file | Local workflow support | Automation guidance support |
| :-- | :-- | :-- | :-- |
| Claude Code | `CLAUDE.md` | Yes | Yes |
| Cursor | `.cursor/rules/agent-guardrails.mdc` | Yes | Yes |
| OpenCode | `AGENTS.md` | Yes | Yes |
| Codex | `.codex/instructions.md` | Yes | Yes |
| Gemini CLI | `GEMINI.md` | Yes | Yes |

## CLI commands

### `init`

Seeds a repo with:

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/PR_CHECKLIST.md`
- `.agent-guardrails/config.json`
- `.agent-guardrails/tasks/TASK_TEMPLATE.md`
- `.github/workflows/agent-guardrails.yml`

Example:

```bash
agent-guardrails init . --preset nextjs
```

If you are not sure what to type, start with `setup --agent <name>`, then use the manual flow only when you want to debug or inspect the runtime directly.

### `setup`

Auto-initializes the repo when needed, generates the MCP config snippet for a supported agent, and tells you exactly how to start chatting.

Example:

```bash
agent-guardrails setup --agent cursor
agent-guardrails setup --agent claude-code --preset nextjs
```

The happy path is:

1. run `setup`
2. paste the snippet into your agent
3. ask for the task in chat
4. let the runtime use `read_repo_guardrails`, `start_agent_native_loop`, and `finish_agent_native_loop`

### `plan`

Prints a bounded implementation brief and writes a task contract by default.

Example:

```bash
agent-guardrails plan --task "Add audit logging to the release approval endpoint" --allow-paths "src/,tests/" --intended-files "src/release/approve.js,tests/release/approve.test.js" --allowed-change-types "implementation-only" --risk-level medium --required-commands "npm test,npm run lint" --evidence ".agent-guardrails/evidence/current-task.md"
```

### `check`

Runs baseline guardrail checks against the current repo and git working tree.

Example:

```bash
agent-guardrails check --base-ref origin/main --commands-run "npm test,npm run lint" --review
```

For JSON output:

```bash
agent-guardrails check --base-ref origin/main --json
```

Minimal contract example:

```json
{
  "schemaVersion": 3,
  "task": "Add audit logging to the release approval endpoint",
  "preset": "node-service",
  "allowedPaths": ["src/", "tests/"],
  "intendedFiles": ["src/release/approve.js", "tests/release/approve.test.js"],
  "allowedChangeTypes": ["implementation-only"],
  "riskLevel": "medium",
  "requiredCommands": ["npm test", "npm run lint"],
  "evidencePaths": [".agent-guardrails/evidence/current-task.md"]
}
```

## CI and automation

For CI, hooks, or orchestrated agent runs, prefer machine-readable output:

```bash
agent-guardrails check --base-ref origin/main --json
```

If the workflow wants parity with locally reported commands, set:

```text
AGENT_GUARDRAILS_COMMANDS_RUN=npm test,npm run lint
```

The generated user-repo workflow template lives in `templates/base/workflows/agent-guardrails.yml`.
The maintainer CI for this package lives in `.github/workflows/guardrails.yml`.

For agent integrations, the recommended entry is the OSS MCP server:

```bash
agent-guardrails mcp
```

The MCP layer exposes the same runtime-backed judgment through these tools:

- `read_repo_guardrails`
- `suggest_task_contract`
- `start_agent_native_loop`
- `finish_agent_native_loop`
- `run_guardrail_check`
- `summarize_review_risks`

The loop tools are the recommended OSS agent-native slice:

- `start_agent_native_loop` bootstraps a runtime-backed contract, writes it to the repo, and seeds the evidence note
- `finish_agent_native_loop` updates evidence, runs `check`, and returns a reviewer-friendly summary from the same judgment path

## Presets

- `node-service`
- `nextjs`
- `python-fastapi`
- `monorepo`

Each preset adjusts file heuristics and recommended read-before-write paths while keeping the same mental model.

## Adapters

The core workflow is generic, but `agent-guardrails` ships first-pass adapters for:

- [Claude Code](../adapters/claude-code/README.md)
- [Cursor](../adapters/cursor/README.md)
- [OpenCode](../adapters/opencode/README.md)
- [Codex](../adapters/codex/README.md)
- [Gemini CLI](../adapters/gemini/README.md)

For Codex, the default `AGENTS.md` workflow is already the main integration surface, so `--adapter codex` is a docs-level adapter rather than an extra seeded file.

## FAQ

### Do I need all adapters?

No. Use only the adapter that matches your coding tool. The core workflow still works without tool-specific seed files.

### Do I need evidence files?

Only when the task contract declares them. In the default docs-first workflow, the evidence note is intentionally lightweight and meant to record what actually happened.

### When should I use `--json`?

Use `--json` for CI, hooks, or automation that needs machine-readable results. For normal local work, the human-readable output is the intended default.

### Does this work on Windows, Linux, and macOS?

Yes. The published CLI is exercised in CI on all three platforms, and the primary install and workflow commands are platform-neutral:

- `npm install -g agent-guardrails`
- `npx agent-guardrails init . --preset node-service`
- `npx agent-guardrails plan --task "..."`
- `npx agent-guardrails check --review`

Platform-specific commands only appear in docs when a shell-specific workaround is required.

### Why not just use another AI to recreate this?

You can copy prompts and a chat wrapper.
The harder part is copying a repo-aware runtime that keeps state across task bootstrap, validation, review, semantic drift checks, continuity guidance, and workflow integration.

The value of `agent-guardrails` is not "one clever prompt."
It is the merge-gate system that existing agent chats call while the runtime keeps getting more aligned to the repo over time.

### What if the global `agent-guardrails` command is not found?

Use `npx agent-guardrails ...` first. That works across shells and avoids PATH differences between Windows, macOS, and Linux.

## Current limits

This project is useful today as a repo-local guardrail layer, but it still has important limits:

- the heuristics are still intentionally lightweight and may need tuning for larger repos
- the semantic detectors are still string- and path-driven, not full AST or type-graph analyzers
- module boundaries still depend on explicit repo policy instead of automatic architecture inference
- source-to-test relevance is heuristic and should be treated as reviewer guidance plus contract enforcement, not coverage proof
- CI users still need to choose their canonical base ref, such as `origin/main`
