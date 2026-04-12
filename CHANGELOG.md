# Changelog

## 0.19.2 - 2026-04-12

### Added: Pro go-live verdict surfaced in OSS check output

- `check` now promotes the Pro `goLiveDecision` to the first visible layer of CLI output when `@agent-guardrails/pro` is installed.
- JSON output now includes a top-level `goLiveDecision` field so downstream tooling can read the verdict directly.
- Existing deep signals remain available in `review`, `runtime.nextActions`, and `deployHandoff` for explanation and follow-up.

### Added: OSS Pro status entry

- `agent-guardrails pro status` and `agent-guardrails pro-status` show Pro install state, license state, and the demo go-live decision from the OSS CLI.
- When the installed Pro package provides richer status metadata, the CLI now also surfaces readiness, activation checklist, capability value, and buyer-facing value moments.
- The command degrades cleanly when `@agent-guardrails/pro` is not installed, so OSS users can verify upgrade readiness without entering the private repo.
- `README.md`, `README.zh-CN.md`, and `docs/PROJECT_STATE.md` were synced to describe the new status entry.

### Tests

- Added coverage for the Pro-installed CLI path, JSON path, and verdict rendering path.
- Re-validated with `npm test` and `npm pack --dry-run`.

## 0.19.1 - 2026-04-10

### Added: Pro interface layer

- `lib/check/pro/index.js` — dynamic import stub for `@agent-guardrails/pro`. Silent degradation when Pro package is not installed; process-level cache.
- 3 hook points in `check.js`: `tryEnrichReview` (enriches review after buildReview), `getProNextActions` (appends Pro next actions), `formatProCategoryBreakdown` (renders per-category score breakdown in CLI).
- Transparent upgrade path: `npm install @agent-guardrails/pro` activates Pro features without config changes.
- `tests/pro-stub.test.js` — 7 tests covering degradation, null safety, and import caching.

### Changed: OSS release discipline and documentation system

- Added canonical build docs for product blueprint, technical spec, Pro Local spec, implementation plan, acceptance criteria, and release process.
- Added `docs/RELEASE_PROCESS.md` covering GitHub release flow, npm publish flow, `logi-cmd` identity requirements, release notes, and required doc updates.
- Updated `README.md` to link the release process.
- Updated `package.json` author metadata to `logi-cmd` and added public `publishConfig`.
- Re-validated package contents with `npm pack --dry-run` to keep non-essential docs out of the npm tarball.

### Fixed: CLI and install-smoke process would hang on imported chat cleanup timer

- `lib/chat/session.js` now `unref()`s the periodic session cleanup timer so short-lived CLI commands like `help` can exit normally.
- Restored reliable completion for `node ./tests/install-smoke.js`.
- Restored reliable completion for the full `npm test` suite.

## 0.19.0 - 2026-04-08

### Fixed: Quality audit findings (P0+P1)

- **P0**: `.gitignore` auto-fix had typo `.agent-guardrals` → `.agent-guardrails` — daemon.log was not being ignored
- **P0**: `checkSyntax()` replaced `new Function()` with `node --check` subprocess — fixes ESM syntax validation and removes unsafe pattern
- **P0**: `validator.js` replaced `exec()` with `execFileSync()` — eliminates shell injection surface
- **P0**: Deleted dead code `getSuggestableIssues()` from fix/rules.js
- **P1**: Extracted `toBoolean()` and `getParentScope()` to `utils.js` — eliminates 5 duplicate definitions
- **P1**: `secrets-safety` detector now scans all files instead of stopping at first match
- **P1**: `printTextResult()` migrated ~20 hardcoded strings to i18n system — new `check.*` keys in both locales
- **P2**: Registered `auto-fix.test.js` in test runner
- **P2**: Added `generate-agents` to README CLI Reference tables

## 0.18.1 - 2026-04-07

### Added: OSS navigation features complete

