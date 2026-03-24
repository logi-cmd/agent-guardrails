# Agent Guardrails

Ship AI-written code with production guardrails.

`agent-guardrails` is a production-safety runtime for AI coding workflows. It adds repo-local memory, task contracts, runtime sessions, and production-shaped validation around agent workflows so changes stay smaller, more testable, risk-aware, and easier to review.

It is not trying to be another standalone coding agent or another PR review bot.
It is trying to be the repo-aware runtime that existing agent chats call before code is trusted and merged.

For real repos, not one-off prototypes.

## Start Here / 先看这里

**English**

If you are new, start with `setup`.

1. install `agent-guardrails`
2. run `agent-guardrails setup --agent claude-code` in your repo
3. connect your existing coding agent
4. describe the task in plain language
5. get a reviewer summary with scope, validation, and remaining risk

What you should expect:

- smaller changes
- clearer validation
- less scope drift
- a reviewer-friendly finish output

**中文**

如果你是第一次用，先从 `setup` 开始。

1. 安装 `agent-guardrails`
2. 在仓库里运行 `agent-guardrails setup --agent claude-code`
3. 把它接进你现有的 coding agent
4. 直接用自然语言说任务
5. 最后拿到 reviewer summary，看这次改了什么、有没有越界、还剩什么风险

你应该得到的是：

- 更小的改动范围
- 更清楚的验证结果
- 更少的越界和漂移
- 更容易 review 的收尾输出

Use website or code-generation tools to get something started.
Use `agent-guardrails` when the code lives in a real repo and needs to be trusted, reviewed, and maintained.

先用生成工具快速起一个 prototype、页面或 demo。
当代码进入真实仓库、需要 review、merge 和长期维护时，再用 `agent-guardrails`。

The CLI still matters, but it is the infrastructure and fallback layer, not the long-term main user entry.

If you want to see it working before using your own repo, run the demo first:

```bash
npm run demo
```

## Who This Is For / 适合谁

- developers already using Claude Code, Cursor, Codex, OpenHands, or OpenClaw inside real repos
- teams and solo builders who have already been burned by scope drift, skipped validation, or AI-shaped maintenance debt
- users who want smaller AI changes, clearer validation, and reviewer-facing output before merge

- 已经在真实仓库里使用 Claude Code、Cursor、Codex、OpenHands 或 OpenClaw 的开发者
- 已经被越界改动、漏测试或维护漂移坑过的个人开发者和小团队
- 希望在 merge 前看到更小改动、更清楚验证结果和 reviewer 输出的人

## Who This Is Not For / 不适合谁

- people who only want a one-shot landing page, mockup, or prototype
- users who do not care about repo rules, review trust, or long-term maintenance
- teams looking for a generic static-analysis replacement

- 只想快速做一个 landing page、mockup 或 demo 的人
- 不在意仓库规则、review 信任和后续维护的人
- 想找一个通用静态分析替代品的团队

## Why This Is Different / 为什么它不是另一种生成工具

`agent-guardrails` is not trying to win on the first wow moment.
It is trying to make AI-written changes easier to trust after the first prompt.

- smaller AI changes
- clearer validation
- lower review anxiety
- lower maintenance drift

它不是靠“第一次生成多爽”取胜。
它要解决的是第一轮生成之后，代码还能不能继续信、继续 review、继续维护。

- 更小的 AI 改动
- 更清楚的验证结果
- 更低的 review 焦虑
- 更低的长期维护漂移

## Quick Start / 最短路径

Install once:

```bash
npm install -g agent-guardrails
```

In your repo, run:

```bash
agent-guardrails setup --agent claude-code
```

If your agent supports a clearly safe repo-local config path, use:

```bash
agent-guardrails setup --agent claude-code --write-repo-config
```

Then open your existing agent and start chatting.

如果你只知道一个大概方向，也可以直接这样说：

