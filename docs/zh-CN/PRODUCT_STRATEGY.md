# 产品策略（中文）

`agent-guardrails` 的目标不是把 AI 变成完美程序员，而是把 AI 写出来的代码约束在更接近生产要求的轨道里。

当前产品主张：

> 它是 AI coding workflows 的 production-safety layer。

核心方向：

1. 保持 `init / plan / check` 命令面稳定
2. 用 task contract + repo policy 约束 AI 改动
3. 把 `check` 逐步升级成 detector pipeline
4. 在 generic baseline 之上，叠加可选 semantic plugins
5. 通过 benchmark、demo 和 pilot 证明它真的减少 AI 屎山代码

当前优先级最高的语义能力：

1. public interface diff
2. module boundary checks
3. protected-area semantic escalation
4. source-to-test impact
5. pattern drift / duplicate abstraction

语言策略：

- 所有仓库都可用 universal baseline
- TS/JS 先做强语义支持
- Python 第二顺位
- 其他语言先通过 baseline 和未来 plugin 扩展

商业化方向：

- OSS Core：repo-local guardrails
- Pro Local：语义规则包、本地 IDE review、BYO key
- Pro Cloud：托管 PR review、历史趋势、共享策略

更完整的英文策略文档见：

- [English PRODUCT_STRATEGY.md](../../docs/PRODUCT_STRATEGY.md)
