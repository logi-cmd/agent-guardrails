# Agent Guardrails

**Can you trust this AI change enough to merge it? Find out in 3 seconds.**

`agent-guardrails` is a **merge gate for AI-generated code**. It checks that AI changes match expectations *before* you merge.

- 🎯 **Scope validation** — AI only touches allowed files
- ✅ **Test verification** — tests must pass
- 🔍 **Drift detection** — catches parallel abstractions, interface changes
- 🛡 **Protected paths** — critical files stay untouched
- 🔧 **Auto-fix** — Tier-1 issues fixed automatically, zero side effects
- 🧬 **Mutation testing** — optional lightweight built-in slice catches vacuous tests (config-gated, default-disabled)

## Who it is for

`agent-guardrails` is aimed first at **overseas solo developers and small teams** already using AI coding tools.

- solo founders shipping real product code with Claude Code, Cursor, Codex, Gemini, or OpenCode
- small product teams that want the same repo guardrails even when each developer uses a different agent
- consultants and agencies that need safer AI-assisted changes across multiple client repos

It is **not** primarily for one-off toy prompts or teams looking to replace their coding agent entirely.

## Why pay if AI coding is already strong?

AI coding tools already generate plenty of code. The paid opportunity is not "more code generation." It is:

- **less manual setup** before each task
- **faster trust decisions** at review time
- **higher-signal repo-aware checks** than prompt text alone can provide
- **lower maintenance drift** as AI edits accumulate over time
- **safer deploy / rollback workflows** for people shipping without a large platform team

OSS should remain a real merge gate. Paid tiers should help users get to a safe merge **faster, more consistently, and with less cognitive overhead**.

## Quick Start

```bash
# 1. Install
npm install -g agent-guardrails

# 2. Set up in your project
cd your-repo
agent-guardrails setup --agent claude-code

# 3. Enforce rules (recommended)
agent-guardrails enforce --all
```

Supports 5 agents: `claude-code`, `cursor`, `opencode`, `codex`, `gemini`.

## Core Workflow

### 1. Setup — Initialize your project

```bash
agent-guardrails setup --agent <your-agent>
```

This automatically:
- ✅ Generates `.agent-guardrails/config.json`
- ✅ Generates/appends `AGENTS.md`
- ✅ Injects a git pre-commit hook
- ✅ Creates AI tool config files (MCP)

### 2. Enforce — Make AI follow the rules (recommended)

The `AGENTS.md` from `setup` is advisory. AI agents may ignore it. **`enforce` injects guardrail instructions directly into each agent's system-level auto-read files** (like `CLAUDE.md`, `GEMINI.md`), which take far higher priority.

```bash
# Enforce for all supported agents
agent-guardrails enforce --all

# Or a specific agent
agent-guardrails enforce --agent claude-code

# See which agents are supported
agent-guardrails enforce --help
```

| Agent | Injection file | Auto-read level |
|-------|---------------|-----------------|
| Claude Code | `CLAUDE.md` | ⭐⭐⭐ System |
| Cursor | `.cursor/rules/agent-guardrails-enforce.mdc` | ⭐⭐⭐ System |
| OpenCode | `.opencode/rules/agent-guardrails-enforce.md` | ⭐⭐⭐ System |
| Codex | `.codex/instructions.md` | ⭐⭐⭐ System |
| Gemini CLI | `GEMINI.md` | ⭐⭐⭐ System |

**Remove enforcement** (safely preserves your existing content):

```bash
agent-guardrails unenforce --all
agent-guardrails unenforce --agent claude-code
```

### 3. Daily workflow

After setup, the AI automatically runs checks before finishing tasks:

```bash
agent-guardrails check --base-ref HEAD~1
```

Results appear directly in the chat. The git pre-commit hook provides a safety net.

**Manual check (optional):**

```bash
agent-guardrails check --review
```

### 4. Plan a task (optional)

Keep the AI focused by creating a task contract first:

```bash
agent-guardrails plan --task "Add user authentication"
```

## Engineering Harness Priorities

The product is moving toward **runtime-backed guardrails**, so the most important maintenance work is not adding more heuristics blindly — it is tightening the harness that controls them. The following priorities come from a harness-engineering audit across 8 dimensions (execution loop, agent topology, context management, failure recovery, hook completeness, evaluation design, loop detection, tool boundaries).

**Recently shipped:**

