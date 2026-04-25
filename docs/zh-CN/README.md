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
agent-guardrails pro activate <license-key>
agent-guardrails pro report
agent-guardrails pro workbench --open
agent-guardrails pro workbench --live
```

`pro workbench --live` 会启动一个本地浏览器 workbench，提供刷新答案、只 rerun、运行当前闭环、运行下一条 proof、短闭环、完成可见验证，以及保存证据备注的动作；页面里还会直接显示可复制的 Codex / Claude Code 委托包和 rerun 命令，也可以把整套 handoff 导出到本地文件。每次运行后会自动保存 proof note，并在同一页保留最近一次 proof loop 的可读摘要；如果当前闭环需要用户看着 AI 做可见验证，页面会直接显示目标、观察点、要留存的证据，以及“完成可见验证并 rerun”的路径，尽量减少回到终端的次数。

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
