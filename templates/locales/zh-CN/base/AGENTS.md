# Agent 规则

## 先阅读

开始写代码前，请先阅读：

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. 你计划修改的具体文件

## 工作方式

- 在做较大改动前，先运行 `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"`，并把实现限制在契约范围内。
- 如果任务特别窄或风险更高，再补 `--intended-files`、`--allowed-change-types` 或更窄的 `--allow-paths`，让契约和最小实现切片一致。
- 优先复用现有模式，不要轻易新建抽象。
- 保持改动小、易 review。
- 任务不简单时，先列出要改的文件。
- 上下文不足时要指出，不要自行脑补。
- 行为变化需要补充或更新测试。
- 如果任务触及 review 关键路径，要提高任务风险级别，并在 evidence 中明确 reviewer 关注点。
- 完成前，更新 `.agent-guardrails/evidence/current-task.md`，写清任务名、执行过的命令、关键结果和残余风险或 `none`。
- 完成前，运行 `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`，并把真实执行过的命令传进去。

## 完成定义

- 实现符合当前项目约定。
- 行为变化在合适情况下具备测试覆盖。
- 任务要求的命令确实执行过，并且已经上报给 `check`。
- 当前任务的 evidence note 存在，并真实反映了任务结果。
- 风险、假设和后续工作已记录。
