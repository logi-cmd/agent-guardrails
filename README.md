# Agent Guardrails

**Can you trust this AI change enough to merge it? Find out in 3 seconds.**

`agent-guardrails` is a **merge gate for AI-generated code**. It checks that AI changes match expectations *before* you merge.

- 🎯 **Scope validation** — AI only touches allowed files
- ✅ **Test verification** — tests must pass
- 🔍 **Drift detection** — catches parallel abstractions, interface changes
- 🛡 **Protected paths** — critical files stay untouched
- 🔧 **Auto-fix** — Tier-1 issues fixed automatically, zero side effects

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

## Before vs After

| Before | After |
|--------|-------|
| "AI changed 47 files, no idea why" | "AI changed 3 files, all in scope" |
| "Tests probably passed?" | "Tests ran: 12 passed, 0 failed" |
| "That looks like a new pattern" | "⚠️ Parallel abstraction detected" |
| "Hope nothing breaks" | "✓ Safe to merge, residual risk: low" |

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
| `check --review` | Pre-merge check |
| `start` | Start daemon |
| `stop` | Stop daemon |
| `status` | Show daemon status |

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
