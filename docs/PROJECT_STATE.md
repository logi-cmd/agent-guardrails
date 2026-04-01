# Project State

Last updated: 2026-04-01 (v0.9.1 preparation)

## Goal

Build the production-safety layer for AI coding workflows, with an open-source merge-gate baseline and a clear path toward agent-native automation.

## Current Version

**v0.9.0** — Enforce/unenforce commands for 8 agents, README rewrite

### Key Features (v0.9.0)
- ✅ `enforce` — Inject guardrail instructions into agent system-level auto-read files (CLAUDE.md, GEMINI.md, etc.)
- ✅ `unenforce` — Safely remove injected content, preserving user's original files
- ✅ 8 agent support: claude-code, cursor, opencode, codex, gemini, windsurf, openhands, openclaw
- ✅ Enforce always uses English templates (AI understands English best)
- ✅ README rewritten — enforce-first, 166 lines, clean structure
- ✅ Three-layer enforcement: L1 enforce > L2 AGENTS.md > L3 pre-commit hook

### Key Features (v0.8.x)
- ✅ CLI-first architecture with daemon-hook unification
- ✅ AGENTS.md + adapter templates strengthened with mandatory language
- ✅ Shared-result-reader for <100ms hook response

### Key Features (v0.7.x)
- ✅ MCP tools: check_after_edit, explain_change, query_archaeology
- ✅ 8 agent adapters with MCP config
- ✅ Active Guardrails — MCP responses include human-readable summaries

## Current focus

v0.9.0 已发布。下一步重点：
1. 发布 v0.9.1 — 包含 release.test.js 修复、plugin-ts 依赖修复、.gitignore 商业敏感文档清理
2. 写技术博客获取前 100 用户
3. Pro Tier 策略已就绪（docs/PRO_TIER_STRATEGY.md，已 gitignore），待有用户反馈后启动开发

## Done recently (v0.9.x)

- v0.9.0: enforce/unenforce 命令 — 8 agent 系统级指令注入与安全移除
- v0.9.0: enforce 总是使用英文模板（locale: null）— AI 理解英文最佳
- v0.9.0: README 重写 — 166 行，enforce-first，三层保障机制
- v0.9.1-prep: release.test.js 适配新 README
- v0.9.1-prep: plugin-ts 依赖修复 — npm install @typescript-eslint/parser
- v0.9.1-prep: .gitignore 商业敏感文档 — 移除 6 个策略/定价/竞品分析文件
- v0.9.1-prep: zh-CN/README.md 修复 — 移除对已 gitignore 文件的引用

## Done recently (v0.8.x)

- v0.8.1: AGENTS.md 模板强化 —"Prefer"→"MUST prefer"，新增"MANDATORY: Guardrail Check"章节，明确"FAILURE TO RUN THIS COMMAND = INCOMPLETE WORK"
- v0.8.1: 全部 8 个 adapter 模板强化 — claude-code、windsurf、gemini、codex、openclaw、openhands、opencode 统一使用强制语气
- v0.8.0: Daemon-Hook 统一架构 — daemon 做唯一检查引擎，hooks 读 daemon-result.json 而非独立跑检查
- v0.8.0: shared-result-reader 模块 — cache-first + fallback 模式，hook 延迟从 1-4s 降到 <100ms
- v0.8.0: worker.js status 标记 — "running"/"completed" 防并发读取
- v0.8.0: 8 个 hook 文件重构为 thin delivery 层（daemon-check、cursor、windsurf、gemini、codex、openhands、openclaw、opencode）
- v0.8.0: daemon-check.cjs 补齐 i18n 支持
- v0.8.0: 集成测试 — shared-result-reader.test.js、daemon-check.test.js、daemon-hooks.test.js
- v0.8.0: npm 发布 agent-guardrails@0.8.0 + GitHub tag v0.8.0

## Done recently (v0.7.x)

- v0.7.5: Active Guardrails — MCP 响应包含人类可读摘要 + check_after_edit 工具
- v0.7.5: 8 个适配器模板更新 + 测试覆盖
- v0.7.5: npm 发布 agent-guardrails@0.7.5 + GitHub tag v0.7.5
- v0.7.4: 验证所有 8 个 Agent 适配器 MCP 配置格式 + 补全文档
- v0.7.4: npm 发布 agent-guardrails@0.7.4 + GitHub tag v0.7.4
- v0.7.3: 修复 OpenClaw 和 Windsurf MCP 配置路径
- v0.7.3: npm 发布 agent-guardrails@0.7.3 + GitHub tag v0.7.3

## Done recently (v0.5.x)

