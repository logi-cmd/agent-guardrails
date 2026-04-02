# Competitor Landscape — agent-guardrails (2026-04-01)

## 竞品矩阵

| 产品 | 定位 | 价格 | 区别 | 你的优势 |
|------|------|------|------|----------|
| Guardrails AI | AI 输出验证 SaaS | $49-99/月 | 验证 AI 生成内容，不验证代码仓库上下文 | 你的是 **代码变更** 级别 |
| CodeRabbit | AI PR Review | $15/seat/月 | 事后 review，不约束生成过程 | 你的是 **事前约束** |
| Sonar | 代码质量扫描 | $32/seat/月 | 静态分析，不理解 AI 任务上下文 | 你理解 **AI 任务意图** |
| Snyk | 安全扫描 | 按量付费 | 安全漏洞检测，不控制 AI 改动范围 | 你控制 **改动边界** |
| Harness AI | AI DevOps 平台 | 企业级 | Goldman Sachs 投了 $200M，全栈 AI DevOps | 你是 **轻量级 CLI** |
| Mault.ai | AI 治理层 | 企业级 | 新产品，2026-03 发布，运行时治理 | 你是 **开源 + 开发者友好** |

## 差异化定位

你的核心优势是：

1. **事前约束** — 不是事后检查，而是定义 AI 在生成前不能碰什么
2. **开发者友好** — CLI + 零依赖，不侵入工作流
3. **跨平台** — Windows/Mac/Linux 一行命令
4. **AI 原生** — 理解 AI 任务上下文，不只是静态规则
5. **三层防护** — enforce + AGENTS.md + git hook

## 市场空白

- 没有竞品做 "AI 代码生成前的边界约束"
- 没有竞品同时支持 8 个 coding agent
- 没有竞品做 "任务契约" (task contract)
- 大多数竞品是企业级 SaaS，个人开发者买不起

## 定价参考

| 产品 | 价格 |
|------|------|
| CodeRabbit | $15/seat/月 |
| SonarQube | $32/seat/月 |
| Snyk | 按量，最低 $400/年 |
| Agent-guardrails (OSS) | **免费** |
| Agent-guardrails (Pro) | $5-8/月 (计划中) |
