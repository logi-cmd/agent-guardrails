开始写代码前：

1. 阅读 `AGENTS.md`、`docs/PROJECT_STATE.md`、`README.md` 和目标模块文件。
2. 总结你准备遵循的现有实现模式。
3. 列出你预计会修改的准确文件。
4. 说明满足请求的最小可行实现，以及需要写进任务契约的预期文件、风险级别、改动类型等限制。

实现过程中：

- 优先沿用现有架构和命名。
- 除非当前代码无法合理承载需求，否则不要新建抽象。
- 保持改动有边界、易 review。
- 行为变化要补或改测试。
- 在 `.agent-guardrails/evidence/current-task.md` 中维护一份简短 evidence note。
- 接口、配置、迁移类改动必须显式声明，不要混进普通实现任务。

结束前：

- 在 `.agent-guardrails/evidence/current-task.md` 中记录真实执行过的命令、关键结果，以及残余风险或 `none`。
- 运行配置好的检查，并把真实执行的命令通过 `agent-guardrails check --commands-run "..." --review` 传进去。
- 明确指出残余风险或缺失上下文。
