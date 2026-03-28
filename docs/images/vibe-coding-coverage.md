# Vibe Coding Coverage — Real Output Examples

## New Detectors (state-mgmt, async-risk, performance)

```
[warning] continuity/state-mgmt-complexity-multi-file
[warning] continuity/state-mgmt-complexity-state-file
[warning] continuity/state-mgmt-complexity-state-file
[warning] performance/perf-degradation-file-growth
[warning] performance/perf-degradation-large-asset
```

## Precision Prompts (zh-CN)

```
1. 这次改动涉及状态管理文件，请确认同步逻辑是否正确？（是/否）
2. 检测到异步逻辑风险模式，请确认已正确处理并发？（是/否）
3. 检测到文件大幅增长，请确认是否需要拆分？（是/否）
```

## Intent Routing

```
explain zh: {"tool":"explain_change","args":{}}
explain en: {"tool":"explain_change","args":{}}
query zh: {"tool":"query_archaeology","args":{}}
query en: {"tool":"query_archaeology","args":{}}
check zh: {"tool":"run_guardrail_check","args":{"review":true}}
```

## MCP Tools

```
explain_change → { explanation: '未检测到变更。', fileCount: 0, task: '' }
query_archaeology → { sessionId: null, notes: [], noteCount: 0 }
```

## i18n

```
ZH chat.serverStarted: agent-guardrails 对话服务已启动：http://localhost:3000
EN chat.serverStarted: agent-guardrails chat server running at http://localhost:3000
ZH performance.file-growth: 文件增长超过 50%，建议审查增长原因
EN performance.file-growth: File grew more than 50%, review growth cause
```

## Test Results

```
📊 Results: 12 passed, 0 failed
PASS daemon
PASS release
```
