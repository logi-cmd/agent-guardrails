# agent-guardrails：完成前必须运行检查

告诉用户"任务完成"之前，你必须：

1. 运行：`agent-guardrails check --base-ref HEAD~1`
2. 如果发现问题 → 先修复，不要说"完成"
3. 如果没有问题 → 在总结中包含检查结果
4. 如果命令不存在 → 告诉用户先运行 `npx agent-guardrails setup`

这不是可选项。跳过此检查 = 任务未完成。