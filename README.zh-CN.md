# Agent Guardrails

**[🇨🇳 中文版](./README.zh-CN.md)** | **[🇬🇧 English](./README.md)**

![Agent Guardrails — AI 代码合并门禁](./assets/hero-banner.svg)

`agent-guardrails` 是一个 **AI 生成代码的合并门禁**。它在合并前检查 AI 的改动是否符合预期。

- 🎯 **范围验证** — AI 只触碰允许的文件
- ✅ **测试验证** — 测试必须通过
- 🔍 **漂移检测** — 捕获并行抽象、接口变更
- 🛡 **受保护路径** — 关键文件保持不被触碰
- 🔧 **自动修复** — 一级问题自动修复，零副作用
- 🧬 **变异测试** — 可选的轻量内置变异测试，捕获无效测试（配置开关，默认关闭）

## 适用人群

`agent-guardrails` 首要面向**已在使用 AI 编码工具的海外独立开发者和小型团队**。

- 使用 Claude Code、Cursor、Codex、Gemini 或 OpenCode 交付真实产品代码的独立开发者
- 希望每个开发者使用不同 agent 时仍能保持统一门禁的小型产品团队
- 需要在多个客户仓库中更安全地进行 AI 辅助改动的顾问和外包团队

它**不是**为一次性玩具 prompt 或想完全替换编码 agent 的团队设计的。

## AI 编码已经很强了，为什么还要付费？

AI 编码工具已经能生成大量代码。付费机会不在于"更多代码生成"，而在于：

- 每次任务前**更少的手动配置**
- 审查时**更快的信任决策**
- 比纯 prompt 文本**更高信号强度的仓库感知检查**
- AI 编辑累积时的**更低维护漂移**
- 为没有大平台团队的人提供**更安全的部署/回滚工作流**

OSS 应该保持真正的合并门禁。付费层级应该帮助用户**更快、更一致、更低认知负担**地达成安全合并。

## 快速开始

```bash
# 1. 安装
npm install -g agent-guardrails

# 2. 在你的项目中设置
cd your-repo
agent-guardrails setup --agent claude-code

# 3. 强制执行规则（推荐）
agent-guardrails enforce --all
```

支持 5 种 agent：`claude-code`、`cursor`、`opencode`、`codex`、`gemini`。

## 工作原理

![核心工作流 — 设置 → 强制 → AI 编码 → 检查合并](./assets/workflow.svg)

## 核心工作流

### 1. 设置 — 初始化项目

```bash
agent-guardrails setup --agent <your-agent>
```

自动完成：
- ✅ 生成 `.agent-guardrails/config.json`
- ✅ 生成/追加 `AGENTS.md`
- ✅ 注入 git pre-commit hook
- ✅ 创建 AI 工具配置文件（MCP）

### 2. 强制 — 让 AI 遵守规则（推荐）

`setup` 生成的 `AGENTS.md` 是建议性的，AI agent 可能会忽略它。**`enforce` 将门禁指令直接注入每个 agent 的系统级自动读取文件**（如 `CLAUDE.md`、`GEMINI.md`），优先级远高于普通文件。

```bash
# 为所有支持的 agent 强制执行
agent-guardrails enforce --all

# 或指定某个 agent
agent-guardrails enforce --agent claude-code

# 查看支持的 agent
agent-guardrails enforce --help
```

| Agent | 注入文件 | 自动读取级别 |
|-------|---------|-------------|
| Claude Code | `CLAUDE.md` | ⭐⭐⭐ 系统级 |
| Cursor | `.cursor/rules/agent-guardrails-enforce.mdc` | ⭐⭐⭐ 系统级 |
| OpenCode | `.opencode/rules/agent-guardrails-enforce.md` | ⭐⭐⭐ 系统级 |
| Codex | `.codex/instructions.md` | ⭐⭐⭐ 系统级 |
| Gemini CLI | `GEMINI.md` | ⭐⭐⭐ 系统级 |

**移除强制**（安全保留你已有的内容）：

```bash
agent-guardrails unenforce --all
agent-guardrails unenforce --agent claude-code
```

### 3. 日常工作流

设置完成后，AI 完成任务前会自动运行检查：

```bash
agent-guardrails check --base-ref HEAD~1
```

结果直接出现在聊天中。git pre-commit hook 提供安全网。

![AI Agent 聊天 — 门禁自动触发](./assets/agent-chat.svg)

![检查输出 — 审查模式](./assets/check-output.svg)

**手动检查（可选）：**

```bash
agent-guardrails check --review
```

### 4. 规划任务（可选）

通过创建任务契约让 AI 保持聚焦：

```bash
agent-guardrails plan --task "添加用户认证"
```

## 工程Harness优先级

产品正在向**运行时支持的门禁**方向发展，因此最重要的维护工作不是盲目添加更多启发式检查——而是收紧控制它们的 harness。以下优先级来自对 8 个维度（执行循环、agent 拓扑、上下文管理、故障恢复、hook 完整性、评估设计、循环检测、工具边界）的 harness-engineering 审计。

**已交付：**

