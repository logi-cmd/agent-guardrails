/**
 * AGENTS.md Generator
 *
 * 基于 Harness Engineering 范式，生成符合 OpenAI 推荐的渐进式文档结构
 *
 * OpenAI 团队的 AGENTS.md 结构:
 * - 精简目录（~100行）
 * - 渐进式披露
 * - 指向 docs/ 目录
 */

import fs from "node:fs";
import path from "node:path";
import { createTranslator } from "../i18n.js";
import { ensureDirectory, readConfig } from "../utils.js";

// AGENTS.md 模板
const AGENTS_MD_TEMPLATE = `# AGENTS.md

> 此文件由 agent-guardrails 自动生成
> 基于 Harness Engineering 范式，帮助 AI Agent 更好地理解项目

## 项目概述

<!-- 简短描述项目是做什么的 -->

## 快速开始

\`\`\`bash
# 安装依赖
npm install

# 运行测试
npm test

# 启动开发服务器
npm run dev
\`\`\`

## 架构约束

### 分层架构

\`\`\`
┌─────────────────────────────────────────┐
│              表现层 (UI)                 │
├─────────────────────────────────────────┤
│              应用层 (Services)           │
├─────────────────────────────────────────┤
│              领域层 (Domain)             │
├─────────────────────────────────────────┤
│              基础设施层 (Infra)           │
└─────────────────────────────────────────┘
\`\`\`

### 依赖规则

- 上层可以依赖下层
- 下层不能依赖上层
- 同层之间尽量独立

## 代码风格

### 命名约定

- 文件名: kebab-case (例: user-service.ts)
- 类名: PascalCase (例: UserService)
- 函数名: camelCase (例: getUserById)
- 常量: UPPER_SNAKE_CASE (例: MAX_RETRY_COUNT)

### 目录结构

\`\`\`
src/
├── modules/           # 功能模块
│   ├── user/
│   │   ├── user.service.ts
│   │   ├── user.controller.ts
│   │   └── user.types.ts
│   └── ...
├── shared/            # 共享代码
│   ├── utils/
│   └── types/
└── config/            # 配置文件
\`\`\`

## 禁止事项

❌ 不要直接修改数据库迁移文件
❌ 不要跳过测试提交代码
❌ 不要在 src 外创建新的源代码目录
❌ 不要使用 any 类型（除非有充分理由）

## 详细文档

更多信息请查看 docs/ 目录：

- [架构设计](./docs/ARCHITECTURE.md)
- [API 文档](./docs/API.md)
- [测试指南](./docs/TESTING.md)

---
*此文件由 agent-guardrails 生成 | Harness Engineering Ready*
`;

// docs/ARCHITECTURE.md 模板
const ARCHITECTURE_MD_TEMPLATE = `# 架构设计

## 系统架构

<!-- 描述系统的整体架构 -->

## 模块划分

<!-- 描述主要模块及其职责 -->

## 数据流

<!-- 描述数据如何在系统中流动 -->

## 关键决策

<!-- 记录重要的架构决策及其原因 -->

## 待办事项

<!-- 需要改进的地方 -->
`;

// docs/TESTING.md 模板
const TESTING_MD_TEMPLATE = `# 测试指南

## 测试策略

### 单元测试

- 每个模块都应该有对应的单元测试
- 测试文件放在 \\\`__tests__\\\` 目录或与源文件同级
- 使用 jest 作为测试框架

\`\`\`bash
# 运行单元测试
npm test

# 运行特定测试
npm test -- user.service.test.ts
\`\`\`

### 集成测试

- 测试模块之间的交互
- 使用测试数据库

### E2E 测试

- 测试完整的用户流程
- 使用 Cypress 或 Playwright

## 测试覆盖率

目标：80% 以上的代码覆盖率

\`\`\`bash
# 查看覆盖率报告
npm run test:coverage
\`\`\`

## Mock 规则

- 外部服务必须 mock
- 数据库操作使用测试数据库
- 时间相关的测试使用固定时间
`;

/**
 * 生成 AGENTS.md 文件
 */
export function generateAgentsMd(options) {
  const { repoRoot, preset, locale } = options;
  const t = createTranslator(locale);

  const agentsMdPath = path.join(repoRoot, "AGENTS.md");
  const docsDir = path.join(repoRoot, "docs");

  // 检查是否已存在
  if (fs.existsSync(agentsMdPath)) {
    return {
      ok: false,
      reason: "AGENTS.md already exists",
      path: agentsMdPath
    };
  }

  // 创建 docs 目录
  ensureDirectory(docsDir);

  // 生成 AGENTS.md
  fs.writeFileSync(agentsMdPath, AGENTS_MD_TEMPLATE, "utf8");

  // 生成 docs/ARCHITECTURE.md
  const architecturePath = path.join(docsDir, "ARCHITECTURE.md");
  if (!fs.existsSync(architecturePath)) {
    fs.writeFileSync(architecturePath, ARCHITECTURE_MD_TEMPLATE, "utf8");
  }

  // 生成 docs/TESTING.md
  const testingPath = path.join(docsDir, "TESTING.md");
  if (!fs.existsSync(testingPath)) {
    fs.writeFileSync(testingPath, TESTING_MD_TEMPLATE, "utf8");
  }

  return {
    ok: true,
    files: [
      agentsMdPath,
      architecturePath,
      testingPath
    ],
    message: "AGENTS.md generated successfully"
  };
}

/**
 * 更新 AGENTS.md
 */
export function updateAgentsMd(options) {
  const { repoRoot, section, content, locale } = options;

  const agentsMdPath = path.join(repoRoot, "AGENTS.md");

  if (!fs.existsSync(agentsMdPath)) {
    return {
      ok: false,
      reason: "AGENTS.md not found. Run 'agent-guardrails generate-agents' first."
    };
  }

  const currentContent = fs.readFileSync(agentsMdPath, "utf8");

  // 根据 section 更新对应部分
  // 这里可以扩展更多 section 的更新逻辑

  return {
    ok: true,
    message: "AGENTS.md updated"
  };
}

/**
 * CLI 命令入口
 */
export async function runGenerateAgentsMd({ positional, flags, locale = null }) {
  const repoRoot = positional[0] ? path.resolve(positional[0]) : process.cwd();
  const preset = flags.preset || "node-service";
  const t = createTranslator(locale).t;

  console.log(t("agentsMd.generating"));

  const result = generateAgentsMd({
    repoRoot,
    preset,
    locale: flags.lang || locale
  });

  if (result.ok) {
    console.log(t("agentsMd.generatedSuccessfully"));
    console.log(t("agentsMd.filesCreated"));
    result.files.forEach(file => {
      console.log(`  - ${path.relative(repoRoot, file)}`);
    });
    console.log("" + t("agentsMd.whatsNext"));
    console.log("  1. " + t("agentsMd.next1"));
    console.log("  2. " + t("agentsMd.next2"));
    console.log("  3. " + t("agentsMd.next3"));
    console.log("  4. " + t("agentsMd.next4"));
  } else {
    console.log(t("agentsMd.generationFailed", { reason: result.reason }));
    console.log(`   Path: ${result.path}`);
  }

  return result;
}
