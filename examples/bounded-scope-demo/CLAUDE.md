# Claude Code 项目记忆

把 `agent-guardrails` 作为这个项目的 repo-local guardrail 层。

## 先阅读

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. 本次任务要修改的目标文件

## 工作流

1. 先读仓库状态，再运行 `agent-guardrails plan --task "<task>"`。如果任务范围特别窄或风险更高，再补更严格的参数。
2. 除非先更新 scope，否则实现必须限制在任务契约之内。
3. 如果行为发生变化，要补测试，并更新 `.agent-guardrails/evidence/current-task.md`，写清任务名、执行过的命令、关键结果和残余风险或 `none`。
4. 完成前运行 `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`。

## 规则

- 优先沿用现有仓库结构，不要轻易新建抽象。
- 保持改动小且可 review。
- 如果 `check` 失败，先修 scope 或测试覆盖，不要直接放大改动范围。
- `agent-guardrails check --json` 用于自动化或 CI，不是默认的本地工作流。
