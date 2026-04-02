# Agent Guardrails 中文概览

`agent-guardrails` 是 AI 代码合并门 — 在 merge 前检查 AI 改动是否符合预期。

- 🎯 **范围验证** — AI 只改了允许的文件
- ✅ **测试验证** — 测试必须运行通过
- 🔍 **漂移检测** — 检测并行抽象、接口变更
- 🛡 **保护路径** — 关键文件不被触碰
- 🔧 **自动修复** — Tier-1 问题自动修复

## 快速开始

```bash
npm install -g agent-guardrails
cd your-repo
agent-guardrails setup --agent claude-code
agent-guardrails enforce --all
```

支持 5 个 agent：`claude-code`、`cursor`、`opencode`、`codex`、`gemini`。

更多信息：

- [英文 README](../../README.md)
- [Roadmap](../ROADMAP.md)
