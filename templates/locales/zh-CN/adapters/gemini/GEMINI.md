# Gemini CLI 项目记忆

把 `agent-guardrails` 作为这个项目的 repo-local guardrail 层。

## 强制：先阅读

编辑前，先阅读：

1. `AGENTS.md`
2. `docs/PROJECT_STATE.md`
3. `README.md` if it exists
4. 本次任务要修改的目标文件

## 强制：守卫检查

**告诉用户"任务完成"之前，必须运行：**

```bash
npx agent-guardrails check --base-ref HEAD~1
```

**强制规则：**
- 如果发现问题 → **必须停下修复。不要告诉用户"完成"。**
- 如果没有问题 → 在总结中包含检查结果。
- 如果命令不存在 → 告诉用户先运行 `npx agent-guardrails setup`。

**不运行此命令 = 任务未完成。**

## 强制：任务契约

如果 `.agent-guardrails/task-contract.json` 存在：

- **必须** 停留在声明的范围内（允许的路径、预期的文件）。
- **必须** 运行契约中列出的所需命令。
- **必须** 更新 `.agent-guardrails/evidence/current-task.md`，写明执行过的命令、关键结果和残余风险。

## 强制：工作规则

- **必须** 保持任务小且可 review。
- **必须** 优先沿用现有仓库结构，不要轻易新建抽象。
- **必须** 行为变化时包含测试。
- **必须** 在放大改动范围之前，先修范围或测试覆盖问题。

## MCP（可选）

如果 Gemini CLI 已连接 `agent-guardrails mcp`，可以使用 `check_after_edit` 获得即时反馈。但 CLI 检查始终是必需的。


Windows PowerShell note: if npx or npm is blocked by the .ps1 shim policy, use npx.cmd and npm.cmd.
