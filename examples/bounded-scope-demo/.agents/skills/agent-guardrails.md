把 `agent-guardrails` 作为 OpenHands 在此仓库中的 guardrail 层。

- 开始编辑前先阅读 `AGENTS.md`、`docs/PROJECT_STATE.md` 和 `README.md`。
- 先运行 `agent-guardrails plan --task "<task>"` 写入任务契约。只有在任务特别窄或风险更高时，再补更严格的参数。
- 除非显式更新任务范围，否则实现要严格限制在契约内。
- 如果行为变化了，要补测试，并更新 `.agent-guardrails/evidence/current-task.md`，写清任务名、执行过的命令、关键结果和残余风险或 `none`。
- 完成前运行 `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`。
- `agent-guardrails check --json` 用于自动化或 CI，不是默认本地路径。