- `先帮我看看这个仓库最小能改哪里，尽量别扩大范围，最后告诉我还有什么风险。`
- `帮我修这个问题，先读仓库规则，小范围改动，跑完测试后给我 reviewer summary。`
- `I only have a rough idea. Please read the repo rules, find the smallest safe change, and finish with a reviewer summary.`

Proof in one page:

- [What this catches that normal AI coding workflows miss](./docs/PROOF.md)
- [Python/FastAPI baseline proof demo](./examples/python-fastapi-demo/README.md)

## Current Language Support / 当前语言支持

**English**

- **Deepest support today:** JavaScript / TypeScript
- **Baseline runtime support today:** Next.js, Python/FastAPI, monorepos
- **Actively expanding:** deeper Python semantic support and broader framework-aware analysis

This means the runtime, setup-first flow, contracts, evidence, and reviewer summary already work outside plain JS/TS repos, but the strongest semantic depth today is still in the TS/JS path.

**中文**

- **当前最深支持：** JavaScript / TypeScript
- **当前基础运行时支持：** Next.js、Python/FastAPI、monorepo
- **正在继续补强：** Python 更深的语义能力，以及更广的框架级分析

这意味着现在的 setup、contract、evidence、reviewer summary 已经不只适用于 JS/TS，但真正最强的语义深度仍然在 TS/JS 这条线上。

## Current Language Support / 当前语言支持

**Today / 当前**

- **Deepest support:** JavaScript / TypeScript
- **Baseline runtime support:** Next.js, Python/FastAPI, monorepos
- **Still expanding:** deeper Python semantic support and broader framework-aware analysis

**What that means / 这代表什么**

- JavaScript / TypeScript currently has the strongest semantic proof points through the public `plugin-ts` path and the shipped demos
- Python works today through the same setup, contract, evidence, and review loop, but it does not yet have semantic-depth parity with TypeScript / JavaScript
- Monorepo support is a repo shape, not a separate language claim

- JavaScript / TypeScript 目前有最强的语义 proof 和 demo 支撑
- Python 现在已经能走 setup、contract、evidence、review 这一整条 baseline 流程，但还没有达到 TS/JS 的语义深度
- monorepo 是仓库形态支持，不是一门单独语言

Language expansion is now an active product priority, with Python as the next language to deepen.

语言支持扩展现在已经是正式产品优先项，下一门重点加深的语言是 Python。

If you want the first Python/FastAPI proof path, use the sandbox in [examples/python-fastapi-demo](./examples/python-fastapi-demo). It proves the baseline runtime, deploy-readiness, and post-deploy maintenance surface in a Python repo without claiming semantic-depth parity with TS/JS.

如果你想看第一条 Python/FastAPI proof 路径，可以直接跑 [examples/python-fastapi-demo](./examples/python-fastapi-demo)。这条路径证明的是 Python 仓库里的 baseline runtime、deploy-readiness 和 post-deploy maintenance，而不是宣称它已经达到 TS/JS 的语义深度。

## What This Catches / 这能多抓住什么

- bounded-scope failure versus bounded-scope pass
- semantic drift catches beyond the basic OSS baseline
- reviewer summaries that explain changed files, validation, and remaining risk

- bounded-scope 的失败与修复对比
- 超过基础 OSS baseline 的语义漂移捕捉
- 能告诉你改了什么、做了哪些验证、还剩什么风险的 reviewer summary

See the full proof in [docs/PROOF.md](./docs/PROOF.md).

## Why this exists

Coding agents usually fail in predictable ways:

- they invent abstractions that do not match the repo
- they change too many files at once
- they skip tests when behavior changes
- they ignore project-specific rules unless those rules are explicit and easy to load

`agent-guardrails` gives repos a runtime-backed workflow:

1. `init` seeds repo-local instructions and templates
2. `plan` writes a bounded task contract
3. `check` validates scope, consistency, correctness, and review or risk signals

The product is most valuable when you want three things at once:

- smaller AI-generated changes
- clearer merge and review signals
- lower maintenance cost over time

