# OSS vs Pro Feature Boundary

Last updated: 2026-03-25

## Design Principle

> **OSS owns the merge gate. Pro owns the efficiency and depth.**

If a feature is required to use `agent-guardrails` as a real merge gate, it belongs in OSS.
If a feature reduces manual work, improves signal quality, or adds depth, it belongs in Pro.

---

## Feature Matrix

### Core Merge Gate (OSS Forever Free)

| Feature | OSS | Pro | Why OSS |
|---------|-----|-----|---------|
| `init / plan / check` | ✅ | ✅ | Required for merge gate |
| Task contracts | ✅ | ✅ | Required for merge gate |
| `check --review` | ✅ | ✅ | Required for merge gate |
| `check --json` | ✅ | ✅ | Required for CI integration |
| Scope validation | ✅ | ✅ | Required for merge gate |
| Required commands | ✅ | ✅ | Required for merge gate |
| Evidence files | ✅ | ✅ | Required for merge gate |
| Basic pass/fail/block | ✅ | ✅ | Required for merge gate |
| MCP server | ✅ | ✅ | Required for agent integration |
| Agent adapters | ✅ | ✅ | Required for agent integration |

### Trust Assessment (Pro Differentiation)

| Feature | OSS | Pro | Why Pro |
|---------|-----|-----|---------|
| Pass/Fail/Block verdict | ✅ | ✅ | Required for merge gate |
| **Trust Score (0-100)** | ❌ | ✅ | Efficiency layer |
| **Risk breakdown by dimension** | ❌ | ✅ | Depth layer |
| **Historical trend analysis** | ❌ | ✅ | Depth layer |
| **Confidence calibration** | ❌ | ✅ | Efficiency layer |

### Semantic Detection (Pro Differentiation)

| Feature | OSS | Pro | Why Pro |
|---------|-----|-----|---------|
| Basic scope check | ✅ | ✅ | Required for merge gate |
| **Pattern drift detection** | ⚠️ Basic | ✅ Full | Depth layer |
| **Interface drift detection** | ⚠️ Basic | ✅ Full | Depth layer |
| **Boundary violation detection** | ⚠️ Basic | ✅ Full | Depth layer |
| **Source-test relevance** | ⚠️ Basic | ✅ Full | Depth layer |

*Note: OSS has basic semantic detection. Pro has deeper, more accurate detection.*

### Automation & Efficiency (Pro Differentiation)

| Feature | OSS | Pro | Why Pro |
|---------|-----|-----|---------|
| Manual task contract | ✅ | ✅ | Required for merge gate |
| **Auto task generation** | ❌ | ✅ | Efficiency layer |
| **Smart contract suggestion** | ❌ | ✅ | Efficiency layer |
| **Rough-intent mode** | ⚠️ Basic | ✅ Full | Efficiency layer |
| **Repo pattern learning** | ❌ | ✅ | Depth layer |

### Deploy & Maintenance (Pro Differentiation)

| Feature | OSS | Pro | Why Pro |
|---------|-----|-----|---------|
| Deploy-readiness verdict | ✅ | ✅ | Required for merge gate |
| **Deploy orchestration** | ❌ | ✅ | Efficiency layer |
| **Rollback assistance** | ❌ | ✅ | Efficiency layer |
| **Post-deploy verify** | ❌ | ✅ | Efficiency layer |
| **Maintenance continuity insights** | ❌ | ✅ | Depth layer |

### Team & Collaboration (Pro Cloud Only)

| Feature | OSS | Pro Local | Pro Cloud |
|---------|-----|-----------|-----------|
| Single user | ✅ | ✅ | ✅ |
| **Shared policies** | ❌ | ❌ | ✅ |
| **Team dashboard** | ❌ | ❌ | ✅ |
| **Audit trails** | ❌ | ❌ | ✅ |
| **Centralized orchestration** | ❌ | ❌ | ✅ |

---

## Pricing Summary

| Tier | Price | Target User |
|------|-------|-------------|
| **OSS Core** | Free | All users |
| **Pro Local** | $12-15/month | Power users, small teams |
| **Pro Cloud** | $24-29/month/developer | Teams, organizations |

---

## The Paid Promise

### What Pro Local Sells

> **Less manual work, lower review effort, lower maintenance drift.**

Not "basic checks finally work" — but:
- Less time configuring contracts
- Higher signal from semantic detection
- Better guidance for rough-intent workflows
- Smarter suggestions based on repo patterns

### What Pro Cloud Sells

> **Team visibility, shared trust, centralized governance.**

- Shared policies across the team
- Historical trends and analytics
- Audit trails for compliance
- Centralized dashboard

---

## Migration Path

```
OSS → Pro Local → Pro Cloud

1. Start with OSS (free merge gate)
2. Upgrade to Pro Local (when you want efficiency)
3. Upgrade to Pro Cloud (when you need team features)
```

---

## Implementation Notes

### Trust Score Calculation (Pro Only)

```javascript
// OSS: Simple verdict
{
  verdict: "pass" | "fail" | "block",
  summary: "Safe to merge"
}

// Pro: Trust score with breakdown
{
  verdict: "pass" | "fail" | "block",
  trustScore: 87,  // 0-100
  breakdown: {
    scope: 95,      // Well bounded
    validation: 80, // Tests pass but coverage weak
    consistency: 85, // Minor pattern concerns
    risk: 75        // Some residual risk
  },
  confidence: 0.92,
  historicalTrend: "improving" | "stable" | "declining"
}
```

### Semantic Detection Depth

```javascript
// OSS: Basic detection
detectPatternDrift(files) {
  // Simple filename pattern matching
  // Returns: { detected: boolean, message: string }
}

// Pro: Full semantic detection
detectPatternDrift(files) {
  // AST-based analysis
  // Cross-file pattern matching
  // Historical pattern comparison
  // Returns: {
  //   detected: boolean,
  //   confidence: number,
  //   affectedAbstractions: string[],
  //   suggestedConsolidation: string | null
  // }
}
```

---

## Guardrails

### Do NOT Move to Pro

- Basic pass/fail/block verdict
- Scope validation
- Required commands check
- Evidence file handling
- MCP server
- Agent adapters
- Any feature required for merge gate

### Do Move to Pro

- Trust score (0-100)
- Risk breakdown by dimension
- Historical trend analysis
- Auto task generation
- Smart contract suggestion
- Deploy orchestration
- Rollback assistance
- Maintenance continuity insights
- Shared policies (Cloud)
- Team dashboard (Cloud)
