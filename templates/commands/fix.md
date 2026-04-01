---
name: fix
description: "Auto-fix safe Tier-1 issues"
category: fix
complexity: simple
---

# /ag:fix - Auto-Fix

## Triggers
- Guardrail check found issues
- User wants to fix safe issues automatically
- User types `/ag:fix`

## Context Trigger Pattern
```
/ag:fix [--dry-run]
```

**Default behavior**: Apply Tier-1 auto-fixes (safe, reversible)

## Behavioral Flow
1. **Scan**: Run guardrail check to identify fixable issues
2. **Filter**: Only Tier-1 fixes (safe, reversible)
3. **Preview**: Show what will be fixed
4. **Apply**: Execute fixes with rollback capability
5. **Verify**: Re-check after fixes applied

## Fixable Issues (Tier 1)
- ✅ Missing evidence file → Create it
- ✅ Missing test stub → Create stub
- ✅ .gitignore not updated → Add entries
- ✅ Empty evidence sections → Populate templates

## Examples

### Auto-fix
```
/ag:fix
# Scans for Tier-1 issues and applies fixes
```

### Dry run
```
/ag:fix --dry-run
# Shows what would be fixed without applying
```

## Boundaries

**Will:**
- Fix safe, reversible issues
- Show preview before applying
- Rollback if fix fails

**Will Not:**
- Fix business logic issues
- Modify source code
- Override user-specified constraints
