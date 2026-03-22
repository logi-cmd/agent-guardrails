# Project State

Last updated: 2026-03-22

## Goal

Build the production-safety layer for AI coding workflows, with an open-source merge-gate baseline and a clear path toward agent-native automation.

## Current focus

Keep the published OSS baseline honest while refining market positioning, commercialization boundaries, and the next product layer above the CLI.

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

## Blockers

- Manual approval state and sign-off are still documentation-level concepts rather than first-class contract fields
- Proof-of-value now includes a documented source-repo pilot, but broader external pilots are still missing for stronger claims beyond the current OSS release posture
- The product direction above the CLI is still a strategy-level plan; skill, MCP, and agent-native entrypoints are not implemented yet

## Next step

Turn the market and product strategy into the first concrete automation spec: define the Skill MVP, MCP MVP, and the minimum agent-native workflow without weakening the current merge-gate quality bar.
