/**
 * Rough-Intent 模块入口
 *
 * 将模糊的用户意图转换为结构化的任务契约
 *
 * 使用方式：
 *
 * 1. CLI 交互模式：
 *    agent-guardrails plan "加个登录功能"
 *
 * 2. MCP 工具模式（供 Agent 调用）：
 *    { mode: 'mcp', task: '加个登录功能' }
 *
 * 3. CI/CD 自动模式：
 *    { mode: 'ci', task: '加个登录功能', minConfidence: 0.7 }
 *
 * 4. 完全自动模式：
 *    { mode: 'auto', task: '加个登录功能' }
 */

export {
  // 核心解析
  parseRoughIntent,
  classifyTask,
  extractKeywords,
  inferPaths,
  inferTestCommand,
  inferRiskLevel,
  generateGuardRules,
  isRoughIntent,
  generateSuggestionText
} from './parser.js';

export {
  // 模式处理
  handleRoughIntent,
  interactiveMode,
  mcpMode,
  ciMode,
  autoMode,
  confirmAndSave,
  modifyScope
} from './modes.js';
