# Agent-Guardrails 用户痛点研究报告

> 生成时间: 2026-04-01 | 来源: WebSearch + docs/PRODUCT_STRATEGY.md

## 核心痛点（按严重程度排序）

| # | 痛点 | 频率 | 严重度 | 现有解决方案 | 我们的机会 |
|---|------|------|--------|-------------|-----------|
| 1 | AI改了太多文件，不知道改了什么 | 极高 | 🔴高 | git diff（事后） | **事前约束范围** |
| 2 | AI执行了危险命令（rm -rf等） | 高 | 🔴致命 | 无 | **唯一解决方案** |
| 3 | AI触碰了不该改的关键文件 | 高 | 🔴高 | .gitignore（不相关） | **protected-paths** |
| 4 | 不确定AI是否运行了测试 | 高 | 🟡中 | 手动检查 | **自动验证** |
| 5 | AI创建了重复/无意义的抽象层 | 中 | 🟡中 | Code Review | **语义漂移检测** |
| 6 | Merge后才发现问题 | 中 | 🔴高 | CI/CD（事后） | **merge前拦截** |
| 7 | 多人用不同AI工具，无统一管控 | 低 | 🟡中 | 无 | **8个Agent统一适配** |

## 用户原声（搜索收集）

### Reddit/HN 讨论
- "Claude Code just deleted my entire node_modules... and then some" — r/ClaudeAI
- "AI agents are scary when they have filesystem access" — HackerNews
- "I don't trust Cursor to not break production" — r/cursor
- "How do you review AI-generated code? It changes too fast" — r/programming

### 真实事故案例（来自 docs/PROOF.md）
1. AI删除了生产数据库配置
2. AI创建了10层嵌套的无用抽象
3. AI修改了不应触碰的支付逻辑
4. AI跳过了测试直接提交

## 痛点 → 营销切入点映射

| 痛点 | 营销角度 | 标题灵感 |
|------|----------|----------|
| AI改太多文件 | "3秒知道：这次AI改动安全吗？" | "你的AI Agent正在悄悄改什么？" |
| AI执行危险命令 | "95%的AI事故在merge时被拦截" | "rm -rf不会发生在有guardrails的仓库" |
| 不确定AI测试 | "自动验证测试通过率" | "AI写完代码，谁来验证AI？" |
| 无统一管控 | "8个AI工具，1个guardrails" | "团队用Cursor+Claude？你需要统一安全层" |
| Merge后才发现 | "最后一道关卡" | "别等CI红灯，merge前就知道" |

## 目标用户画像

### 主要用户：独立开发者 / 小团队
- 使用Claude Code或Cursor的AI编码
- 有真实项目仓库（非玩具项目）
- 对代码质量有要求
- 不想花时间review AI的每一行改动
- 愿意为省时间付费（$5-8/月可接受）

### 次要用户：工程团队Lead
- 团队多人使用不同AI工具
- 需要统一的AI编码安全策略
- 关心合规和审计
- 愿意为团队安全付费（$24-29/月/人）

## 用户获取渠道偏好

| 渠道 | 用户活跃度 | 信任度 | 获客成本 |
|------|-----------|--------|----------|
| GitHub awesome列表 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $0 |
| Reddit r/ClaudeAI | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | $0 |
| HackerNews | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $0 |
| Claude Code Plugin市场 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | $0 |
| Twitter/X #ClaudeCode | ⭐⭐⭐ | ⭐⭐⭐ | $0 |
| Dev.to/Medium技术博客 | ⭐⭐⭐ | ⭐⭐⭐⭐ | 时间成本 |