- Bash 文件写入拦截现已覆盖 Claude Code Bash 工具路径
- MCP 循环保护和 daemon 状态去重防止重复检查
- session 过期清理已接入长时间运行的运行时状态
- 结构化运行时错误和熔断行为替代了静默失败路径
- 连续性/性能发现现在出现在审查输出中
- 轻量审查输出抑制减少了冗余连续性噪音
- `enforce` / `unenforce` 往返覆盖运行在默认测试路径中
- 面向发布的文档和包版本一致性检查
- CI 现在使用缓存感知的 npm 设置加轻量静态验证
- Gemini CLI 设置现在安装原生 BeforeTool / AfterTool hooks
- `agent-guardrails doctor` 提供最小 OSS 安装诊断路径
- **可选轻量内置变异测试切片**已集成到 OSS 检查管道中（配置开关、默认关闭、仅警告、基线优先）
- working-tree diff 解析修复，正确提取路径
- 变异检测器、i18n 消息和 `listChangedFiles()` 的直接模块测试覆盖

**仍开放：**

- Codex 保持在 MCP/instructions 回退路径，直到原生 hook 支持稳定

**原则**：优先轻量、可复现的检查，而非不透明的"智能"行为。每个 harness 组件必须针对观察到的故障模式证明自己的价值。

## 前后对比

| 之前 | 之后 |
|------|------|
| "AI 改了 47 个文件，不知道为啥" | "AI 改了 3 个文件，全在范围内" |
| "测试大概过了吧？" | "测试运行：12 通过，0 失败" |
| "看着像新模式" | "⚠️ 检测到并行抽象" |
| "希望别出问题" | "✓ 可以合并，残余风险：低" |

## 为什么比 DIY 插件栈更好

很多用户已经有了 Claude Code、Cursor、Codex 或 Gemini 加上自定义 prompt、hook 和 MCP 工具。

使用 `agent-guardrails` 的原因不是那些工具不能生成代码，而是 DIY 栈仍然留下大量手动工作：

- 实现前定义仓库安全边界
- 检查 diff 是否留在边界内
- 证明验证确实运行过
- 为人类审查者总结残余风险
- 防止重复 AI 编辑慢慢碎片化仓库

当用户想保留当前编码 agent 并在上面叠加可复现的信任层时，`agent-guardrails` 最强。

## 了解更多

如果想一次性了解产品故事、定价策略和竞争对比：

- [落地页文案](./docs/LANDING_PAGE_COPY.md)
- [定价文案](./docs/PRICING_COPY.md)
- [FAQ：我已经有 Claude / Cursor / Codex 了，为什么还要买这个？](./docs/FAQ_WHY_BUY.md)
- [DIY 插件栈 vs agent-guardrails](./docs/DIY_VS_AGENT_GUARDRAILS.md)
- [Proof：它能捕获到普通 AI 编码工作流遗漏的东西](./docs/PROOF.md)

## 三层强制

| 层级 | 机制 | 效果 |
|------|------|------|
| L1: enforce | 注入 agent 系统级指令文件 | ⭐⭐⭐ 最强 — AI 自动读取 |
| L2: AGENTS.md | 项目级规则文件 | ⭐⭐ 中等 — AI 可能忽略 |
| L3: pre-commit hook | Git 提交拦截 | ⭐⭐⭐ 安全网 — 强制执行 |

**推荐**：`setup` + `enforce --all` = 双重保护。

## 竞品对比

| 功能 | CodeRabbit | Sonar | agent-guardrails |
|------|-----------|-------|------------------|
| 生成前约束 | ❌ 事后评论 | ❌ 事后检查 | ✅ |
| 范围控制 | ❌ | ❌ | ✅ |
| 任务上下文 | ❌ | ❌ | ✅ |
| 测试相关性检查 | ❌ | ❌ | ✅ |

**关键区别**：在代码生成*之前*定义边界，而不是发现问题*之后*。

## CLI 参考

| 命令 | 用途 |
|------|------|
| `setup --agent <name>` | 初始化项目 |
| `enforce --all` | 强制规则（推荐） |
| `unenforce --all` | 移除强制 |
| `plan --task "..."` | 创建任务契约 |
| `check --review` | 运行审查模式的门禁检查 |
| `doctor` | 诊断当前安装 |
| `start` | 启动 daemon |
| `stop` | 停止 daemon |
| `status` | 显示 daemon 状态 |

## 维护者验证循环

对于有意义的改动，仓库应该可以通过一个小型可复现循环来验证：

```bash
npm test
agent-guardrails check --review
```

当修改 setup、enforce、hooks 或面向发布的文档时，还应验证相关生成文件和文档与已发布版本保持一致。

## 安装与更新

```bash
# 安装
npm install -g agent-guardrails

# 更新
npm update -g agent-guardrails
```

## 文档

- [CHANGELOG](./CHANGELOG.md)
- [工作流](./docs/WORKFLOWS.md)
- [Proof](./docs/PROOF.md)
- [路线图](./docs/ROADMAP.md)
- [贡献指南](./CONTRIBUTING.md)

## 许可证

MIT
