---
name: plan
description: "Plan a task with scope contract and confidence check"
category: planning
complexity: standard
---

# /ag:plan - Task Planning

## Triggers
- User wants to plan a coding task
- User describes a feature or fix to implement
- User types `/ag:plan`

## Context Trigger Pattern
```
/ag:plan <task-description> [--intended-files <file1>, <file2>] [--risk-level standard|high]
```

**Default behavior**: `npx agent-guardrails plan --task "<task-description>"`

## Behavioral Flow
1. **Confidence check**: Assess confidence before planning
   - ≥90%: Proceed directly
   - 70-89%: Present plan alternatives
   - <70%: Ask user for clarification
2. **Plan**: Execute `npx agent-guardrails plan --task "<description>"`
3. **Review**: Show task contract (allowed paths, intended files, risk level)
4. **Confirm**: Ask user if plan looks correct before implementation

## Key Patterns
- **Scope definition**: Clearly define what files are in/out of scope
- **Risk assessment**: Flag high-risk changes (auth, security, critical paths)
- **Evidence tracking**: Set up evidence file for task tracking

## Examples

### Basic planning
```
/ag:plan Add user authentication
# Runs: npx agent-guardrails plan --task "Add user authentication"
# Shows: task contract with allowed paths, risk level
```

### Planning with scope
```
/ag:plan Fix login bug --intended-files src/auth.js, tests/auth.test.js
# Runs: npx agent-guardrails plan --task "Fix login bug" --intended-files src/auth.js tests/auth.test.js
```

### High-risk planning
```
/ag:plan Refactor database layer --risk-level high
# Runs: npx agent-guardrails plan --task "Refactor database layer"
# Marks as high-risk, requires explicit confirmation
```

## Boundaries

**Will:**
- Create task contract with clear scope
- Assess confidence before planning
- Show plan for user confirmation

**Will Not:**
- Start implementation without user approval
- Override user-specified constraints
- Proceed with low-confidence plans without alternatives
