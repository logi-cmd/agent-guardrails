# Changelog

## 0.1.3 - Draft

Post-pilot minor focused on setup-first onboarding, conversation-first entry, and the last bit of MCP entry friction.

- Added `agent-guardrails setup --agent <name>` as the setup-first entry that auto-initializes repos, generates MCP snippets, and prints a canonical first chat flow
- Added pilot-ready onboarding and repo-local MCP write paths for Claude Code, Cursor, OpenHands, and OpenClaw, plus setup-first docs for Codex
- Added ready-made pilot records and a summary template so setup friction, MCP paste friction, CLI fallback, and reviewer trust can be tracked consistently
- Updated the README and adapter docs with English and Chinese setup-first guidance, including a "rough idea is enough" chat example
- Validated the setup-first path with completed sandbox chats for Claude Code, Codex, and OpenClaw; Cursor and OpenHands remain setup-only validation at this stage
- Kept the runtime, continuity guidance, and reviewer surface stable while making the first-run experience much easier to adopt

## 0.1.2 - 2026-03-23

Minor release focused on the continuity layer MVP and runtime-backed review guidance.

- Added the first continuity layer MVP so `check`, MCP, and the agent-native loop now surface reuse targets, new surface files, continuity breaks, future maintenance risks, and continuity-specific next actions
- Added an OSS continuity detector for broadened implementation surface, likely parallel abstractions, and continuity-sensitive structure changes
- Updated the runtime-backed review surface and public docs so the new continuity guidance is visible in both CLI and agent-native flows

## 0.1.1 - 2026-03-23

Patch release focused on onboarding and cross-platform usability.

- Shortened the install guidance so the default path is `npm install -g agent-guardrails`
- Added `npx agent-guardrails ...` as the fallback when the global binary is not on `PATH`
- Made the onboarding docs and troubleshooting guidance shell-neutral across Windows, Linux, and macOS
- Added release regressions so the public docs stay platform-neutral

## 0.1.0 - 2026-03-22

Initial public release.

- Added a zero-dependency CLI with `init`, `plan`, and `check`
- Added presets for `node-service`, `nextjs`, `python-fastapi`, and `monorepo`
- Added task contracts with path, required-command, and evidence-file enforcement
- Added first-pass adapters for Codex, Claude Code, Cursor, OpenHands, and OpenClaw
- Added bounded-scope demo and install smoke validation
- Added GitHub Actions templates for both maintainers and initialized user repos