The moat is not prompt wording or a chat wrapper.
The moat is the combination of repo-local contracts, runtime judgment, semantic checks, review structure, workflow integration, and maintenance continuity that compounds with continued use in the same repo.

## Setup-First Quick Start

If you want the intended product entry, install the package and let `setup` prepare the repo plus the agent config you need:

```bash
npm install -g agent-guardrails
npx agent-guardrails setup --agent claude-code
```

If you want the shortest install path, use:

```bash
npm install -g agent-guardrails
```

If your shell does not pick up the global binary right away, skip PATH troubleshooting and run:

```bash
npx agent-guardrails ...
```

The runtime is tested in CI on Windows, Linux, and macOS, and the README examples stay shell-neutral unless a platform-specific workaround is required.

`setup` now does the first-run work that heavy vibe-coding users usually do not want to do by hand:

- auto-initializes the repo if `.agent-guardrails/config.json` is missing
- defaults to the `node-service` preset unless you override it with `--preset`
- writes safe repo-local helper files such as `CLAUDE.md`, `.cursor/rules/agent-guardrails.mdc`, `.agents/skills/agent-guardrails.md`, or `OPENCLAW.md` when the chosen agent needs them
- prints the agent config snippet and tells you exactly where to put it
- gives you one first chat message and one canonical MCP loop

Example:

```bash
npx agent-guardrails setup --agent claude-code
npx agent-guardrails setup --agent cursor --preset nextjs
```

If the agent uses a clearly safe repo-local MCP config file, you can remove even the paste step:

```bash
npx agent-guardrails setup --agent claude-code --write-repo-config
npx agent-guardrails setup --agent cursor --write-repo-config
npx agent-guardrails setup --agent openhands --write-repo-config
npx agent-guardrails setup --agent openclaw --write-repo-config
```

Today that safe repo-local write path is intended for:

- `claude-code` via `.mcp.json`
- `cursor` via `.cursor/mcp.json`
- `openhands` via `.openhands/mcp.json`
- `openclaw` via `.openclaw/mcp.json`

If you want the current most opinionated happy path, use Claude Code first.
For broader pilot coverage, validate the same setup-first path across:

- `claude-code` as the primary path
- `cursor` and `codex` as secondary paths
- `openhands` and `openclaw` as supplementary paths

Once you connect the generated config to your agent, the happy path should feel like normal chat:

- You: `Add refund status transitions to the order service.`
- Agent: bootstraps the task contract through `start_agent_native_loop`
- Agent: makes the change, runs required commands, updates evidence
- Agent: finishes through `finish_agent_native_loop` and returns a reviewer-friendly summary with scope, risk, and future maintenance guidance

If you do not know how to phrase the task yet, you can still start in plain Chinese or plain English:

- `先帮我看看这个仓库最小能改哪里，尽量别扩大范围，最后告诉我还有什么风险。`
- `帮我修这个问题，先读仓库规则，小范围改动，跑完测试后给我 reviewer summary。`
- `I only have a rough idea. Please read the repo rules, find the smallest safe change, and finish with a reviewer summary.`

The first recommended MCP flow is:

1. `read_repo_guardrails`
2. `start_agent_native_loop`
3. work inside the declared scope
4. `finish_agent_native_loop`

`suggest_task_contract` and `run_guardrail_check` still exist as lower-level MCP tools, but they are not the preferred first-run chat flow.

## CLI Fallback Quick Start

If you want the shortest manual path, copy this:

```bash
npx agent-guardrails setup --agent codex
npx agent-guardrails plan --task "Add refund status transitions to the order service"
npm test
npx agent-guardrails check --commands-run "npm test" --review
```

By default, `setup` handles repo initialization and MCP guidance for you, and `plan` still fills in the preset's common allowed paths, required commands, and evidence path. Add extra flags only when you need a tighter contract.

You do not need to hand-write the contract for a normal task. Start with plain task text, let `plan` bootstrap the session, then let `check` tell you the finish-time command and next steps.

