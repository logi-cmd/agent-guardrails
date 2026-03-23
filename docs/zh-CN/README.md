# Agent Guardrails 中文概览

`agent-guardrails` 是一个零依赖 CLI，用来给 AI coding 工作流加一层 repo-local 的生产护栏。

它当前最核心的能力是：

- 用 `init` 向仓库写入规则、模板和 adapter 文件
- 用 `plan` 把自然语言任务收束成结构化 task contract
- 用 `check` 检查范围、验证、风险和 review 信号

它要解决的不是“AI 会不会写出能运行的代码”，而是：

- AI 会不会改太多
- AI 会不会改错层
- AI 会不会引入不符合项目模式的新抽象
- AI 会不会缺少可信验证
- Reviewer 能不能快速判断这次改动是否值得合并

当前版本已经适合做：

- repo-local guardrail layer
- 多种 coding agent 的统一约束层
- 本地和 CI 里的变更质量基线检查
- 公开可跑的语义 proof points：
  - pattern drift
  - interface drift
  - boundary violation
  - source-to-test relevance

推荐起手流程：

```bash
agent-guardrails init . --preset node-service --adapter openclaw --lang zh-CN
agent-guardrails plan --task "给订单服务补退款状态流转" --lang zh-CN
agent-guardrails check --base-ref origin/main --commands-run "npm test" --review --lang zh-CN
```

更多产品方向与后续规划，见：

- [英文 README](../../README.md)
- [产品策略（中文）](./PRODUCT_STRATEGY.md)