- v0.5.0: Real git diff 分析引擎 — explain_change 从模板拼接升级为真实 diff 分析
- v0.5.0: 持久化考古数据 — query_archaeology 跨会话积累 (.agent-guardrails/archaeology.json)
- v0.5.0: 持久化 session — 新增 persistSession/loadPersistedSession/listPersistedSessions
- v0.5.0: Rough-intent repo 结构分析 — 新增 analyzeRepoStructure, 框架检测 (Next.js/Express/FastAPI/Django)
- v0.5.0: 3 个新任务类型 — deploy/security/database + 复合关键词匹配
- v0.5.0: MCP explain_change 返回结构化对象 { summary, files, categories, riskIndicators }
- v0.5.0: MCP query_archaeology 接入持久化存储
- v0.5.0: MCP plan_rough_intent 传入 repoRoot 启用框架检测
- v0.5.0: agent-loop finish 时自动保存考古笔记
- v0.5.0: 8 agent 支持 — setup/agents.js 补全 gemini/opencode/windsurf
- v0.5.0: npm 发布 agent-guardrails@0.5.0 + GitHub tag v0.5.0
- v0.5.0: 更新 .gitignore 排除运行时文件 (task-contract.json, archaeology.json, CLAUDE.md)
- v0.5.0: 从 git 跟踪中移除已提交的运行时文件
- v0.5.0: 提交并推送 .gitignore 更新到远程仓库
- v0.4.0: Daemon 7-Agent hook 完善 — 修复 8 个 bug，全平台兼容，i18n 统一
- v0.4.0: 修复 opencode-plugin.js 退出码逻辑反转（错误被静默忽略）
- v0.4.0: 修复 Windsurf/Cursor hook 幂等检查失效（每次 start 重复注入）
- v0.4.0: 重写 cursor-check.sh / windsurf-check.sh → .cjs（Windows 兼容）
- v0.4.0: 删除 stopDaemon 中重复的 removeDaemonRule 调用
- v0.4.0: 修复 openclaw-handler.cjs 无效 async/await
- v0.4.0: daemon.js 硬编码中文迁移到 i18n 体系（8 个字符串）
- v0.4.0: 添加 .gitattributes 保护 LF 行尾
- v0.4.0: 守护进程启动时输出用途描述，增强用户感知
- v0.4.0: 更新测试套件，全部 12/12 通过

## Done recently (v0.3.x)