- **Warning recovery guidance (#32)**: `buildRecoveryGuidance()` now provides actionable fix suggestions for WARNING findings, not just errors. 9 new recovery templates added (file budget, breadth, config change, unsafe patterns, sensitive files, large change, scope, continuity).
- **Suppress/acknowledge hints (#33)**: Findings now carry a `skipKey` field. CLI output shows `💡 To suppress: add '--acknowledged-skips <key>' to your plan command` for error-level findings that can be downgraded. New skip keys: `breadth`, `big-bang`.
- **Big Bang warning (#37)**: New `big-bang-warning` detector fires when a change exceeds 15 files, 3+ top-level directories, and 300+ added lines simultaneously. Suggests splitting into focused tasks. Suppressed via `--acknowledged-skips big-bang`.
- **Scope expansion guidance (#38)**: When scope violations are detected, nextActions now include specific instructions on how to expand scope (via `--allow-paths` or `--acknowledged-skips scope`).
- **Unified verdict system**: `result.verdict` now uses `scoreVerdict` enum values when the default "Safe to review" would apply, producing more informative verdicts like "Pass with concerns" and "Needs attention".
- **15 new i18n keys** in both English and Chinese (recovery guidance, suppress hints, Big Bang finding/action, scope expansion guidance, verdict strings).

## 0.18.0 - 2026-04-07



### Fixed: Phase 0 bug fixes and doc alignment

- **scoring.js weights now work**: `computeCompositeScore()` now applies per-category weights when provided. Previously the `weights` parameter was accepted but completely ignored — a functional bug.
- **i18n English locale fixed**: 4 strings in `lib/i18n.js` that were Chinese in the English locale (`ciDetected`, `hookInjected`, `hookSkipped`, `slashInstalled`) are now proper English.
- **CLI help i18n**: `generate-agents` command description is now i18n-backed (`cli.generateAgentsSummary`) instead of a hardcoded string.
- **OSS_PRO_BOUNDARY.md updated**: Trust Score (0-100) is now correctly marked as OSS (shipped in v0.17.0), not Pro-only. Pro differentiation clarified: per-category breakdown, historical trends, confidence calibration.
- **README feature list updated**: README.md and README.zh-CN.md now list security hygiene warnings (v0.16.0) and trust score (v0.17.0) as shipping features.

## 0.17.0 - 2026-04-07

### New: composite scoring system

The binary pass/fail evaluation is now supplemented with a 0-100 **trust score** and graduated verdicts. Every check run produces a score based on findings, displayed as a visual bar in CLI and MCP output.

- **Trust score**: starts at 100, each error deducts 15 points, each warning deducts 5 points, clamped at 0
- **Graduated verdicts**: safe-to-deploy (≥90) / pass-with-concerns (≥70) / needs-attention (≥40) / high-risk (<40) / blocked (any error)
- **Score bar**: `📊 Trust Score: ████████░░ 80/100 (pass-with-concerns)` in all output channels
- **Configurable weights**: optional `scoring.weights` in config.json per category (scope/validation/consistency/continuity/performance/risk), auto-normalized to sum to 100
- **Backward compatible**: `ok` and exit code logic unchanged — errors still cause exit code 1

### Chores: OSS debt cleanup

- Removed 3 TODO comments (parser.js, CHANGELOG.md, fix/rules.js)
- Synced self-repo config.json with template preset (maxChangedFilesPerTask 12→20, added mutation block)
- Removed dead `getSuggestableIssues` export from fix/index.js (no tier2 rules exist)
- Removed reference to unpublished `@agent-guardrails/plugin-python` from python-fastapi preset
- Added type-check guidance to nextjs and monorepo preset constraints and definition-of-done

## 0.16.1 - 2026-04-07

### Changed: file budget severity downgraded to warning, default raised to 20

The file-budget check (`changed-file-budget-exceeded`) now produces a **warning** instead of an **error**. The default `maxChangedFilesPerTask` is raised from 12 to 20 (monorepo preset: 24). This reflects real-world AI coding patterns where legitimate tasks sometimes exceed the old 12-file budget, and an error-level block was too aggressive.

Changes:
- `consistency-budgets` detector severity: `error` → `warning`
- Default fallback in `policy.js`: `12` → `20`
- Preset updates: `node-service` 12→20, `generic` 12→20, `nextjs` 14→20, `static-frontend` 12→20, `python-fastapi` 12→20, `monorepo` 16→24

## 0.16.0 - 2026-04-06

### New: basic security hygiene warnings (OSS)

Added three new warning-only detectors to catch the most common security issues introduced by AI coding agents:

 - **Hardcoded secrets detection** — warns when diff contains potential API keys, passwords, tokens, and other credentials (uses regex matching, warning-only, does not block commits)
 - **Unsafe pattern detection** — warns when diff contains `eval()`, `innerHTML`| `dangerouslySetInnerHTML`| `chmod 777`| `cors(*)`| `exec()`| `setTimeout(..., 0)` and similar patterns (warning-only)
 - **Sensitive file change detection** — warns when `.env`, `credentials`, private key files, or `.htpasswd` are created or modified (warning-only, does not block commits)

 All three detectors are config-gated (default: enabled) and produce warnings only, They do not replace dedicated security tools like Snyk or SonarQube/ CodeQL — they complement them existing scope/drift/test checks pipeline.

## 0.15.1 - 2026-04-06

### Fix: suppress false config-or-migration warning for `.agent-guardrails/` files

Files under `.agent-guardrails/` (e.g. `config.json`, `task-contract.json`, `evidence/`) are internal to agent-guardrails and were incorrectly classified as project config changes, triggering a `config-or-migration-change` warning on every `check` run.

- Added `guardrails-internal` change type in `classifyChangeType()` — `.agent-guardrails/` paths now return `"guardrails-internal"` instead of `"config"`.
- Removed `.agent-guardrails/` from the `config` classification branch.
- Project config files (`package.json`, `tsconfig.json`, `.github/`, etc.) are completely unaffected.

## 0.15.0 - 2026-04-06

### New presets: static-frontend and generic

Added two new presets to cover project types that previously had no suitable configuration:

- **`static-frontend`** — for pure HTML/CSS/JS/Vue/Svelte frontend projects (no test commands required, sourceExtensions include `.html`, `.css`, `.vue`, `.svelte`, no protected areas for auth/billing)
- **`generic`** — universal fallback preset for any project type (no assumptions about directory structure, test framework, or language)

### Changed default preset from `node-service` to `generic`

The `init` and `setup` commands now default to `generic` preset instead of `node-service`, so users with non-Node.js projects get a usable configuration out of the box.

## 0.14.5 - 2026-04-06

### Fix: createFinding runtime error

Fixed `createFinding is not defined` error that occurred when the base-ref fallback warning was triggered during `check`. The `createFinding` function was used in `check.js` but not included in the import from `../check/finding.js`.

## 0.14.4 - 2026-04-06

### Fix: base-ref fallback when remote branch not found

When `--base-ref` points to a non-existent ref (e.g. `origin/main` in a project without a remote), the check now falls back to `git diff HEAD` to detect working-tree changes instead of returning 0 files with an error.

- Added fallback logic in `listChangedFilesFromBaseRef()`: tries `git diff HEAD` when the primary `baseRef...HEAD` diff fails
- Added `base-ref-fallback` warning finding with actionable guidance (e.g. "add a remote for full baseline comparison")
- Added i18n keys for the fallback warning in both English and Chinese

## 0.14.3 - 2026-04-06

### Docs: add prerequisites section

Added a "Prerequisites" section to both English and Chinese READMEs clarifying that the project must be a git repository, since all change detection relies on `git diff`.

## 0.14.2 - 2026-04-06

### Docs: README cleanup

Removed internal content not intended for public users from both English and Chinese READMEs:

- Removed commercial strategy section ("Why pay if AI coding is already strong?")
- Removed internal engineering notes ("Engineering Harness Priorities")
- Removed maintainer development guide ("Maintainer Verification Loop")
- Removed "Learn more" section with links to unpublished internal docs
- Removed Docs links to unpublished files (Workflows, Roadmap, Contributing)
- Removed geographic restriction ("overseas") from target audience description

## 0.14.1 - 2026-04-06

### Bug Fix: Parent Directory Detection

Fixed a bug where running `agent-guardrails check` (and other commands) inside a subdirectory of a larger git repository would incorrectly use the parent repository's `.git` for change detection. This caused the tool to report "no changes detected" even when files in the project had been modified.

#### What changed

- **`resolveGitRoot()` and `resolveRepoRoot()`** — new utilities in `lib/utils.js` that correctly determine the git repository root and the agent-guardrails project root using `git rev-parse --show-toplevel` with config-based fallback
- **`listChangedFiles()` and `listChangedFilesFromBaseRef()`** — now execute git commands at the real git root and filter/relativize paths to the project directory, so changes are correctly scoped
- **All CLI entry points** — `check`, `plan`, `doctor`, `setup`, `enforce`, `unenforce`, `mcp`, `start`, `stop`, `status` now use `resolveRepoRoot(process.cwd())` instead of bare `process.cwd()`
- **`enforce.js`** — removed the buggy `findRepoRoot()` that walked up directory tree to find `.git` without verifying config location

#### Cross-platform

- Windows MSYS Git path normalization (`/c/Users/...` → `C:/Users/...`)
- `path.delimiter` used for env var splitting (works on all platforms)
- Path comparison normalized to `/` separators

#### Tests

- `listChangedFilesCorrectlyRelativizesSubdirectoryPaths` — parent repo + sub-directory scenario
- `resolveRepoRootPrefersConfigAtStartDir` — cwd config takes priority
- `resolveRepoRootFallsBackToGitRoot` — git root config as fallback

## 0.14.0 - 2026-04-04

### Mutation Testing Integration + Reviewer Alignment

Optional lightweight built-in mutation testing is now fully integrated into the OSS check pipeline. Working-tree diff parsing fixed. Test coverage enhanced. Reviewer warnings reduced.

#### New features

- **Mutation testing integrated** — `lib/check/mutation-tester.js` wired into OSS detector pipeline via `lib/check/detectors/oss.js`
- **Baseline-first execution** — runs test command first; emits warning instead of misleading score if baseline fails
- **Config-gated, default-disabled** — all presets include `checks.mutation` config (enabled: false)
- **Warning-only output** — survivors produce `mutation-survivors-detected` warning, not blocker

#### Fixes

- **Working-tree diff parsing** — `lib/utils.js` `git status --porcelain` no longer truncates leading characters from paths
- **Async risk in tests** — `tests/check.test.js` `captureLogs` converted from `.then()` chains to `async/await`

#### Test coverage

- Direct mutation detector test in `tests/check.test.js`
- Direct `listChangedFiles()` porcelain parsing test in `tests/check.test.js`
- Direct i18n mutation message export test in `tests/i18n.test.js`

#### Reviewer alignment

- Eliminated public surface drift warning by declaring full export surface in task contract
- Reduced async-risk warnings from 5-layer to 0-layer `.then()` nesting
- Tightened expected public surface and test target declarations

## 0.13.0 - 2026-04-03

### OSS Baseline Complete

All 5 runtime/output harness gaps closed. OSS is now a fully functional merge gate.

#### New features

- **Continuity and performance findings** surface in `check --review` text output and summary
- **Review finding suppression** — reduces redundant noise (e.g. overlapping continuity warnings) without hiding raw findings
- **Bash tool interception** expanded to Claude daemon PostToolUse hooks
- **Gemini CLI setup** installs native BeforeTool / AfterTool hooks
- **`agent-guardrails doctor`** — minimal OSS installation diagnostic
- **`enforce --all` / `unenforce --all`** — inject guardrail instructions into agent system-level files

#### Improved

- All OSS detector messages now use i18n-backed strings (en + zh-CN)
- Performance findings include real file-size checks via `fs.statSync`
- CI workflow uses cache-aware npm setup plus lightweight static verification

#### Docs

- Product positioning docs for overseas solo devs and small teams
- Landing page copy, FAQ, DIY comparison, and pricing teaser
- README updated with "Who it is for", "Why pay", and "Learn more" sections

## 0.12.0 - 2026-04-02

### Harness Engineering Audit Fixes

Based on a harness-engineering skill audit across 8 dimensions (execution loop, agent topology, context management, failure recovery, hook completeness, evaluation design, loop detection, tool boundaries).

#### Critical

- **Bash file-write interception**: Claude Code hooks now intercept `sed -i`, `tee`, `echo >`, `>>`, `mv`, `cp` via the Bash tool, closing the largest harness gap)

#### High

- **Circuit breaker**: Daemon worker stops retrying after 5 consecutive failures (60s cooldown)
- **State-hash dedup**: Daemon skips re-check when file set unchanged since last successful check
- **Structured errors**: Agent loop returns `{ error, true, code, "..." }` instead of `null`
- **Session purge**: `purgeExpired()` now runs every 10 minutes, preventing memory leaks

#### Medium

- **Review buckets**: `continuity` and `performance` findings now appear in review output (previously silently dropped)

## 0.11.0 - 2026-04-02

### Phase 1: OpenCode Fixes

- Fixed `init.js`: Now writes to `AGENTS.md` (root level) instead of `.opencode/rules/agent-guardrails.md`
- Fixed `setup.js`: Auto-installs plugin to `.opencode/plugins/guardrails.js`
- Updated tests: `init.test.js`, `setup.test.js`, `install-smoke.js`
- Removed pilot doc references from all adapter READMEs

### Phase 2: Claude Code Hooks

- Added `templates/hooks/claude-code-pre-tool.cjs` — PreToolUse hook for scope check before Write/Edit/MultiEdit
- Added `templates/hooks/claude-code-post-tool.cjs` — PostToolUse hook for drift check after Write/Edit/MultiEdit
- Updated `lib/setup/agents.js`: Added hook files to Claude Code `repoLocalHelperFiles`
- Updated `lib/commands/setup.js`: Added `installAgentRuntimeFiles()` and `mergeClaudeSettings()` functions
- Updated Claude Code adapter README with hook documentation

### API Correction

- Fixed internal plan: Claude Code API uses `exit 2 + hookSpecificOutput.permissionDecision: "deny"` instead of `{ decision: "block" }`

## 0.10.2 - 2026-04-02

### Docs Cleanup

- Slimmed PROJECT_STATE.md from 279 lines/25KB to 18 lines (removed historical changelog entries already in CHANGELOG.md)
- Removed pilot records (docs/pilots/claude-code.md, codex.md, cursor.md)
- Removed pilot templates (docs/PILOT_TEMPLATE.md, docs/PILOT_SUMMARY_TEMPLATE.md)
- Removed REAL_REPO_PILOT.md
- Removed docs/pilots/ directory entirely
- Updated release.test.js to remove assertions for deleted pilot files
- Updated WORKFLOWS.md to remove pilot reference
- Final local docs: 19 files (10 public, 9 internal/gitignored)

## 0.10.1 - 2026-04-02

### Cleanup

- Removed 12 old release notes (v0.7.x–v0.9.1) — consolidated into CHANGELOG
- Removed 2 legacy release files (RELEASE_0.1.3.md, RELEASE_0.2.0.md)
- Removed docs/images/ directory (no longer referenced)
- Removed internal dev docs from public repo: AUTOMATION_SPEC.md, FAILURE_CASES.md, PROMOTION.md, RELEASE_CHECKLIST.md, design-philosophy.md
- Files kept locally via .gitignore but removed from remote tracking

## 0.10.0 - 2026-04-02

### Breaking Change

Removed 3 agents (Windsurf, OpenHands, OpenClaw). Only 5 agents are now supported: `claude-code`, `cursor`, `opencode`, `codex`, `gemini`.

### Why These Agents Were Removed

- **Windsurf**: Only supports text injection (`.windsurfrules`), no runtime interception. Text-only enforcement is the exact problem agent-guardrails solves.
- **OpenHands**: Requires Docker/sandbox environment, disproportionate maintenance cost for C-end focused product.
- **OpenClaw**: Skills are load-time only, no runtime hook interception. Incompatible with auto-trigger architecture.

### Changed

- `supportedAdapters` reduced from 8 to 5 in `lib/utils.js`
- Removed Windsurf/OpenHands/OpenClaw from `lib/setup/agents.js`, `lib/commands/init.js`, `lib/commands/daemon.js`
- Removed their hook scripts: `windsurf-check.cjs`, `windsurf-check.sh`, `openhands-check.cjs`, `openclaw-handler.cjs`, `cursor-check.sh`
- Removed their adapter directories: `adapters/windsurf/`, `adapters/openclaw/`, `adapters/openhands/`
- Removed their pilot records: `docs/pilots/openclaw.md`, `docs/pilots/openhands.md`
- Updated `adapters/README.md`, `docs/pilots/README.md`, `docs/pilots/SUMMARY.md` for 5 agents
- Updated `docs/WORKFLOWS.md`, `docs/USER_GUIDE.md`, `docs/ROADMAP.md` — removed removed agent references
- Updated `docs/zh-CN/README.md` — removed openclaw example
- Updated all test files to match 5-agent structure
- Added `gemini` adapter to `agents.js` with `user-global-config` target
- Updated `opencode` adapter: helper files now include `AGENTS.md` + `.opencode/plugins/guardrails.js`
- Created Chinese localization for Gemini adapter template

### Added

- `templates/locales/zh-CN/adapters/gemini/GEMINI.md` — Chinese Gemini adapter template
- `installPluginFiles` function in `setup.js` — copies OpenCode plugin during setup
- `lib/daemon/hooks/opencode-plugin.js` rewritten — named export `GuardrailsPlugin`, `tool.execute.before` scope blocking, `file.edited` event handler

## 0.9.1 - 2026-04-01

### Fixed

- release.test.js updated to match rewritten enforce-first README
- plugin-ts dependencies installed (@typescript-eslint/parser)
- zh-CN/README.md fixed reference to removed PRODUCT_STRATEGY doc

### Changed

- 6 commercial/strategy docs removed from public repo (gitignored, local files preserved): PRO_TIER_STRATEGY, COMMERCIALIZATION, MARKET_RESEARCH, OSS_PRO_BOUNDARY, PRODUCT_STRATEGY
- PROJECT_STATE.md updated to v0.9.0

## 0.9.0 - 2026-04-01

Enforce command: Injects guardrail instructions into agent auto-read files for system-level compliance.

### Added

- **`enforce` command**: Injects guardrail check instructions into each agent's auto-read instruction files (CLAUDE.md, GEMINI.md, .cursor/rules/, .windsurf/rules/, .agents/skills/, etc.) — 8 agents supported
- **`unenforce` command**: Safely removes enforced instructions, preserving any user content that existed before
- **Bilingual templates**: English and Chinese enforce templates for all 8 agents
- **Idempotent**: Running `enforce` twice is safe — detects already-enforced files and skips

### What This Means for Users

Previously, AGENTS.md rules were just "file content" that AI might or might not follow. With `enforce`, the guardrail check instruction is injected directly into each agent's system-level instruction file, which is automatically read at a higher priority than AGENTS.md.

```bash
# Enforce for all agents
agent-guardrails enforce --all

# Enforce for a specific agent
agent-guardrails enforce --agent claude-code

# Remove enforcement
agent-guardrails unenforce --all
```

## 0.8.1 - 2026-04-01

Template language strengthened: AI now treats guardrail checks as mandatory, not optional.

### Changed

- **AGENTS.md and all adapter templates**: Changed "Prefer" to "MUST prefer", added explicit "MANDATORY: Guardrail Check" section with "FAILURE TO RUN THIS COMMAND = INCOMPLETE WORK"
- **i18n tests**: Updated assertions to match new mandatory language

### What This Means for Users

AI agents using the updated templates will now treat `agent-guardrails check --base-ref HEAD~1` as a required step, not an optional suggestion.

## 0.8.0 - 2026-03-31

CLI-first release: Guardrail checks work without MCP configuration.

### Changed

- **`AGENTS.md` template**: Rewritten to CLI-first. Instructions now use `agent-guardrails check --base-ref HEAD~1` instead of MCP tools. MCP remains optional.
- **All 8 adapter templates**: Rewritten to CLI-first. Each adapter now requires only `agent-guardrails check --base-ref HEAD~1` before finishing.
- **`setup` command**: Now automatically injects git pre-commit hook on every setup.
- **`init` command**: Now automatically injects git pre-commit hook on every init.

### Added

- **Git pre-commit hook** (`templates/base/hooks/pre-commit.cjs`): Runs `agent-guardrails check --base-ref HEAD~1` before each commit. Commits with issues are blocked (skip with `--no-verify`).
- **`writeText` append mode**: Supports appending to existing files with HTML markers.
- **Daemon-Hook unified architecture**: Daemon is now the sole check engine. Hooks read `daemon-result.json` via `shared-result-reader.cjs` instead of running independent checks. Hook latency drops from 1-4s to <100ms when daemon is running.
- **`shared-result-reader.cjs`**: Cache-first result reader with status-based freshness and automatic fallback to independent check.
- **Worker.js status marking**: `daemon-result.json` now includes `status: "running"/"completed"` for concurrency coordination.
- **Integration tests**: `shared-result-reader.test.js`, `daemon-check.test.js`, `daemon-hooks.test.js` — 122 new test assertions.
- **i18n for daemon-check.cjs**: Claude Code hook now supports en/zh-CN locale via `AGENT_GUARDRAILS_LOCALE`.

### What This Means for Users

After this update, users can install guardrails with:
```bash
cd my-project
npx agent-guardrails setup --agent claude-code
```

No MCP configuration required. The AI reads `AGENTS.md` and runs `agent-guardrails check --base-ref HEAD~1` before finishing. Git hook provides a backup.

## 0.7.8 - 2026-03-31

Minimize project pollution release: smart file handling during installation.

### Changed

- **`AGENTS.md`**: Now appended (not skipped) when file already exists, using HTML markers (`<!-- agent-guardrails:start -->` / `<!-- agent-guardrails:end -->`) for easy identification and removal
- **`.github/workflows/`**: Only created if no existing CI workflow files are detected
- **`.agent-guardrails/` internal files**: Use force mode (safe to overwrite templates)
- **Adapter files**: Still use create mode (never overwrite user files)

### Internal

- **`lib/utils.js`**: `writeText()` now supports `append` and `appendMarker` options
- **`lib/commands/init.js`**: Refactored to classify writes by type (create/append/force)
- **`lib/i18n.js`**: Added `appended` and `ciDetected` translations for en and zh-CN

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
- **OSS/Pro Boundary**: Rough-Intent core is OSS; semantic inference is Pro

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
