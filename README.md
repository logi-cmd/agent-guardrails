# Agent Guardrails

Ship AI-written code with production guardrails.

`agent-guardrails` is a zero-dependency CLI for teams that want coding agents to work like disciplined contributors instead of improvisational code generators. It adds repo-local memory, task contracts, and production-shaped validation around agent workflows so changes stay smaller, more testable, risk-aware, and easier to review.

## Start Here

If you are new, use this order:

1. Read the quick start below.
2. Pick the preset that matches your repo.
3. Copy the commands exactly.
4. Run `check` after you finish a task.

If you want to see it working before using your own repo, run the demo first:

```bash
npm run demo
```

## Why this exists

Coding agents usually fail in predictable ways:

- they invent abstractions that do not match the repo
- they change too many files at once
- they skip tests when behavior changes
- they ignore project-specific rules unless those rules are explicit and easy to load

`agent-guardrails` gives repos a small, practical workflow:

1. `init` seeds repo-local instructions and templates
2. `plan` writes a bounded task contract
3. `check` validates scope, consistency, correctness, and review or risk signals

## 60-Second Quick Start

```bash
npm install -g agent-guardrails
agent-guardrails init . --preset node-service --adapter openclaw --lang en
agent-guardrails plan --task "Add refund status transitions to the order service" --allow-paths "src/,tests/" --intended-files "src/orders/refund.js,tests/refund.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md" --lang en
agent-guardrails check --base-ref origin/main --commands-run "npm test" --review --lang en
```

If you do not want a global install, use `npx agent-guardrails ...` instead.

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

## What This Proves

The flagship proof-of-value examples are:

- the bounded-scope demo in [examples/bounded-scope-demo](./examples/bounded-scope-demo)
- the first semantic pattern-drift demo in [examples/pattern-drift-demo](./examples/pattern-drift-demo)
- the interface-drift demo in [examples/interface-drift-demo](./examples/interface-drift-demo)
- the boundary-violation demo in [examples/boundary-violation-demo](./examples/boundary-violation-demo)
- the source-test-relevance demo in [examples/source-test-relevance-demo](./examples/source-test-relevance-demo)
- the pilot write-up in [docs/REAL_REPO_PILOT.md](./docs/REAL_REPO_PILOT.md)

Together they show:

- a narrow task contract can block out-of-scope changes before merge
- required commands and evidence notes are part of the merge gate, not optional ceremony
- the OSS baseline can stay green while a semantic pack adds a higher-signal consistency warning
- the semantic layer can also block implementation-only work when it silently changes the public surface
- the semantic layer can block a controller that crosses a declared module boundary even when the task contract still looks narrow
- the semantic layer can tell the difference between "a test changed" and "the right test changed"
- the same public CLI can surface deeper enforcement without splitting into a second product

Run it with:

```bash
node ./examples/bounded-scope-demo/scripts/run-demo.mjs all
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

## Local Workflow

Use this docs-first loop in day-to-day work. Copy it, then replace only the task text and file paths:

```bash
agent-guardrails plan --task "Add audit logging to the release approval endpoint" --allow-paths "src/,tests/" --intended-files "src/release/approve.js,tests/release/approve.test.js" --allowed-change-types "implementation-only" --risk-level medium --required-commands "npm test,npm run lint" --evidence ".agent-guardrails/evidence/current-task.md"
agent-guardrails check --base-ref origin/main --commands-run "npm test,npm run lint" --review
```

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

## Production Baseline

The current product direction is a generic, repo-local production baseline for AI-written code:

- `plan` shapes the task before implementation with bounded paths, intended files, change-type intent, and risk metadata
- `check` enforces small-scope, test-aware, evidence-backed, reviewable changes
- `check --review` turns the same findings into a concise reviewer-oriented report

This is intentionally generic-first. It relies on file-shape heuristics, repo policy, task contracts, and command/evidence enforcement rather than framework-specific AST logic.

## Open Source vs Pro

### Today

The open-source core is already the product:

- repo-local production baseline
- smaller, more reviewable AI changes
- stronger validation and risk visibility before merge
- public benchmarks and cross-platform CI proof
- active semantic proof points for pattern drift, interface drift, boundary violation, and source-to-test relevance

### Next

The next technical step is deeper enforcement behind the same CLI:

- detector pipeline foundation
- benchmarked proof-of-value
- a repo-contained first TypeScript or JavaScript semantic pack under `plugins/plugin-ts/`
- first active semantic proofs for pattern drift, interface drift, boundary violation, and source-to-test relevance
- semantic analyzers for TypeScript or JavaScript first, Python second
- broader real-repo pilots beyond the documented pilot

### Paid

Paid tiers should extend the baseline rather than replace it:

- `Pro Local`: semantic packs, richer local review, and pattern-learning workflows
- `Pro Cloud`: hosted review, shared policies, trend dashboards, and centralized governance

Baseline merge-gate features stay open source.

The first semantic pack lives publicly in this repo today as a proof point. It is positioned as the future `Pro Local` direction, not as a separate closed-source runtime.

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

If you are not sure what to type, start with `init`, then copy the local workflow example above.

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

See [docs/PRODUCT_STRATEGY.md](./docs/PRODUCT_STRATEGY.md) for the current semantic-analysis direction, proof-of-value plan, and open-source versus paid product split.

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
