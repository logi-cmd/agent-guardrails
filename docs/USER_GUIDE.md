# Agent Guardrails 完整使用指南

> 从安装到日常维护的完整工作流

---

## 快速概览

```
安装 → 初始化项目 → 创建任务 → AI实现 → 检查验证 → 提交代码 → 持续维护
```

---

## 1. 安装

### 全局安装

```bash
npm install -g agent-guardrails
```

### 验证安装

```bash
agent-guardrails --version
# 输出: agent-guardrails v0.3.1
```

### 使用 npx（无需安装）

```bash
npx agent-guardrails --help
```

---

## 2. 开启新项目

### 2.1 初始化项目

```bash
cd your-project

# 方式1: 交互式设置（推荐）
agent-guardrails setup --agent claude-code

# 方式2: 手动初始化
agent-guardrails init . --preset node-service
```

### 2.2 选择 Agent

| Agent | 命令 |
|-------|------|
| Claude Code | `--agent claude-code` |
| Cursor | `--agent cursor` |
| Codex | `--agent codex` |
| OpenHands | `--agent openhands` |
| OpenClaw | `--agent openclaw` |

### 2.3 选择 Preset

| Preset | 适用场景 |
|--------|---------|
| `node-service` | Node.js 后端服务 |
| `nextjs` | Next.js 前端应用 |
| `python-fastapi` | Python FastAPI 服务 |
| `monorepo` | 多包仓库 |

### 2.4 配置 Agent

setup 命令会输出配置片段，粘贴到你的 Agent 配置文件：

```json
// .mcp.json 或 .cursor/mcp.json
{
  "mcpServers": {
    "agent-guardrails": {
      "command": "npx",
      "args": ["agent-guardrails", "mcp"]
    }
  }
}
```

---

## 3. 修改项目（创建任务）

### 3.1 Rough-Intent 模式（推荐）

一句话描述任务，自动推断范围：

```bash
# 中文
agent-guardrails plan "加个登录功能" --lang zh-CN --yes

# 英文
agent-guardrails plan "Add login feature" --yes
```

**自动推断**：
- 任务类型（auth/feature/bugfix/...）
- 允许修改的路径
- 需要运行的测试命令
- 风险等级
- 保护规则

### 3.2 精确模式

需要精确控制时使用：

```bash
agent-guardrails plan \
  --task "添加用户登录功能" \
  --allow-paths "src/auth/,src/services/user.ts" \
  --required-commands "npm test" \
  --risk-level medium \
  --lang zh-CN
```

### 3.3 支持的任务类型

| 类型 | 关键词 | 示例 |
|------|--------|------|
| `auth` | 登录、注册、认证 | "加个登录功能" |
| `feature` | 添加、新增、功能 | "添加支付功能" |
| `bugfix` | bug、修复、fix | "修复订单计算bug" |
| `refactor` | 重构、整理 | "重构用户模块" |
| `performance` | 性能、优化 | "优化查询性能" |
| `api` | api、接口 | "添加用户API" |
| `ui` | ui、界面、组件 | "添加登录表单" |
| `test` | 测试、test | "添加单元测试" |
| `config` | 配置、config | "添加环境变量" |
| `docs` | 文档、docs | "更新README" |

---

## 4. AI 实现

让 AI Agent 根据任务契约实现功能：

### 4.1 通过 MCP（推荐）

Agent 会自动调用 guardrails 工具：

```
你: 帮我实现登录功能，按照任务契约来

AI: [调用 read_repo_guardrails]
   [调用 start_agent_native_loop]
   [实现代码]
   [调用 finish_agent_native_loop]
```

### 4.2 手动引导

```
你: 请实现登录功能。
    允许修改的路径: src/auth/, src/services/
    完成后运行: npm test
    不要修改: .env, config/
```

---

## 5. 检查验证

### 5.1 基本检查

```bash
agent-guardrails check --lang zh-CN
```

### 5.2 完整检查

