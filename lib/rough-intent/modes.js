/**
 * Rough-Intent 交互模式
 *
 * 提供三种模式：
 * - interactive: CLI 终端交互
 * - mcp: MCP 工具调用，返回 JSON
 * - ci: CI/CD 环境，自动或从配置读取
 */

import {
  parseRoughIntent,
  generateSuggestionText,
  isRoughIntent
} from './parser.js';
import {
  readConfig,
  writeTaskContract,
  defaultTaskContractPath,
  normalizeRepoPath
} from '../utils.js';
import path from 'node:path';
import fs from 'node:fs';

/**
 * 获取仓库上下文
 */
function getRepoContext(repoRoot) {
  const config = readConfig(repoRoot);
  const packageJsonPath = path.join(repoRoot, 'package.json');

  let packageJson = null;
  try {
    if (fs.existsSync(packageJsonPath)) {
      packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    }
  } catch {
    // ignore
  }

  // 获取文件树
  const fileTree = [];
  function walkDir(dir, base = '') {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = path.join(dir, entry.name);
        const relativePath = base ? `${base}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walkDir(fullPath, relativePath);
        } else {
          fileTree.push(relativePath);
        }
      }
    } catch {
      // ignore
    }
  }
  walkDir(repoRoot);

  return {
    config,
    packageJson,
    fileTree,
    files: fileTree
  };
}

/**
 * CLI 交互模式
 */
export async function interactiveMode(parsed, options = {}) {
  const { repoRoot, locale = 'en' } = options;
  const text = generateSuggestionText(parsed, locale);

  // 打印建议
  console.log(`
${'─'.repeat(50)}
📋 ${text.title}
${'─'.repeat(50)}

${text.taskType}
${text.confidence}

${text.paths}

${text.commands}

${text.risk}
${text.rules ? '\n' + text.rules : ''}

${'─'.repeat(50)}
${text.confirm}
${'─'.repeat(50)}
`);

  // 简化的交互：由于没有 inquirer，使用 --yes 标志自动确认
  // 在实际 CLI 中可以用 readline 或 inquirer
  const autoConfirm = options.yes || options.y;

  if (autoConfirm) {
    return {
      action: 'confirm',
      contract: buildContractFromParsed(parsed, options)
    };
  }

  // 返回需要用户确认的状态
  return {
    action: 'pending',
    status: 'needs_confirmation',
    suggestion: parsed,
    text,
    availableActions: ['confirm', 'modify', 'cancel']
  };
}

/**
 * MCP 工具模式 - 返回 JSON
 */
export function mcpMode(parsed, options = {}) {
  const { locale = 'en' } = options;
  const text = generateSuggestionText(parsed, locale);

  return {
    status: 'suggestion',
    suggestion: {
      task: parsed.task,
      taskType: parsed.taskType,
      confidence: parsed.confidence,
      inferred: parsed.inferred,
      sources: parsed.sources
    },
    display: text,
    actions: [
      {
        type: 'accept',
        label: text.actions.confirm,
        description: 'Accept the suggested contract'
      },
      {
        type: 'modify',
        label: text.actions.modify,
        description: 'Modify the scope before proceeding'
      },
      {
        type: 'reject',
        label: text.actions.cancel,
        description: 'Cancel the operation'
      }
    ],
    message: `Detected ${parsed.taskType} task with ${(parsed.confidence * 100).toFixed(0)}% confidence. Please confirm or modify.`
  };
}

/**
 * CI 模式 - 自动或从配置读取
 */
export function ciMode(parsed, options = {}) {
  const { ciConfig = {}, minConfidence = 0.6 } = options;

  // 如果置信度足够高，自动确认
  if (parsed.confidence >= minConfidence) {
    return {
      action: 'auto_confirmed',
      contract: buildContractFromParsed(parsed, options),
      reason: `Confidence ${(parsed.confidence * 100).toFixed(0)}% >= ${minConfidence * 100}%`
    };
  }

  // 置信度不够，需要人工介入
  return {
    action: 'needs_review',
    status: 'low_confidence',
    confidence: parsed.confidence,
    minConfidence,
    suggestion: parsed,
    message: `Confidence ${(parsed.confidence * 100).toFixed(0)}% is below threshold ${minConfidence * 100}%. Manual review required.`
  };
}

/**
 * 自动模式 - 无需确认
 */
export function autoMode(parsed, options = {}) {
  const contract = buildContractFromParsed(parsed, options);

  return {
    status: 'created',
    contract,
    message: `✅ Contract auto-created for ${parsed.taskType} task`
  };
}

/**
 * 从解析结果构建契约
 */
function buildContractFromParsed(parsed, options = {}) {
  const { repoRoot, preset = 'node-service', contractPath = defaultTaskContractPath } = options;

  return {
    schemaVersion: 3,
    task: parsed.task,
    preset,
    createdAt: new Date().toISOString(),
    allowedPaths: parsed.inferred.allowedPaths,
    requiredCommands: parsed.inferred.requiredCommands,
    evidencePaths: [parsed.inferred.evidencePath],
    intendedFiles: [],
    protectedPaths: [],
    allowedChangeTypes: [],
    riskLevel: parsed.inferred.riskLevel,
    requiresReviewNotes: parsed.inferred.riskLevel === 'high' || parsed.inferred.riskLevel === 'critical',
    validationProfile: 'standard',
    securityRequirements: [],
    dependencyRequirements: [],
    performanceRequirements: [],
    understandingRequirements: [],
    continuityRequirements: [],
    guardRules: parsed.inferred.guardRules,
    roughIntent: {
      detected: true,
      taskType: parsed.taskType,
      confidence: parsed.confidence,
      sources: parsed.sources
    }
  };
}

/**
 * 主入口：处理 Rough-Intent
 */
export async function handleRoughIntent(intent, options = {}) {
  const {
    mode = 'interactive', // interactive | mcp | ci | auto
    repoRoot = process.cwd(),
    locale = 'en',
    yes = false,
    isPro = false
  } = options;

  // 获取仓库上下文
  const repoContext = getRepoContext(repoRoot);

  // 解析意图
  const parsed = parseRoughIntent(intent, repoContext, { isPro });

  // 根据模式处理
  switch (mode) {
    case 'interactive':
      return await interactiveMode(parsed, { repoRoot, locale, yes });

    case 'mcp':
      return mcpMode(parsed, { locale });

    case 'ci':
      return ciMode(parsed, options);

    case 'auto':
      return autoMode(parsed, options);

    default:
      return await interactiveMode(parsed, { repoRoot, locale, yes });
  }
}

/**
 * 确认契约并保存
 */
export function confirmAndSave(parsed, options = {}) {
  const { repoRoot = process.cwd(), contractPath = defaultTaskContractPath } = options;

  const contract = buildContractFromParsed(parsed, options);
  const savedPath = writeTaskContract(repoRoot, contract, contractPath);

  return {
    ok: true,
    contract,
    contractPath: savedPath,
    message: `✅ Contract saved to ${normalizeRepoPath(savedPath.replace(repoRoot, ''))}`
  };
}

/**
 * 修改契约范围
 */
export function modifyScope(parsed, newPaths, options = {}) {
  const modified = {
    ...parsed,
    inferred: {
      ...parsed.inferred,
      allowedPaths: newPaths
    },
    sources: {
      ...parsed.sources,
      paths: 'user_modified'
    }
  };

  return modified;
}

// 导出
export { isRoughIntent, parseRoughIntent, generateSuggestionText };
