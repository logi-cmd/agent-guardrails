---
name: review
description: "Review changes before merge with risk analysis"
category: review
complexity: standard
---

# /ag:review - PR Review

## Triggers
- User wants to review changes before merge
- User has finished implementing a task
- User types `/ag:review`

## Context Trigger Pattern
```
/ag:review [--base-ref <ref>] [--commands-run "<cmd1>, <cmd2>"]
```

**Default behavior**: `npx agent-guardrails check --base-ref origin/main --review`

## Behavioral Flow
1. **Analyze**: Review all changes vs base branch
2. **Risk assessment**: Identify high-risk areas (auth, security, critical paths)
3. **Evidence check**: Verify evidence file is updated
4. **Report**: Generate reviewer summary with:
   - Changed files list
   - Validation status
   - Risk level
   - Remaining concerns

## Key Patterns
- **Comprehensive review**: Scope + tests + drift + evidence
- **Risk stratification**: Categorize changes by risk level
- **Deploy readiness**: Clear verdict on merge safety

## Examples

### Basic review
```
/ag:review
# Runs: npx agent-guardrails check --base-ref origin/main --review
```

### Review with commands run
```
/ag:review --commands-run "npm test, npm run lint"
# Shows commands that were run in the review summary
```

## Boundaries

**Will:**
- Generate comprehensive review summary
- Flag high-risk changes
- Provide clear merge recommendation

**Will Not:**
- Auto-merge without user approval
- Skip evidence verification