```bash
agent-guardrails check \
  --base-ref origin/main \
  --commands-run "npm test" \
  --review \
  --lang zh-CN
```

### 5.3 检查结果解读

| Verdict | 含义 | 下一步 |
|---------|------|--------|
| `safe` | ✅ 安全合并 | 可以提交 |
| `review_needed` | ⚠️ 需要审查 | 检查警告，决定是否继续 |
| `blocked` | ❌ 被阻止 | 必须修复问题 |

### 5.4 JSON 输出（CI/CD）

```bash
agent-guardrails check --json
```

---

## 6. 提交代码

### 6.1 检查通过后

```bash
# 查看变更
git status
git diff

# 提交
git add .
git commit -m "feat: 添加用户登录功能"
```

### 6.2 CI 集成

在 GitHub Actions 中：

```yaml
# .github/workflows/agent-guardrails.yml
name: Agent Guardrails Check

on: [pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - run: npx agent-guardrails check
        env:
          AGENT_GUARDRAILS_BASE_REF: origin/main
```

---

## 7. 后续维护

### 7.1 日常开发流程

```
1. plan  → 创建任务契约
2. 实现  → AI 按契约开发
3. check → 验证符合契约
4. 提交  → 安全合并
```

### 7.2 证据文件

记录实现过程：

```markdown
# .agent-guardrails/evidence/current-task.md

## 任务
添加用户登录功能

## 运行的命令
- npm test: ✅ 12 passed, 0 failed
- npm run lint: ✅ No issues

## 值得注意的结果
- 添加了 src/auth/login.ts
- 添加了 tests/auth/login.test.ts
- 复用了现有的 Logger 工具

## 残余风险
- 登录失败次数限制未实现（下个任务）
```

### 7.3 连续性检查

guardrails 会检查：
- 是否复用现有代码模式
- 是否创建重复抽象
- 是否影响维护性

---

## 完整示例

### 场景：添加支付功能

```bash
# 1. 创建任务契约
agent-guardrails plan "添加支付宝支付功能" --lang zh-CN --yes

# 输出:
# ╔══════════════════════════════════════════════════╗
# ║  📋 为你生成任务契约                              ║
# ╚══════════════════════════════════════════════════╝
#
# 检测到: feature 类型任务
# 置信度: 95%
#
# 推断的变更范围:
#   ✓ src/services/payment/
#   ✓ src/routes/payment.ts
#
# 推断的测试命令:
#   ✓ npm test
#
# 风险等级: high (涉及支付)
#
# 保护规则:
#   ✓ 不要修改数据库迁移文件
#   ✓ 密钥不能硬编码

# 2. 让 AI 实现
# (在 Agent 中描述任务)

# 3. 检查验证
agent-guardrails check --commands-run "npm test" --lang zh-CN

# 4. 提交
git add . && git commit -m "feat: 添加支付宝支付功能"
```

---

## 常见问题

### Q: 任务描述很模糊怎么办？

A: 使用 Rough-Intent 模式，guardrails 会自动推断：

```bash
agent-guardrails plan "优化一下" --lang zh-CN
# 会提示你选择：性能？代码结构？用户体验？
```

### Q: 检查失败怎么办？

A: 查看 check 输出的建议：

```bash
agent-guardrails check --review --lang zh-CN

# 会告诉你：
# - 哪些文件越界了
# - 缺少什么测试
# - 有什么风险
```

### Q: 如何跳过某些检查？

A: 在任务契约中声明：

```bash
agent-guardrails plan "紧急修复" \
  --risk-level high \
  --skip-evidence \
  --lang zh-CN
```

### Q: 支持哪些语言？

A: 目前支持：
- `en` - English
- `zh-CN` - 简体中文

---

## 下一步

- 📖 阅读 [README.md](../README.md)
- 🔧 查看 [WORKFLOWS.md](./WORKFLOWS.md)
- 🐛 遇到问题？[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