- v0.3.2: 完善 Daemon 模式 (chokidar 依赖、前台模式、测试、文档)
- v0.3.2: 修复 4 个测试失败 (plugin-ts, mcp, plan, release)
- v0.3.2: 添加 plan_rough_intent MCP 工具
- v0.3.1: 添加 --version 参数，完善 i18n 覆盖
- v0.3.1: 修复 MCP server JSON schema 语法错误
- v0.3.0: 添加 Rough-Intent 模式，支持模糊意图解析
- v0.3.0: 添加 10 种任务类型自动识别
- v0.3.0: 添加 MCP 工具 `plan_rough_intent`
- v0.3.0: 添加 README 可视化图片
- v0.3.0: 发布到 npm 和 GitHub
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
- Cleaned up the Chinese pilot instructions in the README and the Claude Code pilot record so the first-run guidance stays readable
- Added a Chinese "rough idea is enough" chat example to the README and marked the Codex sandbox chat as completed in its pilot record
- Completed the OpenClaw sandbox chat with scoped changes, passing tests, evidence, and a reviewer summary
- Drafted the `0.1.3` release material around setup-first onboarding, repo-local MCP write paths, and the completed sandbox pilot evidence
- Bumped the package to `0.1.3` and turned the release draft into a final release candidate with validated test and benchmark runs
- Tagged and pushed `v0.1.3` to GitHub
- Reframed the next product step around a fuller Vibe Coding pain model instead of only deeper detector work
- Shipped a bilingual README first screen with a shorter setup-first happy path and rough-idea examples
- Compressed `setup` output toward four user-facing cards: already done, do this now, say this, and you will get
- Updated strategy, market research, automation spec, and roadmap to include rough intent, trust verdicts, recovery, secrets/privacy, cost awareness, and team trust as first-class product concerns
- Added sharper README positioning around real repos versus one-off generation, plus a clearer language-support boundary for JS/TS, Python/FastAPI, and monorepos
- Added a single proof entrypoint at `docs/PROOF.md` so product proof and trial guidance are no longer scattered
- Added the first rough-intent runtime prototype so vague task requests now return 2 to 3 smallest-safe task suggestions through the shared runtime, MCP surface, and agent-native loop
- Re-aligned the strategy, roadmap, commercialization split, README, and workspace state so deploy-readiness judgment and post-deploy maintenance stay in OSS while real deployment orchestration remains a later automation layer
- Added a shared trust verdict layer across `check`, `check --json`, MCP, and the agent-native loop, with the first OSS deploy-readiness and post-deploy maintenance summary fields
- Tightened the production-profile verdict logic so deploy blockers stay distinct from post-deploy watch items, and fixed evidence parsing so production review notes survive into the detector pipeline
- Added the first Python/FastAPI baseline proof slice with a runnable sandbox demo plus an OSS benchmark scenario, without introducing `plugin-python` or claiming semantic parity with TS/JS
- Narrowed the README again by removing duplicated language-support framing and compressing repeated setup-first guidance so the first-run path stays easier to scan
- Split deeper usage material out of the README into `docs/WORKFLOWS.md` so the main README behaves more like a product homepage than a full manual
- Generalized the README setup commands so the first-run path no longer reads as Claude-only, while keeping Claude Code as the most opinionated example path
- Fixed the npm package `bin` metadata so `npm publish --dry-run` no longer auto-corrects and strips the CLI entry
- Re-verified the full suite with `npm test` and `npm run benchmark` after the entry-compression changes
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
- Added the first continuity layer MVP so `check`, MCP, and the agent-native loop now surface reuse targets, new surface files, continuity breaks, future maintenance risks, and continuity-specific next actions from the same OSS runtime
- Added an OSS continuity detector that warns about broadened implementation surface, likely parallel abstractions, and continuity-sensitive structure changes without creating a second blocking path
- Re-verified the continuity-layer milestone with `npm test` and `npm run benchmark`
- Bumped the package to `0.1.2` and prepared the corresponding release notes for the continuity-layer milestone
- Reframed the product entry around conversation-first usage so MCP becomes the primary user-facing bridge and CLI becomes the runtime/bootstrap fallback layer
- Reworked the README, automation spec, commercialization language, and strategy docs so they consistently position `agent-guardrails` as a production-safety runtime for existing agent chats rather than a standalone coding agent
- Added `agent-guardrails setup --agent <name>` as a new setup-first CLI entry that auto-initializes repos, generates MCP snippets, prints a first chat prompt, and points users at one canonical chat loop
- Added a small onboarding subsystem for Codex, Claude Code, Cursor, OpenHands, and OpenClaw so all five agents now have explicit MCP-first setup guidance and stable structured setup output
- Reworked the README and all five adapter docs so the first-run story is "setup, paste config, start chatting" instead of "manually init, plan, and check" 
- Updated the seeded English adapter templates so repo-local helper files now reinforce the canonical MCP flow alongside the manual fallback path
- Completed the bounded-scope sandbox setup for OpenHands and OpenClaw, including repo-local helper files and generated MCP snippets
- Re-verified the setup-first onboarding milestone with `npm test` and `npm run benchmark`
- Tightened the setup output so it now clearly separates what is already done from the one remaining manual step
- Made Claude Code the explicit primary external pilot path in the README and adapter docs while keeping the same setup-first runtime entry for the other agents
- Added `docs/PILOT_TEMPLATE.md` so setup friction, MCP paste friction, CLI fallback, and summary trust can be recorded consistently across individual pilots
- Added `docs/PILOT_SUMMARY_TEMPLATE.md` so the five-entry pilot can be rolled up into one release-gating view instead of scattered notes
- Updated the Cursor, Codex, OpenHands, and OpenClaw adapter docs so each one now points to the shared pilot recording path instead of implying only one entry matters
- Added `docs/pilots/` with one ready-made pilot record per supported agent plus a ready-made rollup file, and taught `setup` to point users at those paths directly
- Added an optional `setup --write-repo-config` path for clearly safe repo-local MCP targets (`claude-code`, `cursor`, `openhands`, and `openclaw`) so pilot users can get closer to "configure once, then chat"
- Added Chinese setup guidance in README and turned the Claude Code pilot record into the first real pilot landing page
- Verified the official Claude Code CLI help on this host, then completed repo-local setup with `--write-repo-config` on the bounded-scope demo sandbox
- Completed the first real Claude Code sandbox chat and captured the reviewer summary for the bounded-scope demo
- Completed the Cursor sandbox setup with `--write-repo-config` and prepared the pilot record for its first chat
- Completed the Codex sandbox setup and finished the first Codex sandbox chat with a reviewer summary

## Blockers

- Manual approval state and sign-off are still documentation-level concepts rather than first-class contract fields
- Proof-of-value now includes documented sandbox chats for Claude Code, Codex, and OpenClaw, plus sandbox setup completion for Cursor and OpenHands, and the remaining MCP paste friction has now been reduced with repo-local config support where possible
- The pilot summary now shows three completed sandbox chats and two setup-only entries, which is enough to judge the setup-first release gate
- Agent-native entrypoints now exist through the OSS MCP loop, but continuity is still heuristic and does not yet use module history or repo-learned reuse patterns
- The first-run path is now setup-first, but the stronger proof story is still TS/JS-heavy and Python does not yet have an equally convincing proof slice
- Production-profile, rollback, and observability fields now exist, but they still stop at review-time guidance rather than a fully explicit deploy-readiness or post-deploy maintenance surface
- The README now includes the passive understanding layer (被动理解层) documentation, but user feedback on these new features is still pending

## Next step

v0.9.0 已发布，v0.9.1 准备中。下一步：
1. 发布 v0.9.1（release.test.js + plugin-ts + .gitignore 清理）
2. 写 1-2 篇技术博客获取前 100 用户
3. 收集用户反馈后启动 Pro Tier 开发

## Handoff

- `What changed`: enforce/unenforce 命令、README 重写、商业敏感文档 gitignore
- `Revenue Path`: OSS v0.9.x 获取用户 → 技术博客引流 → 用户反馈驱动 Pro 开发
- `Commercial risk`: Pro 策略文档已 gitignore，不会泄露到公开仓库
- `What I need next`: 发布 v0.9.1，开始写技术博客