The CLI currently supports `en` and `zh-CN`. You can switch with `--lang zh-CN` or `AGENT_GUARDRAILS_LOCALE=zh-CN`.

What each step means:

- `init` writes the guardrail files into your repo.
- `plan` creates a task contract for the specific change you want to make.
- `check` compares the real change against that contract and your repo rules.

If you are unsure which preset to choose:

- `node-service` for backend APIs and services
- `nextjs` for Next.js apps
- `python-fastapi` for Python APIs
- `monorepo` for multi-package repos

If you are not sure about file paths, prefer the MCP flow first. The runtime can infer a sensible starting contract before you tighten anything manually.

## External Pilot Paths

Use the same setup-first loop for all five current agent entries:

- `claude-code`
- `cursor`
- `codex`
- `openhands`
- `openclaw`

Current pilot priority is:

1. `claude-code`
2. `cursor`
3. `codex`
4. `openhands`
5. `openclaw`


中文说明：

如果你要开始第一条真实 pilot，建议先用 `claude-code`。
这条路径最容易把 setup、MCP 粘贴、第一次聊天和 reviewer summary 这一整条链路跑通。

每条 pilot 只看这几个问题：

- 是否能从安装直接走到第一次聊天
- setup 输出是否清楚
- MCP 配置是否仍然是最大摩擦
- reviewer summary 是否值得信任


For each pilot:

1. run `npx agent-guardrails setup --agent <name>`
2. paste the generated snippet into that agent's MCP config
3. send the generated first chat message
4. confirm the agent uses:
   - `read_repo_guardrails`
   - `start_agent_native_loop`
   - `finish_agent_native_loop`

Use the matching pilot record in [docs/pilots/](./docs/pilots/README.md) for each individual run:

- [Claude Code pilot](./docs/pilots/claude-code.md)
- [Cursor pilot](./docs/pilots/cursor.md)
- [Codex pilot](./docs/pilots/codex.md)
- [OpenHands pilot](./docs/pilots/openhands.md)
- [OpenClaw pilot](./docs/pilots/openclaw.md)

If you need reusable blank templates instead of the ready-made files above, keep using [docs/PILOT_TEMPLATE.md](./docs/PILOT_TEMPLATE.md) and [docs/PILOT_SUMMARY_TEMPLATE.md](./docs/PILOT_SUMMARY_TEMPLATE.md).

After all five pilot runs are complete, roll the results up into [docs/pilots/SUMMARY.md](./docs/pilots/SUMMARY.md) so the next decision is based on one cross-entry view instead of scattered notes.

## What This Proves

The flagship examples are:

- the bounded-scope demo in [examples/bounded-scope-demo](./examples/bounded-scope-demo)
- the first semantic pattern-drift demo in [examples/pattern-drift-demo](./examples/pattern-drift-demo)
- the interface-drift demo in [examples/interface-drift-demo](./examples/interface-drift-demo)
- the boundary-violation demo in [examples/boundary-violation-demo](./examples/boundary-violation-demo)
- the source-test-relevance demo in [examples/source-test-relevance-demo](./examples/source-test-relevance-demo)
- the unified proof page in [docs/PROOF.md](./docs/PROOF.md)
- the pilot write-up in [docs/REAL_REPO_PILOT.md](./docs/REAL_REPO_PILOT.md)

Together they show:

- a narrow task contract can block out-of-scope changes before merge
- required commands and evidence notes are part of the merge gate, not optional ceremony
- the OSS baseline can stay green while a semantic pack adds a higher-signal consistency warning
- the semantic layer can also block implementation-only work when it silently changes the public surface
- the semantic layer can block a controller that crosses a declared module boundary even when the task contract still looks narrow
- the semantic layer can tell the difference between "a test changed" and "the right test changed"
- the same public CLI can surface deeper enforcement without splitting into a second product
- the same OSS runtime can produce deploy-readiness and post-deploy maintenance output in a Python/FastAPI repo before any Python semantic pack ships

Run it with:

