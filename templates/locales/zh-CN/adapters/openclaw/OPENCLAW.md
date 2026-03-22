# OpenClaw 说明

在这个仓库里，把 `agent-guardrails` 作为共享工作流 guardrail 层。

## 先阅读

开始编辑前，请阅读：

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md`
4. 本次任务要修改的目标文件

## 工作规则

- 保持任务小且可 review。
- 优先沿用现有仓库结构，不要轻易新建抽象。
- 如果任务范围很窄，用 `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --intended-files "src/file.js,tests/file.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"` 明确声明。
- 如果任务触及行为变化，要补测试，并更新 `.agent-guardrails/evidence/current-task.md`，写清任务名、执行过的命令、关键结果和残余风险或 `none`。
- 完成前运行 `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`。
- `agent-guardrails check --json` 用于自动化或 CI，不是默认本地工作流。

## 默认任务模式

1. 阅读仓库状态和任务说明。
2. 运行 `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --intended-files "src/file.js,tests/file.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"`。
3. 只做符合任务契约的最小实现。
4. 更新 `.agent-guardrails/evidence/current-task.md`，写入真实执行过的命令和结果，然后运行 `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`。
5. 如果下一个动作变了，更新 `docs/PROJECT_STATE.md`。

## 说明

- 如果任务需要更大范围，先更新任务契约。
- 如果 `check` 失败，先修范围或测试，不要直接扩大改动。
