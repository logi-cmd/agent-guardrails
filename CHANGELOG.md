# Changelog

## 0.7.1 - 2026-03-31

Bugfix release: setup now auto-writes repo-local MCP config without requiring `--write-repo-config` flag.

### Bug Fixes

- **Setup Auto-Write** (`lib/commands/setup.js`)
  - `setup --agent <name>` now auto-writes the repo-local MCP config for agents that support it (claude-code, cursor, openhands, openclaw, opencode, windsurf)
  - Previously required explicit `--write-repo-config` flag; now automatic when `safeRepoConfigPath` exists
  - `--write-repo-config` flag kept for backward compatibility but now a no-op

### Documentation

- Updated README.md examples to reflect auto-write behavior
- Updated adapter READMEs (cursor, claude-code, openhands, openclaw) with simplified setup instructions
- Updated pilot docs with new auto-write behavior

### Tests

- Updated `setup.test.js` to expect "point it at" for auto-write agents and "paste" for codex/gemini
- Updated `release.test.js` to check for "auto-writes" text instead of `--write-repo-config` flag

## 0.7.0 - 2026-03-31

Architecture release: unified daemon-hook architecture for real-time guardrail feedback.

### Breaking Changes

None — fully backward compatible. Hooks automatically fall back to independent checks when daemon is not running.

### New Features

- **Shared Result Reader** (`lib/daemon/hooks/shared-result-reader.cjs`)
  - Hooks now read cached `daemon-result.json` instead of running independent checks
  - Reduces hook latency from 1-4 seconds to <100ms when daemon is running
  - Automatic fallback to independent `agent-guardrails check --json` when daemon is not running

- **Daemon Status Markers** (`worker.js`)
  - `daemon-result.json` now includes `status: "running"` / `"completed"` for concurrency coordination
  - Hooks skip cached results while daemon check is in progress

- **Git Pre-commit Hook** (`lib/daemon/hooks/pre-commit-check.cjs`)
  - Blocks commits when error-level findings exist
  - Shows warnings but allows commits for warning-level findings
  - Auto-injected by `agent-guardrails start` into `.git/hooks/pre-commit`
  - Safe append: does not overwrite existing pre-commit hooks

- **OS Desktop Notifications** (`worker.js`)
  - Windows: PowerShell toast notification
  - macOS: osascript display notification
  - Linux: notify-send
  - Only fires when errors or warnings are found (no notification fatigue)

### Refactored

- **All 8 agent hooks** refactored to thin delivery layer
  - `daemon-check.cjs` (Claude Code) — uses shared result reader
  - `cursor-check.cjs` (Cursor) — uses shared result reader
  - `windsurf-check.cjs` (Windsurf) — uses shared result reader
  - `gemini-check.cjs` (Gemini CLI) — uses shared result reader
  - `codex-check.cjs` (Codex CLI) — uses shared result reader
  - `openhands-check.cjs` (OpenHands) — uses shared result reader
  - `openclaw-handler.cjs` (OpenClaw) — uses shared result reader
  - `opencode-plugin.js` (OpenCode) — reads daemon-result.json directly

### Architecture Diagram

```
Before:  Daemon → check → JSON → GUI (nobody watches)
         Hook → check AGAIN → stderr (duplicate, slow)

After:   Daemon → check → daemon-result.json (status: "completed")
                                       ↓
                              ┌────────┼──────────┐
                              ↓        ↓          ↓
                        Agent Hooks  Git Hook  OS Notification
                        (read JSON) (read JSON) (new)
                        ↓ <100ms    ↓ gate      ↓ desktop
                      Push to    Block/pass    Alert user
                      agent chat  commits
```

## 0.6.6 - 2026-03-30

Patch release fixing GUI Dashboard not displaying warnings count.

### Bug Fixes

- **Summary Counts**: Fixed `warnings` count showing as 0 in GUI
  - Changed from `f.level` to `f.severity` for filtering findings
  - Findings use `severity` field, not `level`

## 0.6.5 - 2026-03-30

Patch release fixing GUI Dashboard not updating on file changes.

### Bug Fixes