```bash
node ./examples/bounded-scope-demo/scripts/run-demo.mjs all
```

Then run the Python/FastAPI baseline proof demo:

```bash
npm run demo:python-fastapi
```

Then run the OSS benchmark suite:

```bash
npm run benchmark
```

And run the first semantic proof demo:

```bash
npm run demo:pattern-drift
```

Then run the interface drift proof demo:

```bash
npm run demo:interface-drift
```

Then run the boundary and source-to-test proof demos:

```bash
npm run demo:boundary-violation
npm run demo:source-test-relevance
```

## Manual CLI Workflow

Use this docs-first loop in day-to-day work. Copy it, then replace only the task text and file paths:

```bash
agent-guardrails plan --task "Add audit logging to the release approval endpoint" --required-commands "npm test,npm run lint"
npm test
npm run lint
agent-guardrails check --commands-run "npm test,npm run lint" --review
```

Add `--intended-files`, `--allowed-change-types`, or narrower `--allow-paths` only when you want a tighter task contract than the preset default.

The intended low-friction flow is:

1. describe the task in plain language with `plan`
2. make the smallest change that fits the generated contract
3. run the commands you actually used
4. finish with the `check` command the runtime recommends

If your repo does not have `origin/main`, use the branch that matches your default branch.

Keep a short evidence note at `.agent-guardrails/evidence/current-task.md` with:

- task name
- commands run
- notable results
- residual risk or `none`

Example:

```md
# Task Evidence

- Task: Add audit logging to the release approval endpoint
- Commands run: npm test, npm run lint
- Notable results: Tests and lint passed after updating the approval endpoint and audit assertions.
- Residual risk: none
```

## CI and Automation Workflow

For CI, hooks, or orchestrated agent runs, prefer machine-readable output:

```bash
agent-guardrails check --base-ref origin/main --json
```

If the workflow wants parity with locally reported commands, set:

```text
AGENT_GUARDRAILS_COMMANDS_RUN=npm test,npm run lint
```

The generated user-repo workflow template lives in [templates/base/workflows/agent-guardrails.yml](./templates/base/workflows/agent-guardrails.yml).
The maintainer CI for this package lives in [guardrails.yml](./.github/workflows/guardrails.yml).

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

That reviewer-facing result now also carries continuity guidance from the same OSS runtime:

- reuse targets to extend first
- new surface files that broaden the maintenance surface
- continuity breaks that look like parallel abstractions or structure drift
- future maintenance risks and continuity-specific next actions

## Production Baseline

The current product direction is a generic, repo-local production baseline for AI-written code:

- the runtime shapes the task before implementation with bounded paths, intended files, change-type intent, and risk metadata
- `check` enforces small-scope, test-aware, evidence-backed, reviewable changes
- `check --review` turns the same findings into a concise reviewer-oriented report
- MCP and agent-native loop consumers reuse the same judgment path instead of re-implementing prompts
- the next production layer is deploy-readiness judgment plus post-deploy maintenance surface, not a separate deployment product

This is intentionally generic-first. It relies on file-shape heuristics, repo policy, task contracts, and command/evidence enforcement rather than framework-specific AST logic.

## Open Source vs Pro

### Today

The open-source core is already the product:

- repo-local production baseline
- smaller, more reviewable AI changes
- stronger validation and risk visibility before merge
- public benchmarks and cross-platform CI proof
- active semantic examples for pattern drift, interface drift, boundary violation, and source-to-test relevance
- a baseline repo-local workflow that can already act as a real merge gate

### Next

The next technical step is conversation-first onboarding and stronger runtime-backed enforcement through the same MCP and CLI surface:

- detector pipeline foundation
- benchmarked semantic examples
- a first TypeScript or JavaScript semantic pack under `plugins/plugin-ts/`
- first active semantic proofs for pattern drift, interface drift, boundary violation, and source-to-test relevance
- semantic analyzers for TypeScript or JavaScript first, Python second
- MCP-first onboarding and chat-oriented adoption
- broader real-repo pilots beyond the documented pilot

