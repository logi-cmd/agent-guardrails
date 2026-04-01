# Agent Guardrails

**3 秒判断：这次 AI 改动可以安全 merge 吗？**

`agent-guardrails` 是 **AI 代码合并门** — 在 merge 前检查 AI 改动是否符合预期。

- 🎯 **范围验证** — AI 只改了允许的文件
- ✅ **测试验证** — 测试必须运行通过
- 🔍 **漂移检测** — 检测并行抽象、接口变更
- 🛡 **保护路径** — 关键文件不被触碰
- 🔧 **自动修复** — Tier-1 问题自动修复，零副作用

## Quick Start

```bash
# 1. 安装
npm install -g agent-guardrails

# 2. 在项目中设置
cd your-repo
agent-guardrails setup --agent claude-code

# 3. 强制 AI 遵守（推荐）
agent-guardrails enforce --all
```

支持 8 个 agent：`claude-code`、`cursor`、`opencode`、`codex`、`gemini`、`windsurf`、`openhands`、`openclaw`。

## 核心工作流

### 1. Setup — 初始化项目

```bash
agent-guardrails setup --agent <your-agent>
```

自动完成：
- ✅ 生成 `.agent-guardrails/config.json`
- ✅ 生成/追加 `AGENTS.md`
- ✅ 注入 git pre-commit hook
- ✅ 生成 AI 工具配置文件（MCP）

### 2. Enforce — 强制 AI 遵守（推荐）

`setup` 生成的 AGENTS.md 只是建议性规则，AI 可能忽略。**`enforce` 将 guardrail 指令直接注入到每个 agent 的系统级自动读取文件**（如 CLAUDE.md、GEMINI.md），优先级远高于 AGENTS.md。

```bash
# 为所有支持的 agent 强制启用
agent-guardrails enforce --all

# 只为特定 agent
agent-guardrails enforce --agent claude-code

# 查看支持哪些 agent
agent-guardrails enforce --help
```

| Agent | 注入文件 | 自动读取级别 |
|-------|---------|------------|
| Claude Code | `CLAUDE.md` | ⭐⭐⭐ 系统级 |
| Cursor | `.cursor/rules/agent-guardrails-enforce.mdc` | ⭐⭐⭐ 系统级 |
| OpenCode | `.opencode/rules/agent-guardrails-enforce.md` | ⭐⭐⭐ 系统级 |
| Codex | `.codex/instructions.md` | ⭐⭐⭐ 系统级 |
| Gemini CLI | `GEMINI.md` | ⭐⭐⭐ 系统级 |
| Windsurf | `.windsurf/rules/agent-guardrails-enforce.md` | ⭐⭐⭐ 系统级 |
| OpenHands | `.agents/skills/agent-guardrails-enforce.md` | ⭐⭐⭐ 系统级 |
| OpenClaw | `OPENCLAW.md` | ⭐⭐⭐ 系统级 |

**移除强制**（安全保留用户原有内容）：

```bash
agent-guardrails unenforce --all
agent-guardrails unenforce --agent claude-code
```

### 3. 日常工作流

设置完成后，AI 会自动在完成任务前运行检查：

```bash
agent-guardrails check --base-ref HEAD~1
```

检查结果直接显示在聊天中。Git pre-commit hook 提供兜底拦截。

**手动检查（可选）：**

```bash
agent-guardrails check --review
```

### 4. 任务计划（可选）

让 AI 更聚焦，先创建任务契约：

```bash
agent-guardrails plan --task "Add user authentication"
```

## Before vs After

| 之前 | 之后 |
|------|------|
| "AI 改了 47 个文件，不知道为什么" | "AI 改了 3 个文件，都在范围内" |
| "应该测试过了？" | "测试运行完成，12 通过，0 失败" |
| "这看起来像是个新模式" | "⚠️ 检测到并行抽象" |
| "希望不会出问题" | "✓ 可以安全 merge，剩余风险：低" |

## 三层保障机制

| 层级 | 机制 | 效果 |
|------|------|------|
| L1: enforce | 注入 agent 系统级指令文件 | ⭐⭐⭐ 最强 — AI 自动读取 |
| L2: AGENTS.md | 项目级规则文件 | ⭐⭐ 中等 — AI 可能忽略 |
| L3: pre-commit hook | Git 提交拦截 | ⭐⭐⭐ 兜底 — 强制拦截 |

**推荐组合**：`setup` + `enforce --all` = 双重保障

## 与竞品对比

| 功能 | CodeRabbit | Sonar | agent-guardrails |
|------|-----------|-------|------------------|
| 事前约束 | ❌ 事后评论 | ❌ 事后检查 | ✅ |
| 范围控制 | ❌ | ❌ | ✅ |
| 任务上下文 | ❌ | ❌ | ✅ |
| 测试相关性检查 | ❌ | ❌ | ✅ |

**核心差异**：在代码生成**之前**定义边界，而不是生成**之后**发现问题。

## CLI 命令速查

| 命令 | 用途 |
|------|------|
| `setup --agent <name>` | 初始化项目 |
| `enforce --all` | 强制 AI 遵守（推荐） |
| `unenforce --all` | 移除强制 |
| `plan --task "..."` | 创建任务契约 |
| `check --review` | merge 前检查 |
| `start` | 启动守护进程 |
| `stop` | 停止守护进程 |
| `status` | 查看守护进程状态 |

## 安装与更新

```bash
# 安装
npm install -g agent-guardrails

# 更新
npm update -g agent-guardrails
```

## 文档

- [CHANGELOG](./CHANGELOG.md)
- [Workflows](./docs/WORKFLOWS.md)
- [Proof](./docs/PROOF.md)
- [Roadmap](./docs/ROADMAP.md)
- [Contributing](./CONTRIBUTING.md)

## License

MIT
