# Project State

Last updated: 2026-03-23

## Goal

Build the production-safety layer for AI coding workflows, with an open-source merge-gate baseline and a clear path toward agent-native automation.

## Current focus

Keep the published OSS baseline honest while moving the product from a CLI workflow into a real runtime, then carry the same runtime from the CLI and Skill flow into MCP and agent-native entrypoints while surfacing security, dependency, performance, understanding, and continuity risk dimensions as first-class review hints.

## Done recently

- Chose the project direction around `init`, `plan`, and `check`
- Created the first repository scaffold, templates, and baseline CLI
- Added a first-pass GitHub Action template and preset configs
- Added zero-dependency tests for `init`, `plan`, and `check`
- Fixed preset test-file heuristics to avoid classifying source files as tests
- Added optional path ownership checks via `checks.allowedPaths`
- Wired the repo's own config to demonstrate allowed path enforcement
- Added a self-contained demo repo under `examples/bounded-scope-demo`
- Documented the shipped demo and current product limits more explicitly
- Connected `plan` to `check` with a machine-readable task contract file
- Updated the demo so it shows contract creation and enforcement in one flow
- Added explicit `base-ref` diff support to `check` for deterministic CI-style evaluation
- Added an OpenClaw adapter docs/template slice under `adapters/openclaw`
- Added `init --adapter openclaw` support to seed `OPENCLAW.md`
- Hardened packaging and CLI UX for installed usage with validated presets/adapters and clearer next steps
- Verified packed-install usage for `help`, `init`, `plan`, and `check` from an isolated local install
- Added first-pass adapters for Codex, Claude Code, Cursor, and OpenHands
- Verified isolated installed usage for multi-adapter init seeding across Codex, Claude Code, Cursor, OpenHands, and OpenClaw
- Added machine-readable `check --json` output so CI and agent adapters can consume guardrail results without scraping text
- Expanded task contracts with `requiredCommands` and `evidencePaths`, and taught `check` to enforce both
- Updated the bounded-scope demo so it exercises command/evidence requirements in addition to path scope
- Upgraded the seeded GitHub Action template to diff against the default branch and upload a JSON report artifact
- Standardized the docs-first richer-contract workflow across Codex, Claude Code, Cursor, OpenHands, and OpenClaw docs plus seeded templates
- Updated the base repo templates so generated repos now teach the canonical evidence note path and `--commands-run` flow
- Extended `init` coverage to verify generated guidance and seeded adapter files mention required commands, evidence, and `--commands-run`
- Added release-facing docs including `CONTRIBUTING.md`, `CHANGELOG.md`, `docs/TROUBLESHOOTING.md`, and `docs/RELEASE_CHECKLIST.md`
- Reworked the README around quick start, supported agents, local versus CI workflows, FAQ, and demo proof-of-value
- Upgraded the maintainer CI workflow to run tests, demo, help smoke, pack dry-run, and install smoke
- Added release validation coverage for README/package metadata/workflow quality and a tarball install smoke script
- Verified release-grade checks locally, including `npm test`, demo run, help smoke, pack dry-run, and a real tarball install/init path
- Expanded task contracts with intended files, protected paths, allowed change types, risk level, validation profile, review-note requirements, and assumptions
- Reworked `check` into layered findings across scope, consistency, validation, and risk, with machine-readable findings plus `--review` text output
- Added generic-first protected-area and change-type enforcement driven by repo policy and task contracts
- Updated preset configs, base templates, seeded adapter instructions, and README examples to teach the richer production-shaped workflow
- Added tests for intended-file scope violations, protected-area risk failures, change-type violations, and reviewer-oriented output
- Analyzed the next product direction across semantic enforcement, product quality, and prosumer commercialization
- Added `docs/PRODUCT_STRATEGY.md` to capture the semantic roadmap, proof-of-value plan, benchmark needs, and open-source versus paid split
- Reframed the next milestone around detector foundations, benchmarked proof, and stronger demos instead of only heuristics and release polish
- Added locale-aware CLI and docs support for `en` and `zh-CN`, including localized templates and locale selection via `--lang`
- Added production-profile and NFR skeletons to preset configs and task contracts, plus corresponding risk checks in `check`
- Expanded GitHub Actions to a Windows/Linux/macOS matrix for cross-platform smoke coverage
- Verified the full test suite passes after the locale and production-profile updates
- Refactored `check` onto a detector pipeline foundation with pluggable semantic-detector loading and OSS detector modules
- Added an executable benchmark harness with public OSS scenarios and planned Pro semantic scenarios
- Added `docs/COMMERCIALIZATION.md`, `docs/BENCHMARKS.md`, and `docs/SEMANTIC_ARCHITECTURE.md`
- Reworked the README to clarify OSS versus Pro layering, add the benchmark entrypoint, and fix the Chinese docs link labels
- Added a repo-contained local package for `@agent-guardrails/plugin-ts` with source-repo fallback loading in the detector pipeline
- Shipped the first warning-level semantic detector for TS/JS pattern drift and parallel abstractions
- Promoted `benchmarks/pro/pattern-drift-failure.json` into an active runnable Pro proof point
- Added `examples/pattern-drift-demo` to show an OSS-valid task that still triggers a semantic pattern-drift finding and then clears it
- Extended maintainer CI, package scripts, docs, and release validation to include the first semantic demo and mixed OSS/Pro benchmark state
- Verified `npm test`, `npm run benchmark`, `node ./examples/bounded-scope-demo/scripts/run-demo.mjs all`, and `node ./examples/pattern-drift-demo/scripts/run-demo.mjs all`
- Added a second TS/JS semantic detector for public-surface interface drift with hybrid warning/error severity
- Promoted `benchmarks/pro/interface-change-failure.json` into an active runnable Pro proof point
- Added `examples/interface-drift-demo` to show an OSS-valid implementation-only task that fails when it silently changes the public surface
- Extended tests, workflow smoke coverage, package scripts, and docs to include the interface-drift milestone
- Verified `node ./examples/interface-drift-demo/scripts/run-demo.mjs all` and re-verified the full suite with `npm test` plus `npm run benchmark`
- Added a third TS/JS semantic detector for config-driven boundary violation checks
- Added a fourth TS/JS semantic detector for source-to-test relevance with warning/error escalation based on `expectedTestTargets`
- Promoted `benchmarks/pro/boundary-violation-failure.json` and `benchmarks/pro/source-to-test-semantic-relevance.json` into active runnable Pro proof points
- Added `examples/boundary-violation-demo` and `examples/source-test-relevance-demo` with fail-to-fix-to-pass flows
- Updated the README, benchmark docs, semantic architecture docs, commercialization docs, roadmap, and release checklist to reflect the stronger OSS release gate and the four active semantic proofs
- Added `docs/REAL_REPO_PILOT.md` to summarize the source-repo self-pilot and the meaningful catches beyond the OSS baseline
- Re-verified `npm test`, `npm run benchmark`, and all five runnable demos after the new semantic milestones landed
- Aligned `package.json` repository, homepage, and bugs metadata to the `logi-cmd/agent-guardrails` GitHub repository
- Simplified the README onboarding flow so the first workflow is copy-paste friendly and task/path choices are minimized for new users
- Published the repo to GitHub and released `agent-guardrails@0.1.0` on npm
- Added market-facing positioning updates across the README, product strategy, and commercialization docs
- Added `docs/MARKET_RESEARCH.md` to capture adjacent categories, target-user pain, whitespace, and the recommended go-to-market framing
- Lowered the README prominence of `Market Research` so it reads as background material rather than a primary onboarding path
- Added `docs/AUTOMATION_SPEC.md` to define the first Skill, MCP, and agent-native workflow layer
- Changed the repo and global Git author identity to `logi-cmd <975048651@qq.com>` so future commits default to the maintainer identity
- Added preset-backed `plan` defaults for allowed paths, required commands, and evidence paths so users can start with `agent-guardrails plan --task "..."`
- Updated README, adapter docs, localized templates, and CLI help text so the primary workflow is copy-paste friendly and advanced flags are explicitly optional
- Extended tests and repo config to cover the simpler `plan` flow without weakening `check`, and re-verified the suite with `npm test`
- Added a shared runtime service layer under `lib/runtime/` so `plan` and `check` can reuse repo-guardrail reading, task-contract suggestion, and review-risk summarization
- Added basic task-session metadata to contracts, including contract source, risk signals, and next actions
- Extended `check` results with runtime next-action summaries so the product behaves more like a stateful execution layer than a one-off command
- Added runtime coverage in `tests/runtime.test.js` and re-verified the suite with `npm test`
- Expanded the runtime session shape with session IDs, finish-time hints, suggested commands, and a recommended `check --review` command
- Turned the first OSS Skill slice into a real start-and-finish flow by wiring `plan` and `check` through the same session model
- Added baseline continuity hints to runtime review summaries so the OSS flow starts surfacing maintainability guidance instead of only one-off pass/fail signals
- Updated README, automation docs, and seeded adapter guidance so the user-facing flow is "natural-language task -> runtime-backed contract -> finish-time check"
- Re-verified the suite with `npm test` after the runtime/Skill MVP changes
- Added the first OSS MCP MVP as `agent-guardrails mcp`, exposing `read_repo_guardrails`, `suggest_task_contract`, `run_guardrail_check`, and `summarize_review_risks`
- Added a stdio-framed MCP server that reuses the existing runtime and `executeCheck()` instead of creating a second judgment path
- Added MCP integration coverage in `tests/mcp.test.js` and re-verified the suite with `npm test`
- Extended the shared runtime, plan, check, presets, and docs so security, dependency, performance, understanding, and continuity now appear as first-class risk dimensions in task contracts, runtime hints, and reviewer output
- Re-verified the full suite with `npm test` and `npm run benchmark` after adding the new risk-dimension surface
- Completed the `zh-CN` localization for the new risk-dimension defaults, runtime hints, and review-facing text so the public OSS flow stays consistent across locales
- Polished the public README, troubleshooting guide, and pilot doc so install and usage guidance stays shell-neutral across Windows, Linux, and macOS, with `npx` as the default fallback when global PATH setup differs by platform
- Prepared the `0.1.1` patch release to capture the onboarding and cross-platform install polish
- Bumped the package to `0.1.1` and created the local `v0.1.1` tag for the patch release
- Pushed the `v0.1.1` patch release to GitHub after verifying the release regression suite and benchmark suite stayed green
- Unified the strategy, automation, commercialization, market, and README messaging around one product truth: a repo-aware, stateful, agent-native production-safety runtime whose moat lives in runtime judgment, repo memory, semantic enforcement, continuity, and workflow integration rather than prompt packaging
- Added the first OSS agent-native loop MVP on top of the shared runtime and MCP layer so an agent can bootstrap a task, seed evidence, run `check`, and return a reviewer-friendly summary without the user hand-driving each step

## Blockers

- Manual approval state and sign-off are still documentation-level concepts rather than first-class contract fields
- Proof-of-value now includes a documented source-repo pilot, but broader external pilots are still missing for stronger claims beyond the current OSS release posture
- Agent-native entrypoints now exist through the OSS MCP loop, but continuity and module-history guidance are still only hints rather than a stronger reuse-oriented layer

## Next step

Build the continuity layer MVP so the runtime can point agents toward reuse targets, continuity breaks, and future maintainer risk instead of only surfacing broad continuity hints.

## Handoff

When a meaningful milestone lands, end the project-thread update with:

- `What changed`: one sentence
- `Revenue Path`: the next missing link before paid
- `Commercial risk`: the main blocker to the first paid outcome
- `What I need next`: the one commercial decision or action
