# Agent-Guardrails 竞品分析报告

> 生成时间: 2026-04-01 | 来源: WebSearch + 项目文档

## 竞品格局

### 直接竞品（重点关注）

| 项目 | 定位 | 价格 | 与 agent-guardrails 的差异 |
|------|------|------|--------------------------|
| **Mault.ai** ⚠️ | AI 治理层，VS Code 扩展 | Pro $7.99/月 | **重合度最高。** Mault 做 runtime hooks（拦截 AI 写文件），agent-guardrails 做事前约束（定义任务边界）。Mault 绑定 VS Code + Claude Code，agent-guardrails 支持 8 个 agent 且是 CLI。 |

**Mault 详细分析**：
- 产品形态：VS Code 扩展，类似"实时 lint for AI"
- 核心功能：6 个角色分离的 multi-agent workflow、runtime hooks、CI gate
- 优势：IDE 集成深，界面好
- 劣势：只支持 VS Code，闭源 SaaS，Pro $7.99/月
- 我们的优势：CLI-first（不绑定 IDE）+ 开源 + 8 agent 支持 + task contract

### 间接竞品

| 项目 | 定位 | 价格 | 关系 |
|------|------|------|------|
| **CodeRabbit** | AI PR Review | $15/seat/月 | 事后 review vs 事前约束 |
| **SonarQube** | 代码质量扫描 | $32/seat/月 | 静态分析，不理解 AI 任务 |
| **Snyk** | 安全扫描 | $400+/年 | 安全漏洞，不控制 AI 范围 |
| **Harness AI** | AI DevOps 平台 | 企业级 | Goldman Sachs 投 $200M，太重 |
| **Guardrails AI** | LLM 输出验证 | 免费/商业 | 验证 JSON 格式，不是代码仓库 |
| **Coder AI Bridge** | AI 治理 | 企业级 | 2026-02 发布，企业级 |

### 新入局者

| 项目 | 定位 | 状态 |
|------|------|------|
| **Akto AgentGuard** | 实时 AI agent 防护 | 2025-12 发布 |
| **LlamaFirewall** (Meta) | AI Agent 开源防护 | 2025-04 发布，生态未建立 |

## 市场动态

- **2026 Q1**：GuardionAI 列出 71 个 AI guardrails 方案
- **2026-03**：Mault.ai 上线，定价 $7.99/月 Pro
- **2026-02**：Coder 发布 AI Bridge + Agent Boundaries
- **市场趋势**：AI 编码治理在爆发，但还没有 CLI-first 的开源方案

## 差异化优势总结

1. **CLI-first** — 不绑定 IDE，任何终端都能用（Mault 只支持 VS Code）
2. **8 agent 支持** — 不只是 Claude Code（Mault 只支持 Claude Code runtime hooks）
3. **Task Contract** — 任务契约概念独特，竞品没有
4. **开源** — Mault 是闭源 SaaS
5. **零依赖** — 独特卖点
6. **事前约束** — 在代码生成前定义边界，不是事后 review