- **Daemon Info**: Fixed `checksRun` being double-counted on file changes
  - Removed duplicate `info.incrementChecks()`/`updateLastCheck()`/`save()` calls from file watcher callback
  - `runCheck()` now correctly updates info only once per actual check

- **GUI autoFix**: Fixed `autoFix` data not being passed to GUI state
  - `pushResult` now extracts and passes `autoFix` to state store
  - Auto-fix information now displays correctly in GUI Dashboard

## 0.6.4 - 2026-03-30

Patch release fixing GUI Dashboard statistics update.

### Bug Fixes

- **Daemon Info**: Fixed `checksRun` and `lastCheck` not updating after checks
  - `createCheckRunner` now receives `info` parameter
  - Check completion now updates `daemon-info.json` correctly
  - GUI can now display accurate "last check" timestamp

## 0.6.3 - 2026-03-30

Patch release fixing GUI Dashboard "Waiting..." issue.

### Bug Fixes

- **GUI Dashboard**: Fixed SSE response format causing malformed server-sent events
  - Changed `\\n` to `\n` in the initial `connected` event response
  - This fixes the real-time updates that were stuck on "Waiting..."
  
- **Daemon**: Added initial check on startup
  - Daemon now runs a guardrail check immediately when starting
  - Previously, the GUI showed "Waiting..." until a file change triggered a check
  - Now users see results right away when the dashboard opens

## 0.3.1 - 2026-03-25

Minor release focused on user experience improvement and Rough-Intent mode.

### New Features

- **Rough-Intent Mode**: Parse vague/fuzzy task descriptions and auto-generate task contracts
  - Supports 10 task types: auth, feature, bugfix, refactor, performance, api, ui, test, config, docs
  - Auto-infers allowed paths, test commands, risk level, and guard rules
  - Supports 3 modes: interactive (CLI), suggest (MCP), auto (CI/CD)
  - Bilingual support (en, zh-CN)

- **MCP Tool**: `plan_rough_intent` for third-party chatbot integration
  - Returns structured suggestions with confidence scores
  - Auto-accept mode when confidence >= 60%

### Improvements

- **README**: Added visual diagrams (workflow, before-after, rough-intent)
- **i18n**: Added Rough-Intent translation keys for English and Chinese
- **OSS/Pro Boundary**: Rough-Intent core is OSS; semantic inference is Pro (TODO)

### Example Usage

```bash
# Before: need detailed flags
agent-guardrails plan --task "Add login" --allow-paths "src/auth/" --required-commands "npm test"

# After: just describe what you want
agent-guardrails plan "加个登录功能" --lang zh-CN --yes
```

## 0.3.0 - 2026-03-25

Initial public npm release.

- Published to npm as `agent-guardrails`
- GitHub repository: https://github.com/logi-cmd/agent-guardrails
- Core features: scope validation, test validation, drift detection, protected paths

## 0.2.0 - 2026-03-24

Minor release focused on turning the OSS reviewer surface into a clearer production-readiness story, while shipping the first real Python/FastAPI proof slice.

- Stabilized the shared OSS trust surface so `check`, `check --json`, MCP, and the agent-native loop now agree on `verdict`, `deployReadiness`, and `postDeployMaintenance`
- Tightened deploy-readiness logic so real deploy blockers stay distinct from post-deploy watch items, instead of collapsing everything into `High-risk change`
- Added the first Python/FastAPI baseline proof slice through a runnable sandbox demo under `examples/python-fastapi-demo`
- Added the first Python/FastAPI OSS benchmark scenario, `python-fastapi-deploy-ready-pass`, so Python baseline credibility is now visible in the public benchmark suite
- Updated the README, proof page, benchmark docs, roadmap, strategy, commercialization, and market docs so Python support is described honestly as baseline proof rather than semantic parity
- Kept `plugin-python`, provider-specific deployment orchestration, and new top-level CLI commands out of scope for this release
- Preserved the OSS versus Pro boundary: OSS owns deploy-readiness judgment and post-deploy maintenance visibility, while deployment orchestration remains a later automation layer
- Re-verified the shipped path with `npm run demo:python-fastapi`, `npm test`, and `npm run benchmark`

## 0.1.3 - 2026-03-24

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
