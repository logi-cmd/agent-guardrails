# Agent Guardrails 中文说明

**[English](../../README.md)** | **中文**

`agent-guardrails` 是一个给 AI 编码工具使用的本地安全层。它不会替代 Claude Code、Codex、Cursor、Gemini 或 OpenCode，而是帮助你把一次需求约束成明确任务，并在合并前检查改动是否越界、验证是否执行、证据是否留下。

## 它解决什么问题

AI 写代码很快，但交付前经常会卡在这些问题上：

- 这次任务原本应该改哪些文件？
- AI 有没有顺手改到范围外？
- 测试或验证命令真的跑过吗？
- 后续 review 能不能看到证据？
- 一个小需求有没有变成一次大范围重构？

`agent-guardrails` 把这些检查变成固定流程，而不是每次靠人工重新追问。

## 能检查什么

- 范围：检查改动是否超出任务、允许路径或指定文件。
- 验证：检查是否报告了验证命令，以及证据文件是否存在。
- 一致性：当一次任务扩散到太多文件或目录时给出提醒。
- 风险：提示受保护路径、接口变化、配置变化、迁移变化和疑似敏感信息。
- Review 输出：给出分数、结论、问题、下一步和简短 review 摘要。
- Agent 接入：为常见 agent 写入本地辅助文件，并给出 MCP 配置提示。

## 支持的 Agent

| Agent | 辅助文件位置 |
| --- | --- |
| Claude Code | `CLAUDE.md` |
| Codex | `.codex/instructions.md` |
| Cursor | `.cursor/rules/agent-guardrails-enforce.mdc` |
| Gemini CLI | `GEMINI.md` |
| OpenCode | `.opencode/rules/agent-guardrails-enforce.md` |

## 安装要求

- Node.js 18+
- Git
- 需要在 git 仓库中使用

npm 包包含 Windows x64、macOS x64/arm64、Linux x64 的 native runtime 文件，同时保留 Node runtime 作为 fallback。

## 快速开始

```bash
npm install -g agent-guardrails

cd your-repo
agent-guardrails setup . --agent codex --lang zh-CN
agent-guardrails enforce --all --lang zh-CN
agent-guardrails doctor --lang zh-CN
```

把 `codex` 换成你实际使用的 agent：`claude-code`、`codex`、`cursor`、`gemini` 或 `opencode`。

## 典型使用流程

1. 在项目里完成一次 setup。
2. 让你的 AI agent 使用 `agent-guardrails`。
3. 用 `plan` 创建任务约束，或让支持 MCP 的 agent 自动开启受保护的实现流程。
4. 完成最小范围的改动。
5. 跑验证命令，再运行 `check --review`。

```bash
agent-guardrails plan \
  --task "Add input validation" \
  --intended-files "src/add.js,tests/add.test.js" \
  --allow-paths "src/,tests/,evidence/" \
  --required-commands "npm test" \
  --evidence "evidence/add-validation.md" \
  --lang en
```

![agent-guardrails 0.20.0 plan output](../../assets/readme-plan.svg)

```bash
npm test
agent-guardrails check --base-ref HEAD~1 --commands-run "npm test" --review --lang en
```

![agent-guardrails 0.20.0 review output](../../assets/readme-check-review.svg)

上面的截图来自 `agent-guardrails@0.20.0` 在临时 git 仓库中的真实输出。

## MCP 接入

`setup` 会输出当前 agent 需要的 MCP 配置。以 Codex 为例：

```toml
[mcp_servers.agent-guardrails]
command = "npx"
args = ["agent-guardrails", "mcp"]
```

接入后，支持 MCP 的 agent 可以读取仓库规则、创建任务约束、在改动后检查范围，并在结束前输出 review 摘要。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `setup . --agent <name>` | 初始化仓库规则和 agent 辅助文件。 |
| `enforce --all` | 为支持的 agent 注入更强的 guardrail 指令。 |
| `unenforce --all` | 移除注入的 guardrail 指令。 |
| `plan --task "..."` | 实现前写入任务契约。 |
| `check --review` | 运行面向 reviewer 的检查。 |
| `doctor` | 检查当前仓库配置和运行时状态。 |
| `generate-agents` | 重新生成 agent 辅助文件。 |
| `mcp` | 启动 stdio MCP server。 |
| `serve` | 启动本地 API 服务，供集成使用。 |
| `start`、`stop`、`status` | 管理本地后台进程。 |

## 可选 Pro 兼容

OSS 包可以独立使用，不包含 Pro 独占的决策逻辑。

如果本机安装并授权了单独的 Pro 包，OSS CLI 可以显示 Pro 状态和报告：

```bash
agent-guardrails pro status
agent-guardrails pro activate <license-key>
agent-guardrails pro report
agent-guardrails pro workbench --open
```

如果没有安装或授权 Pro，OSS 的普通命令不受影响。

## 更多文档

- [English README](../../README.md)
- [Workflows](../WORKFLOWS.md)
- [Troubleshooting](../TROUBLESHOOTING.md)
- [Proof](../PROOF.md)
