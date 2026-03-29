## Release Notes v0.6.1

**Release Date:** March 30, 2026

### 🐛 Bug Fixes

- **Windows daemon spawn fixed** - Resolved daemon start failures on Windows
  - Fixed `detached: true` incompatibility with Windows process spawning
  - Added `windowsHide: true` to prevent console window flashing
  - Increased wait time for PID file creation
  - Fixed gui-server.js template string syntax errors

---

## Release Notes v0.6.0

**Release Date:** March 30, 2026

### ✨ New Features

#### 🖥️ GUI Dashboard
- **Browser-based real-time dashboard** - Automatically opens when you start the daemon
- **Dark theme** - Easy on the eyes for long coding sessions  
- **Real-time updates** via Server-Sent Events (SSE)
- **Summary view** - Error/warning/info counts at a glance
- **Detailed findings** - Full issue descriptions with severity levels
- **Auto-fix status panel** - Shows which Tier-1 issues were automatically fixed
- **Connection status** - Know when the daemon is running

#### 🔧 Tier-1 Auto-Fix
- **Automatic fixing of safe issues** while you code
- **Safety-first approach**: Only modifies config files and templates, never source code
- **Zero-side-effect guarantee**: 
  - All fixes are verified before being kept
  - Failed fixes are automatically rolled back
  - Source code is never modified

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
npm install -g agent-guardrails@0.6.1

# Start daemon with GUI (auto-opens browser)
agent-guardrails start

# Start without GUI (headless mode)
agent-guardrails start --no-gui
```

### ⚙️ Configuration

`.agent-guardrails/daemon.json`:
```json
{
  "watchPaths": ["src/", "lib/", "tests/"],
  "ignorePatterns": ["node_modules", ".git", "*.log"],
  "checkInterval": 5000,
  "autoFix": true
}
```

### 📚 Documentation

- [Complete User Guide](https://github.com/logi-cmd/agent-guardrails#user-guide--使用指南)
- [Daemon Mode Documentation](https://github.com/logi-cmd/agent-guardrails#daemon-mode--守护进程模式)
- [Bilingual README](https://github.com/logi-cmd/agent-guardrails/blob/main/README.md)

### 🔄 Upgrade Guide

**From v0.5.0:**
```bash
# Update to latest version
npm update -g agent-guardrails

# In your project (existing setup still works)
cd your-project
agent-guardrails start  # Now opens GUI automatically
```

**No re-setup required** - Existing configurations are fully compatible.

### 📝 Changes Summary

- feat: Add GUI dashboard with real-time SSE updates
- feat: Add Tier-1 auto-fix system for safe issue resolution
- feat: Add `--no-gui` flag for headless operation
- feat: Add daemon configuration file support (daemon.json)
- docs: Comprehensive bilingual README updates
- fix: Windows compatibility improvements (v0.6.1)

---

## Release Notes v0.6.0 (中文)

**发布日期：** 2026年3月30日

### ✨ 新功能

#### 🖥️ GUI 仪表盘
- **浏览器实时仪表盘** - 启动守护进程时自动打开
- **深色主题** - 长时间编码不疲劳
- **实时更新** - 通过 SSE 推送最新结果
- **摘要视图** - 错误/警告/信息一目了然
- **详细问题** - 完整的问题描述和严重级别
- **自动修复状态面板** - 显示已自动修复的 Tier-1 问题
- **连接状态** - 实时显示守护进程状态

#### 🔧 一级自动修复
- **编码时自动修复** 安全问题
- **安全第一**: 只修改配置文件和模板，绝不修改源代码
- **零副作用保证**:
  - 所有修复在保留前都经过验证
  - 失败的修复自动撤销
  - 源代码永不被修改

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
npm install -g agent-guardrails@0.6.1

# 启动守护进程（自动打开浏览器）
agent-guardrails start

# 无界面模式启动
agent-guardrails start --no-gui
```

### ⚙️ 配置

`.agent-guardrails/daemon.json`:
```json
{
  "watchPaths": ["src/", "lib/", "tests/"],
  "ignorePatterns": ["node_modules", ".git", "*.log"],
  "checkInterval": 5000,
  "autoFix": true
}
```

### 🔄 升级指南

**从 v0.5.0 升级：**
```bash
# 更新到最新版
npm update -g agent-guardrails

# 在你的项目中（现有配置仍然有效）
cd your-project
agent-guardrails start  # 现在自动打开 GUI
```

**无需重新设置** - 现有配置完全兼容。

---

## Contributors

Thanks to all contributors who made this release possible!

---

## Links

- [Full Changelog](https://github.com/logi-cmd/agent-guardrails/compare/v0.5.0...v0.6.1)
- [Documentation](https://github.com/logi-cmd/agent-guardrails#readme)
- [Issues](https://github.com/logi-cmd/agent-guardrails/issues)

## Install

```bash
npm install -g agent-guardrails@0.6.1
```

## Verify

```bash
agent-guardrails --version  # Should output: 0.6.1
```
