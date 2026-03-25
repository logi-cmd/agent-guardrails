# Rough-Intent Mode: Start from a Vague Request

## The Problem

Many users don't know exactly what they want when they start:

- "I think the refund flow is slow"
- "The user profile page feels wrong"
- "Can you make the API better?"

Traditional tools require precise specifications. But real humans work from rough ideas.

## The Solution

`agent-guardrails` accepts rough intent and suggests the **smallest safe tasks** first.

### How It Works

1. **You describe what you roughly want**
2. **Guardrails analyzes the repo context**
3. **You get 2-3 specific, bounded task suggestions**
4. **Pick one, implement, and validate**

## Example Flow

### Step 1: Rough Request

```
User: "I think the refund flow is slow. Can you look at it?"
```

### Step 2: Guardrails Response

```markdown
# Rough Intent Analysis

Your request sounds broad, so here are the **smallest safe tasks** first:

## 🎯 Recommended: Refine the existing target first
Task: Make the smallest safe behavior change inside `app/services/refund.py`
without widening the public surface.

Scope:
- app/services/refund.py
- tests/test_refund.py

Definition of Done:
- Keep the diff inside: app/services/refund.py, tests/test_refund.py
- Run: pytest -q
- Update evidence: .agent-guardrails/evidence/current-task.md

## Alternative: Add a bounded validation or guard
Task: Add the smallest validation or guard inside `app/services/refund.py`
and keep the existing structure.

## Alternative: Strengthen the matching test path first
Task: Add or tighten the nearest test coverage for `app/services/refund.py`
before widening the implementation.
```

### Step 3: Pick and Execute

```
User: "I'll go with the recommended task"

Guardrails: Great! Here's your task contract:
- Scope: app/services/refund.py, tests/test_refund.py
- Required: pytest -q
- Evidence: .agent-guardrails/evidence/current-task.md

Before merge, run: agent-guardrails check --review
```

## How to Use

### Via MCP (Claude Code, Cursor, etc.)

```
I only have a rough idea. Please read the repo rules,
find the smallest safe change, and finish with a reviewer summary.
```

### Via CLI

```bash
agent-guardrails plan --task "I think the refund flow is slow"
```

### Via API

```javascript
const result = await mcp.callTool("suggest_task_contract", {
  taskRequest: "The refund flow feels slow, can you help?"
});

// result.roughIntent.suggestions contains 2-3 bounded tasks
// result.roughIntent.recommendedTask is the safest first step
```

## Why This Matters

| Traditional Workflow | Rough-Intent Workflow |
|---------------------|----------------------|
| "Fix the slow thing" → AI changes 47 files | "Fix the slow thing" → Guardrails suggests 3 bounded tasks |
| Review takes hours | Review takes minutes |
| High risk of scope drift | Scope is bounded from the start |
| Unclear what to test | Tests are required by contract |

## The Philosophy

> The smallest safe change is usually the right change.

When you start from rough intent:
1. Guardrails reads the repo context
2. It identifies the **narrowest working slice**
3. It suggests tasks that stay **inside existing patterns**
4. It requires **explicit validation** before merge

This prevents the common AI pattern of:
- Creating new abstractions when extending would work
- Changing too many files when one would suffice
- Skipping tests when they should be required

## Rough-Intent vs Precise-Intent

| Rough Intent | Precise Intent |
|--------------|---------------|
| "The API feels slow" | "Add caching to GET /api/users with 5-minute TTL" |
| "Fix the bug" | "Fix null pointer in RefundService.process() line 42" |
| "Make it better" | "Reduce latency from 200ms to under 50ms" |

**Both work with guardrails.** Rough-intent just gives you suggestions first.

## Best Practices

1. **Start rough, then refine**
   - First request: "The X flow is slow"
   - Guardrails suggests 3 tasks
   - Pick one, get precise contract

2. **Let the repo guide you**
   - Guardrails reads existing patterns
   - It suggests tasks that match repo style
   - Don't fight the repo, follow it

3. **One task at a time**
   - Complete one bounded task
   - Run validation
   - Then start the next

4. **Trust the process**
   - Small changes accumulate safely
   - Large changes cause drift
   - Guardrails keeps you on the safe path
