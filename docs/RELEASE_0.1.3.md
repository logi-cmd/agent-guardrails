# agent-guardrails v0.1.3

`agent-guardrails` is a production-safety runtime for AI coding workflows.

This release focuses on the setup-first, conversation-first entry path. The goal is to make the first successful experience feel like:

1. install once
2. run `setup`
3. connect your agent
4. talk normally
5. let the runtime handle contract, evidence, and reviewer summary

## What changed

- Added `agent-guardrails setup --agent <name>` as the main first-run entry
- Added repo-local MCP write paths for safe targets, including Claude Code, Cursor, OpenHands, and OpenClaw
- Added pilot-ready docs and record templates for Claude Code, Cursor, Codex, OpenHands, and OpenClaw
- Updated the README with setup-first / MCP-first guidance in both English and Chinese
- Added a clear "rough idea is enough" chat example so users do not need to pre-write a perfect task contract
- Completed sandbox chats for Claude Code, Codex, and OpenClaw to validate the new flow end to end

## Why it matters

This release is about removing first-run friction.

The runtime already existed. The missing piece was a user path that felt natural for heavy vibe-coding users:

- no manual contract writing on day one
- no guessing which command to start with
- no need to understand the runtime internals before trying it

## Current pilot signal

- Claude Code: completed sandbox chat, reviewer summary trusted
- Codex: completed sandbox chat, reviewer summary trusted
- OpenClaw: completed sandbox chat, reviewer summary trusted
- Cursor: setup-only validation completed
- OpenHands: setup-only validation completed

## Install

```bash
npm install -g agent-guardrails
```

## Quick start

```bash
agent-guardrails setup --agent claude-code
```

If you want the repo-local config written automatically where it is safe:

```bash
agent-guardrails setup --agent claude-code --write-repo-config
```

Then open your existing agent chat and paste the generated MCP snippet if the setup output still asks you to.

## Notes

This release keeps the runtime and reviewer surface stable.
It does not change the core merge-gate model.
It makes the first conversation much easier to start.

## Release status

The package is published to npm as `agent-guardrails@0.1.3`, and the `v0.1.3` tag is pushed to GitHub.
If you want a GitHub release entry as well, create it manually and paste this release note there.
