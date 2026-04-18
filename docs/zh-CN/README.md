# Agent Guardrails 中文概览

`agent-guardrails` 是面向 AI 编码工作的合并门禁。它不会替代 Claude Code、Cursor、Codex、OpenCode 或 Gemini，而是在这些 agent 完成改动后检查范围、验证证据和残余风险，帮助你判断这次改动能不能进入代码库。

## 快速开始

```bash
npm install -g agent-guardrails
cd your-repo
agent-guardrails setup --agent claude-code
agent-guardrails enforce --all
```

支持的 agent：

- `claude-code`
- `cursor`
- `opencode`
- `codex`
- `gemini`

## 常用命令

```bash
agent-guardrails plan --task "Add user authentication"
agent-guardrails check --review
agent-guardrails check --json
agent-guardrails pro status
agent-guardrails pro report
```

## 什么时候有用

- AI 一次改了太多文件，你想知道是否越界。
- AI 说测试跑过了，你想让证据进入检查结果。
- 团队同时使用多个 agent，但希望共享同一套仓库门禁。
- 你希望在 merge 前看到清楚的 reviewer summary，而不是靠聊天记录猜风险。

## 更多文档

- [English README](../../README.md)
- [Workflows](../WORKFLOWS.md)
- [Troubleshooting](../TROUBLESHOOTING.md)
- [Proof](../PROOF.md)
