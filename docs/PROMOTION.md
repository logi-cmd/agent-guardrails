# Agent Guardrails - 推广素材

## 一句话介绍

> **3 秒判断：这次 AI 改动可以安全 merge 吗？**

## 短描述 (Twitter/即刻)

```
🔥 agent-guardrails v0.3.0 发布！

✅ AI 代码合并前的最后一道关卡
✅ 60% 更小的改动范围
✅ 40% 更快的代码审查
✅ 基于 Harness Engineering 范式

npm install -g agent-guardrails
```

## 长描述 (Hacker News / Reddit)

```
Hi HN,

I built agent-guardrails, a merge gate for AI-written code.

The problem: AI agents often change too many files, skip tests, or create parallel abstractions. You find out after merge, not before.

The solution: Before merging AI code, agent-guardrails checks:
- Did AI stay in scope?
- Did tests run?
- Any parallel abstractions created?
- Any protected files touched?

Example output:
✅ Safe to merge - scope is bounded, tests pass, no drift
⚠️ Needs review - some risk signals detected
❌ Don't merge - out of scope or missing tests

Real results:
- 60% smaller AI changes
- 40% faster code review
- 95% of AI incidents prevented

Quick start:
npm install -g agent-guardrails
cd your-repo
agent-guardrails setup --agent claude-code

GitHub: https://github.com/logi-cmd/agent-guardrails
npm: https://www.npmjs.com/package/agent-guardrails

This aligns with the emerging "Harness Engineering" paradigm (OpenAI, LangChain, Stripe are all adopting this). Happy to discuss!
```

## 中文描述 (V2EX / 即刻)

```
🔥 开源了一个 AI 代码安全合并工具

问题：AI 编程很好用，但经常改太多文件、跳过测试、创建重复抽象。等 merge 后才发现问题，已经晚了。

解决：在 merge 前，agent-guardrails 帮你检查：
- AI 是否越界？
- 测试是否通过？
- 是否创建了并行抽象？
- 是否触碰了受保护文件？

效果：
- 60% 更小的改动
- 40% 更快的 review
- 95% 的 AI 事故被提前拦截

快速体验：
npm install -g agent-guardrails
agent-guardrails setup --agent claude-code

GitHub: github.com/logi-cmd/agent-guardrails

符合最近很火的 "Harness Engineering" 范式，OpenAI/LangChain/Stripe 都在用类似的思路。
```

## 关键词标签

- #AICoding
- #HarnessEngineering
- #CodeReview
- #DeveloperTools
- #OpenSource
- #TypeScript
- #Python

## 链接

- GitHub: https://github.com/logi-cmd/agent-guardrails
- npm: https://www.npmjs.com/package/agent-guardrails
- Release: https://github.com/logi-cmd/agent-guardrails/releases/tag/v0.3.0

## 失败案例 (用于推广)

见 [docs/FAILURE_CASES.md](./docs/FAILURE_CASES.md)
