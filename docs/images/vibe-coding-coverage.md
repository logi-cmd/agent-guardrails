# Vibe Coding Coverage — Real Output Examples

## New Detectors (state-mgmt, async-risk, performance)

```
[warning] continuity/state-mgmt-complexity-multi-file
[warning] continuity/state-mgmt-complexity-state-file
[warning] continuity/state-mgmt-complexity-state-file
[warning] performance/perf-degradation-file-growth
[warning] performance/perf-degradation-large-asset
```

## Precision Prompts

zh-CN:
```
1. 这次改动涉及状态管理文件，请确认同步逻辑是否正确？（是/否）
2. 检测到异步逻辑风险模式，请确认已正确处理并发？（是/否）
3. 检测到文件大幅增长，请确认是否需要拆分？（是/否）
```

en:
```
1. This change involves state management files. Confirm synchronization logic is correct? (yes/no)
2. Async logic risk pattern detected. Confirm concurrency is handled correctly? (yes/no)
3. Significant file growth detected. Consider splitting? (yes/no)
```

## Intent Routing

zh-CN:
```
解释一下这次改动 → explain_change
查询变更历史 → query_archaeology
检查一下 → run_guardrail_check
```

en:
```
explain this change → explain_change
query archaeology → query_archaeology
check → run_guardrail_check
```

## MCP Tools

```
explain_change → { explanation: "未检测到变更。", fileCount: 0 }
query_archaeology → { sessionId: null, notes: [], noteCount: 0 }
```

## i18n

```
zh-CN: agent-guardrails 对话服务已启动：http://localhost:3000
en:    agent-guardrails chat server running at http://localhost:3000
zh-CN: 文件增长超过 50%，建议审查增长原因
en:    File grew more than 50%, review growth cause
```

## Test Results

```
📊 Results: 12 passed, 0 failed
PASS daemon
PASS release
```