### Paid

Paid tiers should extend the baseline rather than replace it:

- `Pro Local`: semantic packs, auto task generation, richer local review, maintenance-aware workflows, and lower-touch deployment orchestration
- `Pro Cloud`: hosted review, shared policies, trend dashboards, deployment governance, and centralized orchestration

Baseline merge-gate features stay open source.

That means the OSS core should keep owning the production-readiness gate:

- trust verdicts
- recovery / secrets-safe / cost-aware guidance
- deploy-readiness judgment
- release and deploy checklist visibility
- post-deploy maintenance summaries

Deployment orchestration itself remains a later automation layer on top of the same runtime, not a second product that bypasses it.

The first semantic pack lives publicly in this repo today as an early semantic milestone. It is positioned as the future `Pro Local` direction, not as a separate closed-source runtime.

## Supported Agents

| Tool | Seeded file | Local workflow support | Automation guidance support |
| :-- | :-- | :-- | :-- |
| Codex | `AGENTS.md` | Yes | Yes |
| Claude Code | `CLAUDE.md` | Yes | Yes |
| Cursor | `.cursor/rules/agent-guardrails.mdc` | Yes | Yes |
| OpenHands | `.agents/skills/agent-guardrails.md` | Yes | Yes |
| OpenClaw | `OPENCLAW.md` | Yes | Yes |

## CLI Commands

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
agent-guardrails init . --preset nextjs --adapter openclaw
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

## Presets

- `node-service`
- `nextjs`
- `python-fastapi`
- `monorepo`

Each preset adjusts file heuristics and recommended read-before-write paths while keeping the same mental model.

## Adapters

The core workflow is generic, but `agent-guardrails` ships first-pass adapters for:

- [Codex](./adapters/codex/README.md)
- [Claude Code](./adapters/claude-code/README.md)
- [Cursor](./adapters/cursor/README.md)
- [OpenHands](./adapters/openhands/README.md)
- [OpenClaw](./adapters/openclaw/README.md)

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

## Current Limits

This project is useful today as a repo-local guardrail layer, but it still has important limits:

- the heuristics are still intentionally lightweight and may need tuning for larger repos
- the semantic detectors are still string- and path-driven, not full AST or type-graph analyzers
- module boundaries still depend on explicit repo policy instead of automatic architecture inference
- source-to-test relevance is heuristic and should be treated as reviewer guidance plus contract enforcement, not coverage proof
- CI users still need to choose their canonical base ref, such as `origin/main`
- the current pilot is documented in [docs/REAL_REPO_PILOT.md](./docs/REAL_REPO_PILOT.md), and broader external pilots are still pending

## Roadmap

See [docs/ROADMAP.md](./docs/ROADMAP.md).

## Strategy

See [docs/PRODUCT_STRATEGY.md](./docs/PRODUCT_STRATEGY.md) for the current semantic-analysis direction, rollout plan, and open-source versus paid product split.

## More Docs

- [Proof](./docs/PROOF.md)
- [Automation Spec](./docs/AUTOMATION_SPEC.md)
- [Market Research](./docs/MARKET_RESEARCH.md)
- [Strategy](./docs/PRODUCT_STRATEGY.md)
- [Commercialization](./docs/COMMERCIALIZATION.md)

## Architecture

See [docs/SEMANTIC_ARCHITECTURE.md](./docs/SEMANTIC_ARCHITECTURE.md).

## Benchmarks

See [docs/BENCHMARKS.md](./docs/BENCHMARKS.md).

## Pilot

See [docs/REAL_REPO_PILOT.md](./docs/REAL_REPO_PILOT.md).

## Commercialization

See [docs/COMMERCIALIZATION.md](./docs/COMMERCIALIZATION.md).

## Chinese Docs

- [Chinese Overview](./docs/zh-CN/README.md)
- [Product Strategy (Chinese)](./docs/zh-CN/PRODUCT_STRATEGY.md)

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Troubleshooting

See [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md).

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
