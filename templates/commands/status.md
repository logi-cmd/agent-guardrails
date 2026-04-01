---
name: status
description: "Show current project state and task status"
category: info
complexity: simple
---

# /ag:status - Project Status

## Triggers
- User wants to see current project state
- User wants to check task contract status
- User types `/ag:status`

## Context Trigger Pattern
```
/ag:status
```

## Behavioral Flow
1. **Config**: Show `.agent-guardrails/config.json` state
2. **Task**: Show current task contract if active
3. **Evidence**: Show evidence file status
4. **Daemon**: Show daemon status if running
5. **Summary**: Quick overview of project health

## Output Sections
- **Configuration**: Preset, allowed paths, risk level
- **Task Contract**: Active task, scope, risk
- **Evidence**: Evidence file path and last update
- **Daemon**: Running/stopped, last check time
- **Health**: Overall project health status

## Examples

### Show status
```
/ag:status
# Shows comprehensive project state
```

## Boundaries

**Will:**
- Show current project state
- Display task contract details
- Report daemon status

**Will Not:**
- Modify files
- Run checks automatically
