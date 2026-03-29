## What's New in v0.6.0

### 🖥️ GUI Dashboard
- **Browser-based real-time dashboard** - Automatically opens when you start the daemon
- **Dark theme** - Easy on the eyes for long coding sessions
- **Real-time updates** via Server-Sent Events (SSE)
- **Summary view** - Error/warning/info counts at a glance
- **Detailed findings** - Full issue descriptions with severity levels
- **Connection status** - Know when the daemon is running

### 🔧 Tier-1 Auto-Fix
- **Automatic fixing of safe issues** while you code
- **Safety-first approach**: Only modifies config files and templates, never source code
- **Rollback mechanism** - Failed fixes are automatically reverted
- **Verification** - All fixes are verified before being kept

**Auto-fix rules** (Tier 1 - Zero Risk):
| Rule | Description |
|------|-------------|
| `evidence-file-missing` | Creates missing evidence directory and file |
| `test-stub-missing` | Creates test stub for intended source files |
| `gitignore-missing` | Adds .gitignore entries for guardrails files |
| `empty-evidence-update` | Updates evidence file with template sections |

### 🚀 Usage

```bash
# Install latest version
npm install -g agent-guardrails

# Start daemon with GUI (auto-opens browser)
agent-guardrails start

# Start without GUI
agent-guardrails start --no-gui
```

### Configuration

`.agent-guardrails/daemon.json`:
```json
{
  "watchPaths": ["src/", "lib/", "tests/"],
  "ignorePatterns": ["node_modules", ".git", "*.log"],
  "checkInterval": 5000,
  "autoFix": true
}
```

### Documentation

- [Complete User Guide](https://github.com/logi-cmd/agent-guardrails#user-guide--使用指南)
- [Daemon Mode Documentation](https://github.com/logi-cmd/agent-guardrails#daemon-mode--守护进程模式)
- [Bilingual README](https://github.com/logi-cmd/agent-guardrails/blob/main/README.md)

---

## v0.6.0 新功能

### 🖥️ GUI 仪表盘
- **浏览器实时仪表盘** - 启动守护进程时自动打开
- **深色主题** - 长时间编码不疲劳
- **实时更新** - 通过 SSE 推送最新结果
- **摘要视图** - 错误/警告/信息一目了然
- **详细问题** - 完整的问题描述和严重级别
- **连接状态** - 实时显示守护进程状态

### 🔧 一级自动修复
- **编码时自动修复**安全问题
- **安全第一**: 只修改配置文件和模板，绝不修改源代码
- **自动回滚** - 失败的修复自动撤销
- **修复验证** - 所有修复在保留前都经过验证

**自动修复规则** (Tier 1 - 零风险):
| 规则 | 说明 |
|------|------|
| `evidence-file-missing` | 创建缺失的 evidence 目录和文件 |
| `test-stub-missing` | 为预期源文件创建测试 stub |
| `gitignore-missing` | 为 guardrails 文件添加 .gitignore 条目 |
| `empty-evidence-update` | 使用模板内容更新 evidence 文件 |

### 🚀 使用方式

```bash
# 安装最新版
npm install -g agent-guardrails

# 启动守护进程（自动打开浏览器）
agent-guardrails start

# 无界面模式启动
agent-guardrails start --no-gui
```

---

## Files
- Source code (zip)
- Source code (tar.gz)

## Install
```bash
npm install -g agent-guardrails@0.6.0
```

## Verify
```bash
agent-guardrails --version  # Should output: 0.6.0
```
