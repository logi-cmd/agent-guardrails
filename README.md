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
2. run `agent-guardrails setup --agent <your-agent>` in your repo
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
2. 在仓库里运行 `agent-guardrails setup --agent <你的 agent>`
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
agent-guardrails setup --agent <your-agent>
```

If your agent supports a clearly safe repo-local config path, use:

```bash
agent-guardrails setup --agent <your-agent> --write-repo-config
```

Then open your existing agent and start chatting.

For the current most opinionated happy path, start with:

```bash
agent-guardrails setup --agent claude-code
```

如果你只知道一个大概方向，也可以直接这样说：

- `先帮我看看这个仓库最小能改哪里，尽量别扩大范围，最后告诉我还有什么风险。`
- `帮我修这个问题，先读仓库规则，小范围改动，跑完测试后给我 reviewer summary。`
- `I only have a rough idea. Please read the repo rules, find the smallest safe change, and finish with a reviewer summary.`

Proof in one page:

- [What this catches that normal AI coding workflows miss](./docs/PROOF.md)
- [Python/FastAPI baseline proof demo](./examples/python-fastapi-demo/README.md)

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

## Setup Details / 更多设置

If you want the default product entry, let `setup` prepare the repo plus the agent config you need:

```bash
npm install -g agent-guardrails
npx agent-guardrails setup --agent <your-agent>
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

Examples:

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

Once you connect the generated config to your agent, the happy path should feel like normal chat:

- You: `Add refund status transitions to the order service.`
- Agent: bootstraps the task contract through `start_agent_native_loop`
- Agent: makes the change, runs required commands, updates evidence
- Agent: finishes through `finish_agent_native_loop` and returns a reviewer-friendly summary with scope, risk, and future maintenance guidance

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

If you want the current most opinionated happy path, use Claude Code first.
For broader pilot coverage, validate the same setup-first path across:

- `claude-code` as the primary path
- `cursor` and `codex` as secondary paths
- `openhands` and `openclaw` as supplementary paths

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

## Deeper Usage

For the full manual CLI flow, supported agents, presets, adapters, FAQ, and current limits, see [docs/WORKFLOWS.md](./docs/WORKFLOWS.md).

## Roadmap

See [docs/ROADMAP.md](./docs/ROADMAP.md).

## Strategy

See [docs/PRODUCT_STRATEGY.md](./docs/PRODUCT_STRATEGY.md) for the current semantic-analysis direction, rollout plan, and open-source versus paid product split.

## More Docs

- [Proof](./docs/PROOF.md)
- [Workflows](./docs/WORKFLOWS.md)
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
