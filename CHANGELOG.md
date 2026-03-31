# Changelog

## 0.7.7 - 2026-03-31

GUI removal release: Removed GUI Dashboard in favor of MCP-based chat feedback.

### Removed

- **GUI Dashboard** (`lib/daemon/gui-server.js`) — deleted
- **Diagnostic page** (`lib/daemon/gui-diagnostic.html`) — deleted
- **Demo page** (`docs/images/gui-dashboard-demo.html`) — deleted
- **`--no-gui` flag** — no longer needed, daemon is now always headless
- **`openBrowser()` function** — removed from `lib/daemon/worker.js`
- **GUI server import and startup logic** — removed from `lib/daemon/worker.js`
- **`guiServer` parameter** — removed from `createCheckRunner()`

### Changed

- **Daemon mode** — now always runs headless, results cached in `daemon-result.json`
- **README** — removed all GUI Dashboard sections, updated daemon docs to focus on MCP chat feedback
- **`lib/daemon/worker.js`** — cleaned up imports (removed `exec`, fixed `spawnSync` ESM import)

### What Replaced It

Guardrail results now appear directly in the AI chat dialog via:
- `check_after_edit` MCP tool — instant feedback after file edits
- `finish_agent_native_loop` MCP tool — summary at task completion

## 0.7.6 - 2026-03-31

Template hardening release: `check_after_edit` instructions strengthened across all 9 template files. Clarified that MCP chat feedback is the only real-time guardrail channel.

### Templates

- **All 8 adapter templates** + **base AGENTS.md** updated with:
  - Explicit statement: `check_after_edit` is the **ONLY** way guardrail results appear in the AI chat
  - Daemon GUI is explicitly labeled as secondary display only
  - New rule: when user says they modified files manually, agent must call `check_after_edit` to validate
  - New rule: do NOT batch multiple edits before checking — check after EACH edit
  - New rule: do NOT tell user "done" without calling `finish_agent_native_loop`
- **Claude Code adapter** (`templates/adapters/claude-code/CLAUDE.md`): Fixed broken numbering (3→4→5→6 was malformed)

## 0.7.5 - 2026-03-31

Active guardrails release: MCP tool responses now include human-readable summaries so check results appear directly in the AI chat. New `check_after_edit` tool provides instant post-edit feedback.

### MCP Server (`lib/mcp/server.js`)

- **Human-readable tool responses**: `start_agent_native_loop`, `check_after_edit`, and `finish_agent_native_loop` now return a human-readable text block as the FIRST content block, followed by JSON data. This makes guardrail results visible in the user's chat dialog without the agent needing to parse JSON.
- **New helper**: `createHumanReadableJsonResult(data, humanSummary)` — produces a two-block content array (text first, JSON second).
- **New tool**: `check_after_edit` — cache-first instant feedback after file edits. Reads `daemon-result.json` directly via `fs` (< 2s), falls back to `executeCheck()` if no daemon result is available. Returns human-readable status for clean / issues-found / stale / no-config states.
- **Restored tool definition**: `suggest_task_contract` was accidentally removed from `TOOL_DEFINITIONS` in a previous edit; restored to its correct position.

### Templates

- **Base AGENTS.md** (`templates/base/AGENTS.md`): Added "CRITICAL: Post-Edit Validation" section instructing agents to call `check_after_edit` after each file edit.
- **All 8 adapter templates** updated to include `check_after_edit` step in the MCP workflow:
  - Claude Code, Cursor, Codex, Gemini, OpenCode, OpenHands, OpenClaw, Windsurf

### Tests

- **`tests/mcp.test.js`**: Updated tool list assertion to include `check_after_edit`; added basic `check_after_edit` handler test.

## 0.7.4 - 2026-03-31

Verification release: Verified all 8 agent adapters have correct MCP config formats. Added missing adapter documentation.

### Verification

- **Codex CLI** (`~/.codex/config.toml`)
  - Format: TOML with `[mcp_servers.xxx]` table structure ✅
  - Config verified correct

- **Gemini CLI** (`~/.gemini/settings.json`)
  - Format: Standard JSON with `mcpServers` object ✅
  - Config verified correct

### Documentation

- Created `adapters/gemini/README.md`
- Created `adapters/windsurf/README.md`
- Created `adapters/opencode/README.md`
- Updated `adapters/README.md` to list all 8 agents
- Updated `adapters/codex/README.md` to clarify TOML format and user-global path

### Tests

- Added `gemini` write-repo-config test (no-op, like openclaw/windsurf)

## 0.7.3 - 2026-03-31

Bugfix release: Fixed incorrect MCP config paths for OpenClaw and Windsurf agents.

### Bug Fixes

- **OpenClaw MCP Config** (`lib/setup/agents.js`)
  - OpenClaw adapter now uses correct path `~/.openclaw/openclaw.json` instead of `.openclaw/mcp.json`
  - Config format updated to OpenClaw's native `mcp.servers` structure
  - Changed from repo-local to user-global config (no auto-write)

- **Windsurf MCP Config** (`lib/setup/agents.js`)
  - Windsurf adapter now uses correct path `~/.codeium/windsurf/mcp_config.json` instead of `.windsurf/mcp.json`
  - Changed from repo-local to user-global config (no auto-write)

### Documentation

- Updated README.md setup section to reflect corrected paths
- Updated adapters/openclaw/README.md to reflect user-global config behavior

### Tests

- Updated `setup.test.js` agent expectations for openclaw and windsurf
- Changed openclaw and windsurf tests to expect "paste" behavior instead of "point it at"

## 0.7.2 - 2026-03-31

Bugfix release: OpenCode adapter now writes the correct config format that OpenCode actually recognizes.

### Bug Fixes

- **OpenCode MCP Config** (`lib/setup/agents.js`)
  - Changed OpenCode adapter to write `opencode.json` instead of `.opencode/mcp.json`
  - Config format updated to use OpenCode's native `opencode.json` schema
  - Previously wrote standard MCP JSON format which OpenCode does not recognize

- **Setup Merge Behavior** (`lib/commands/setup.js`)
  - `maybeWriteRepoConfig()` now merges with existing config files instead of overwriting
  - Preserves user settings when updating existing OpenCode configs

### Documentation

- Updated README.md setup details section to reflect `opencode.json` path for opencode agent

### Tests

- Updated `setup.test.js` opencode write test assertions to expect `opencode.json` instead of `.opencode/mcp.json`

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