- Bash file-write interception now covers the Claude Code Bash tool path
- MCP loop protection and daemon state-dedup guard against redundant checks
- session expiry cleanup is wired up for long-running runtime state
- structured runtime errors and circuit-breaker behavior replace silent failure paths
- continuity / performance findings now surface in review output
- lightweight reviewer-output suppression reduces redundant continuity noise without hiding raw findings
- `enforce` / `unenforce` round-trip coverage runs in the default test path
- release-facing docs and package version are checked for consistency
- CI now uses cache-aware npm setup plus lightweight static verification
- Gemini CLI setup now installs native BeforeTool / AfterTool hooks
- `agent-guardrails doctor` provides a minimal OSS installation diagnostic path
- **optional lightweight built-in mutation-testing slice** integrated into OSS check pipeline (config-gated, default-disabled, warning-only, baseline-first)
- working-tree diff parsing fixed for correct path extraction
- direct module test coverage for mutation detector, i18n messages, and `listChangedFiles()`

**Still open:**

- keep Codex on the MCP/instructions fallback path until native hooks are stable beyond the current experimental Bash-only support

**Principle**: prefer lightweight, reproducible checks over opaque "smart" behavior. Every harness component must justify itself against an observed failure mode.

If you are contributing, treat these as first-class product work, not just internal cleanup.

## Before vs After

| Before | After |
|--------|-------|
| "AI changed 47 files, no idea why" | "AI changed 3 files, all in scope" |
| "Tests probably passed?" | "Tests ran: 12 passed, 0 failed" |
| "That looks like a new pattern" | "⚠️ Parallel abstraction detected" |
| "Hope nothing breaks" | "✓ Safe to merge, residual risk: low" |

## Why this beats a DIY plugin stack

Many users already have Claude Code, Cursor, Codex, or Gemini plus custom prompts, hooks, and MCP tools.

The reason to use `agent-guardrails` is not that those tools cannot generate code.
It is that a DIY stack still leaves a lot of manual work around:

- defining repo-safe boundaries before implementation
- checking whether the diff stayed inside those boundaries
- proving validation actually ran
- summarizing residual risk for a human reviewer
- keeping repeated AI edits from slowly fragmenting the repo

`agent-guardrails` is strongest when users want to keep their current coding agent and add a repeatable trust layer on top.

## Learn more

If you want the product story, pricing story, and competitive framing in one place:

- [Landing page copy](./docs/LANDING_PAGE_COPY.md)
- [Pricing copy](./docs/PRICING_COPY.md)
- [FAQ: Why buy this if I already have Claude / Cursor / Codex?](./docs/FAQ_WHY_BUY.md)
- [DIY plugin stack vs agent-guardrails](./docs/DIY_VS_AGENT_GUARDRAILS.md)
- [Proof: what this catches that normal AI coding workflows miss](./docs/PROOF.md)

## Three-layer Enforcement

| Layer | Mechanism | Effect |
|-------|-----------|--------|
| L1: enforce | Inject into agent system-level instruction files | ⭐⭐⭐ Strongest — auto-read by AI |
| L2: AGENTS.md | Project-level rule file | ⭐⭐ Medium — AI may ignore |
| L3: pre-commit hook | Git commit interception | ⭐⭐⭐ Safety net — enforced |

**Recommended**: `setup` + `enforce --all` = double protection.

## Competitor Comparison

| Feature | CodeRabbit | Sonar | agent-guardrails |
|---------|-----------|-------|------------------|
| Pre-generation constraints | ❌ Post-comment | ❌ Post-check | ✅ |
| Scope control | ❌ | ❌ | ✅ |
| Task context | ❌ | ❌ | ✅ |
| Test relevance checks | ❌ | ❌ | ✅ |

**Key difference**: define boundaries *before* code generation, not *after* discovering problems.

## CLI Reference

| Command | Purpose |
|---------|---------|
| `setup --agent <name>` | Initialize project |
| `enforce --all` | Enforce rules (recommended) |
| `unenforce --all` | Remove enforcement |
| `plan --task "..."` | Create task contract |
| `check --review` | Run reviewer-facing guardrail check |
| `doctor` | Diagnose current installation |
| `start` | Start daemon |
| `stop` | Stop daemon |
| `status` | Show daemon status |

## Maintainer Verification Loop

For meaningful changes, the repo should be verifiable with a small repeatable loop:

```bash
npm test
agent-guardrails check --review
```

When changing setup, enforce, hooks, or release-facing behavior, also verify the relevant generated files and docs stay aligned with the shipped version.

## Install & Update

```bash
# Install
npm install -g agent-guardrails

# Update
npm update -g agent-guardrails
```

## Docs

- [CHANGELOG](./CHANGELOG.md)
- [Workflows](./docs/WORKFLOWS.md)
- [Proof](./docs/PROOF.md)
- [Roadmap](./docs/ROADMAP.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT
