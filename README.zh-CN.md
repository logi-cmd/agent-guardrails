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

`agent-guardrails` 首要面向**已在使用 AI 编码工具的独立开发者和小型团队**。

- 使用 Claude Code、Cursor、Codex、Gemini 或 OpenCode 交付真实产品代码的独立开发者
- 希望每个开发者使用不同 agent 时仍能保持统一门禁的小型产品团队
- 需要在多个客户仓库中更安全地进行 AI 辅助改动的顾问和外包团队

它**不是**为一次性玩具 prompt 或想完全替换编码 agent 的团队设计的。

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

## 安装与更新

```bash
# 安装
npm install -g agent-guardrails

# 更新
npm update -g agent-guardrails
```

## 文档

- [CHANGELOG](./CHANGELOG.md)
- [Proof](./docs/PROOF.md)

## 许可证

MIT
