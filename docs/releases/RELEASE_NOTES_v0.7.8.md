# Release Notes: v0.7.8

## Minimize Project Pollution — Smart File Handling

**Release date**: 2026-03-31

### What Changed

Installation now respects existing project files. No more skipping `AGENTS.md` when it already exists, no more creating CI workflows when you already have them.

### Key Improvements

#### 1. `AGENTS.md` — Append, Don't Skip

**Before**: If `AGENTS.md` existed, guardrail instructions were silently skipped. AI agents received no guardrail rules.

**After**: Guardrail instructions are appended with HTML markers for easy identification:
```markdown
<!-- agent-guardrails:start -->
## Guardrail Rules
...
<!-- agent-guardrails:end -->
```

#### 2. CI Detection — Don't Duplicate

**Before**: `.github/workflows/agent-guardrails.yml` was always created, potentially conflicting with existing CI.

**After**: If any `.yml`/`.yaml` files exist in `.github/workflows/`, the guardrails workflow is skipped.

#### 3. Write Mode Classification

| File Type | Mode | Behavior |
|-----------|------|----------|
| `AGENTS.md` | Append | Add to end with markers |
| `.agent-guardrails/` internal | Force | Safe to overwrite templates |
| Adapter files | Create | Never overwrite user files |
| `.github/workflows/` | Conditional | Only if no CI exists |

### Upgrade

```bash
npm update -g agent-guardrails
```

### Previous Release

- [v0.7.7](https://github.com/logi-cmd/agent-guardrails/releases/tag/v0.7.7) — GUI removal: headless daemon + MCP chat feedback
