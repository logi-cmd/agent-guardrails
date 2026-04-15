---
name: check
description: "Run guardrail check on recent changes"
category: validation
complexity: simple
---

# /ag:check - Guardrail Check

## Triggers
- User wants to validate recent changes before commit
- User wants to check scope drift, test coverage, or drift detection
- User types `/ag:check`

## Context Trigger Pattern
```
/ag:check [--base-ref <ref>] [--commands-run "<cmd1>, <cmd2>"]
```

**Default behavior**: `npx agent-guardrails check --base-ref HEAD~1`

## Behavioral Flow
1. **Run**: Execute `npx agent-guardrails check --base-ref HEAD~1`
2. **Analyze**: Review findings (scope-drift, missing-test, new-abstraction)
3. **Report**: Show results in chat with severity levels
4. **Fix**: If issues found, suggest fixes or run `/ag:fix`

## Key Patterns
- **Scope check**: Verify only intended files were modified
- **Test validation**: Ensure tests run or are updated
- **Drift detection**: Flag parallel abstractions or interface changes

## Examples

### Basic check
```
/ag:check
# Runs: npx agent-guardrails check --base-ref HEAD~1
```

### Check with commands run
```
/ag:check --commands-run "npm test, npm run lint"
# Runs: npx agent-guardrails check --base-ref HEAD~1 --commands-run "npm test, npm run lint"
```

### Check specific base
```
/ag:check --base-ref origin/main
# Runs: npx agent-guardrails check --base-ref origin/main
```

## Boundaries

**Will:**
- Run check and report findings
- Suggest fixes for found issues
- Show confidence level of the check

**Will Not:**
- Automatically fix issues (use `/ag:fix` instead)
- Modify files without user approval
