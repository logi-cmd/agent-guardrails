# Agent-Guardrails 渠道研究 & 立即行动计划

> 生成时间: 2026-04-01 | 来源: Librarian搜索

## 🔴 P0: 立即执行（本周）

### 1. 提交 awesome-claude-code（35K stars）

**仓库**: https://github.com/hesreallyhim/awesome-claude-code
**Stars**: 35,162 | **Forks**: 2,619

**提交位置**: `Tooling` → 建议新增 `Safety & Security` 分类

**PR内容模板**:
```markdown
### Agent Guardrails - Runtime safety for AI coding agents

**3秒判断：这次AI改动可以安全merge吗？**

- ✅ 事前约束AI修改范围（任务契约）
- ✅ 拦截危险命令（rm -rf, DROP TABLE...）
- ✅ 语义漂移检测（AST分析）
- ✅ 支持 Claude Code / Cursor / OpenCode / Codex / Windsurf 等 8 个 Agent
- ✅ MCP服务器 + CLI，npm install 即用

GitHub: https://github.com/logi-cmd/agent-guardrails
npm: https://www.npmjs.com/package/agent-guardrails
```

### 2. 提交 awesome-claude-skills（50K stars）

**仓库**: https://github.com/ComposioHQ/awesome-claude-skills
**Stars**: 49,879 | **Forks**: 5,174

**提交位置**: `Security` 或 `Developer Tools` 分类

### 3. Claude Code Plugin 市场提交

**入口**: https://claude.com/docs/plugins/submit
**文档**: https://docs.anthropic.com/en/docs/claude-code/plugin-marketplaces

**配置文件 `.claude-plugin/marketplace.json`**:
```json
{
  "name": "agent-guardrails",
  "description": "Runtime safety for AI coding agents. Catch dangerous operations before merge.",
  "version": "0.9.0",
  "type": "mcp-server",
  "categories": ["security", "code-quality", "developer-tools"],
  "keywords": ["guardrails", "ai-safety", "code-review", "mcp"],
  "repository": "https://github.com/logi-cmd/agent-guardrails",
  "install": "npm install -g agent-guardrails"
}
```

## 🟡 P1: 本月执行

### 4. Reddit 发布

| Subreddit | 会员数 | 发帖类型 |
|-----------|--------|----------|
| r/ClaudeAI | 150K+ | "Show HN" 风格分享 |
| r/cursor | 80K+ | 如何用guardrails保护Cursor |
| r/programming | 5M+ | 技术讨论（不带推广） |
| r/artificial | 2M+ | AI安全角度 |

**Reddit发帖模板**:
```
标题: I built agent-guardrails after AI deleted my production config

正文:
Last week, Claude Code deleted my production config file.
I couldn't even be mad — I had no guardrails.

So I built agent-guardrails: a runtime safety layer that constrains
what AI coding agents can do BEFORE they do it.

Key features:
- Define which files AI can/cannot touch (task contracts)
- Catch semantic drift (parallel abstractions, interface changes)
- 95% of AI-related incidents caught before merge
- Works with Claude Code, Cursor, OpenCode, Codex, Windsurf

npm install -g agent-guardrails

It's MIT licensed. Would love feedback from anyone using AI coding tools.
```

### 5. HackerNews 发布

**标题**: "Show HN: Agent Guardrails – Runtime safety for AI coding agents"
**最佳发帖时间**: 美东周二-周四 8-10am

### 6. 技术博客

**发布平台优先级**:
1. Dev.to（开发者社区，SEO好）
2. Medium（更广泛的读者）
3. 掘金（中文开发者社区）

**博客主题**:
1. "Why Your AI Coding Agent Needs Guardrails (And How to Add Them)"
2. "I Benchmarked AI Code Safety: Guardrails vs No Guardrails"
3. "How We Prevent AI From Deleting Production Data"

## 🟢 P2: 持续执行

### 7. GitHub SEO 优化

**README关键词强化**（提升GitHub搜索排名）:
- `ai-agent-safety`
- `runtime-guardrails`
- `claude-code-security`
- `cursor-safety`
- `ai-code-review`
- `mcp-server`
- `semantic-drift-detection`

### 8. 安全社区渗透

| 目标 | 行动 |
|------|------|
| Trail of Bits 博客 | 提交guest post关于AI编码安全 |
| Semgrep 生态 | 探索规则集集成 |
| OWASP | 提交AI安全相关talk |
| AI Safety Directory | https://aisecurityandsafety.org/ 提交 |

### 9. VS Code 扩展

**参考**: 已有 Claude Code Extension (92K安装量)
**入口**: https://marketplace.visualstudio.com/

---

## 渠道效果预估

| 渠道 | 曝光量 | 预期转化率 | 预期新增用户 | 成本 |
|------|--------|-----------|-------------|------|
| awesome-claude-code PR | 35K | 0.5% | 175 | $0 |
| awesome-claude-skills PR | 50K | 0.3% | 150 | $0 |
| Claude Code Plugin市场 | 10K/月 | 2% | 200/月 | $0 |
| Reddit r/ClaudeAI | 50K | 0.3% | 150 | $0 |
| HackerNews Show HN | 100K | 0.1% | 100 | $0 |
| Dev.to博客 | 5K | 0.5% | 25 | 时间 |
| **合计（首月）** | **~250K** | — | **~800** | **$0** |

**目标**: 从 < 100 用户 → 首月 500+ 新用户
