/**
 * Rough-Intent Parser
 *
 * 将模糊的用户意图转换为结构化的任务契约建议
 *
 * OSS 功能:
 * - 基础任务类型识别
 * - 关键词路径推断
 * - 测试命令推断
 * - 风险等级推断
 *
 * Pro 功能:
 * - 语义分析推断
 * - 团队策略继承
 * - 历史学习
 * - 置信度详情
 */

// 任务类型定义
const TASK_TYPES = {
  auth: {
    keywords: ['登录', '注册', '认证', 'auth', 'login', 'signin', 'signup', 'password', '密码', 'token'],
    suggestedPaths: ['src/auth/', 'src/middleware/', 'src/services/user.'],
    riskLevel: 'medium',
    guardRules: ['不要修改数据库迁移文件', '密码必须加密存储', '敏感信息不要记录到日志']
  },
  feature: {
    keywords: ['添加', '新增', '功能', 'feature', 'add', 'implement', '实现', '开发'],
    suggestedPaths: ['src/'],
    riskLevel: 'standard',
    guardRules: ['添加相应的测试', '遵循现有代码风格']
  },
  bugfix: {
    keywords: ['bug', '修复', 'fix', 'error', '错误', '问题', 'issue', 'crash', '崩溃'],
    suggestedPaths: [],
    riskLevel: 'high',
    guardRules: ['保留原有行为', '添加回归测试', '记录修复原因']
  },
  refactor: {
    keywords: ['重构', '整理', 'refactor', 'clean', '优化', 'optimize', 'improve', '改进'],
    suggestedPaths: [],
    riskLevel: 'medium',
    guardRules: ['不改变外部行为', '保持测试通过', '分步骤进行']
  },
  performance: {
    keywords: ['性能', '优化', '慢', 'performance', 'optimize', 'slow', 'fast', 'speed', '内存', 'memory'],
    suggestedPaths: ['src/'],
    riskLevel: 'high',
    guardRules: ['添加性能基准测试', '记录优化前后对比']
  },
  api: {
    keywords: ['api', '接口', 'endpoint', 'rest', 'graphql', 'route', '路由'],
    suggestedPaths: ['src/routes/', 'src/controllers/', 'src/api/'],
    riskLevel: 'medium',
    guardRules: ['保持 API 兼容性', '更新 API 文档']
  },
  ui: {
    keywords: ['ui', '界面', '页面', 'component', '组件', '样式', 'style', 'css', '前端'],
    suggestedPaths: ['src/components/', 'src/pages/', 'src/styles/'],
    riskLevel: 'low',
    guardRules: ['保持响应式设计', '遵循设计系统']
  },
  test: {
    keywords: ['测试', 'test', 'spec', 'coverage', '覆盖'],
    suggestedPaths: ['tests/', 'test/', '__tests__/', 'spec/'],
    riskLevel: 'low',
    guardRules: ['不修改源代码逻辑']
  },
  config: {
    keywords: ['配置', 'config', 'settings', '环境', 'env', '变量'],
    suggestedPaths: ['config/', '.env', 'src/config/'],
    riskLevel: 'high',
    guardRules: ['不要提交敏感信息', '更新文档说明']
  },
  docs: {
    keywords: ['文档', 'docs', 'readme', '注释', 'comment', 'documentation'],
    suggestedPaths: ['docs/', 'README.md'],
    riskLevel: 'low',
    guardRules: ['不修改代码逻辑']
  }
};

// 技术栈关键词到路径的映射
const TECH_PATHS = {
  // 用户相关
  '用户': ['user', 'users', 'auth'],
  '订单': ['order', 'orders'],
  '支付': ['payment', 'checkout', 'billing'],
  '商品': ['product', 'products', 'item', 'items'],
  '购物车': ['cart', 'basket'],
  '消息': ['message', 'chat', 'notification'],
  '评论': ['comment', 'review'],
  '搜索': ['search', 'query'],

  // 技术相关
  '数据库': ['db', 'database', 'models', 'entities'],
  '缓存': ['cache', 'redis'],
  '队列': ['queue', 'job', 'worker'],
  '日志': ['log', 'logger', 'logging'],
  '文件': ['file', 'upload', 'storage'],
  '邮件': ['email', 'mail', 'smtp'],
  '短信': ['sms', 'message']
};

// 测试命令推断
const TEST_COMMANDS = {
  'package.json': {
    'scripts.test': 'npm test',
    'scripts."test:coverage"': 'npm run test:coverage'
  },
  'pyproject.toml': 'pytest',
  'requirements.txt': 'pytest',
  'Cargo.toml': 'cargo test',
  'go.mod': 'go test ./...',
  'pom.xml': 'mvn test',
  'build.gradle': './gradlew test'
};

/**
 * 分析用户意图，返回任务类型和置信度
 */
export function classifyTask(intent) {
  const normalized = String(intent || '').toLowerCase().trim();

  if (!normalized) {
    return { type: 'general', confidence: 0 };
  }

  const scores = {};

  // 计算每种类型的匹配分数
  for (const [type, config] of Object.entries(TASK_TYPES)) {
    let score = 0;

    for (const keyword of config.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        // 精确匹配得分更高
        score += normalized === keyword.toLowerCase() ? 3 : 1;
      }
    }

    if (score > 0) {
      scores[type] = score;
    }
  }

  // 找到最高分的类型
  const sortedTypes = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (sortedTypes.length === 0) {
    return { type: 'general', confidence: 0.3 };
  }

  const [bestType, bestScore] = sortedTypes[0];
  const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
  const confidence = Math.min(0.95, 0.5 + (bestScore / Math.max(totalScore, 1)) * 0.45);

  return {
    type: bestType,
    confidence,
    allMatches: sortedTypes.slice(0, 3).map(([t, s]) => ({ type: t, score: s }))
  };
}

/**
 * 从意图中提取关键词
 */
export function extractKeywords(intent) {
  const normalized = String(intent || '').toLowerCase();
  const keywords = [];

  // 提取技术栈关键词
  for (const [cn, enList] of Object.entries(TECH_PATHS)) {
    if (normalized.includes(cn.toLowerCase())) {
      keywords.push(cn.toLowerCase(), ...enList);
    }
    // 也检查英文关键词
    for (const en of enList) {
      if (normalized.includes(en.toLowerCase())) {
        keywords.push(en.toLowerCase());
      }
    }
  }

  // 提取可能的文件名（如 user.service.ts）
  const filePatterns = normalized.match(/[a-z]+[\.\-][a-z]+/g) || [];
  keywords.push(...filePatterns);

  return [...new Set(keywords)];
}

/**
 * 推断允许的路径
 */
export function inferPaths(intent, fileTree, taskType, options = {}) {
  const { isPro = false } = options;
  const suggestions = new Set();
  const taskConfig = TASK_TYPES[taskType] || TASK_TYPES.feature;

  // 1. 基于任务类型添加默认路径
  for (const path of taskConfig.suggestedPaths) {
    suggestions.add(path);
  }

  // 2. 基于关键词匹配文件树
  const keywords = extractKeywords(intent);

  if (fileTree && fileTree.length > 0) {
    for (const filePath of fileTree) {
      const normalized = filePath.toLowerCase();

      for (const keyword of keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          // 找到匹配的文件，添加其目录
          const dir = filePath.substring(0, filePath.lastIndexOf('/'));
          if (dir) {
            suggestions.add(dir + '/');
          }
          // 也添加文件本身
          suggestions.add(filePath);
        }
      }
    }
  }

  // 3. Pro: 语义分析（TODO: 实现更高级的推断）
  if (isPro) {
    // TODO: 使用 AST 分析依赖关系
    // TODO: 分析 import 语句
  }

  return {
    paths: [...suggestions].filter(p => p && !p.startsWith('node_modules') && !p.startsWith('.git')),
    confidence: keywords.length > 0 ? 0.7 : 0.4
  };
}

/**
 * 推断测试命令
 */
export function inferTestCommand(repoContext) {
  const { packageJson, files } = repoContext;

  // 1. 从 package.json 读取
  if (packageJson?.scripts?.test) {
    return {
      command: 'npm test',
      source: 'package.json',
      confidence: 0.95
    };
  }

  // 2. 根据项目文件推断
  if (files) {
    if (files.some(f => f.includes('pytest') || f.includes('pyproject.toml'))) {
      return { command: 'pytest', source: 'inferred', confidence: 0.8 };
    }
    if (files.some(f => f.includes('go.mod'))) {
      return { command: 'go test ./...', source: 'inferred', confidence: 0.8 };
    }
    if (files.some(f => f.includes('Cargo.toml'))) {
      return { command: 'cargo test', source: 'inferred', confidence: 0.8 };
    }
  }

  // 3. 默认建议
  return {
    command: 'npm test',
    source: 'default',
    confidence: 0.3
  };
}

/**
 * 推断风险等级
 */
export function inferRiskLevel(intent, taskType) {
  const normalized = String(intent || '').toLowerCase();
  const taskConfig = TASK_TYPES[taskType] || {};

  // 检查高风险关键词
  const highRiskKeywords = ['生产', 'production', '数据库', 'database', '迁移', 'migration',
    '删除', 'delete', '安全', 'security', '认证', 'auth', '支付', 'payment'];

  const isHighRisk = highRiskKeywords.some(k => normalized.includes(k));

  if (isHighRisk) {
    return { level: 'high', reason: '涉及高风险操作' };
  }

  // 使用任务类型的默认风险等级
  return {
    level: taskConfig.riskLevel || 'standard',
    reason: `基于任务类型: ${taskType}`
  };
}

/**
 * 生成保护规则
 */
export function generateGuardRules(taskType, intent) {
  const taskConfig = TASK_TYPES[taskType] || {};
  const rules = [...(taskConfig.guardRules || [])];

  // 根据意图添加额外规则
  const normalized = String(intent || '').toLowerCase();

  if (normalized.includes('数据库') || normalized.includes('migration')) {
    rules.push('备份数据库', '在测试环境验证');
  }

  if (normalized.includes('api') || normalized.includes('接口')) {
    rules.push('保持向后兼容', '更新 API 文档');
  }

  return rules;
}

/**
 * 主函数：解析模糊意图
 */
export function parseRoughIntent(intent, repoContext = {}, options = {}) {
  const { isPro = false } = options;

  // 1. 分类任务
  const classification = classifyTask(intent);

  // 2. 推断路径
  const pathInference = inferPaths(
    intent,
    repoContext.fileTree,
    classification.type,
    { isPro }
  );

  // 3. 推断测试命令
  const testCommand = inferTestCommand(repoContext);

  // 4. 推断风险等级
  const riskInference = inferRiskLevel(intent, classification.type);

  // 5. 生成保护规则
  const guardRules = generateGuardRules(classification.type, intent);

  // 6. 构建结果
  const result = {
    task: intent,
    taskType: classification.type,
    confidence: classification.confidence,

    // 推断的字段
    inferred: {
      allowedPaths: pathInference.paths,
      requiredCommands: [testCommand.command],
      riskLevel: riskInference.level,
      guardRules,
      evidencePath: '.agent-guardrails/evidence/current-task.md'
    },

    // 推断来源说明
    sources: {
      taskType: `关键词匹配 (${(classification.confidence * 100).toFixed(0)}% 置信度)`,
      paths: pathInference.confidence > 0.6 ? '关键词+文件树' : '任务类型默认',
      testCommand: testCommand.source,
      riskLevel: riskInference.reason
    },

    // 建议和替代方案
    suggestions: classification.allMatches || []
  };

  // Pro 功能
  if (isPro) {
    result.pro = {
      // TODO: 语义分析
      // TODO: 团队策略继承
      // TODO: 历史学习
      detailedConfidence: {
        taskType: classification.confidence,
        paths: pathInference.confidence,
        testCommand: testCommand.confidence
      }
    };
  }

  return result;
}

/**
 * 检查是否是 Rough-Intent 模式
 */
export function isRoughIntent(task, flags = {}) {
  // 如果用户只提供了 task，没有提供其他参数，就是 Rough-Intent 模式
  const hasDetailedFlags = Boolean(
    flags['allow-paths'] ||
    flags['required-commands'] ||
    flags['intended-files'] ||
    flags['risk-level'] ||
    flags['evidence-paths']
  );

  if (hasDetailedFlags) {
    return false;
  }

  // 检查是否是模糊意图关键词
  const normalized = String(task || '').toLowerCase().trim();
  const roughPatterns = [
    /rough idea/i,
    /smallest safe/i,
    /smallest change/i,
    /not sure/i,
    /help me move/i,
    /move this project/i,
    /find the smallest/i,
    /start with/i,
    /help me figure/i,
    /未想清楚/,
    /还没想清楚/,
    /先找最小/,
    /最小能改/,
    /帮我推进/,
    /先帮我看看/,
    /粗想法/
  ];

  return roughPatterns.some(p => p.test(normalized));
}

/**
 * 生成用户友好的建议文本
 */
export function generateSuggestionText(parsed, locale = 'en') {
  const isZh = locale === 'zh-CN' || locale === 'zh';

  if (isZh) {
    return {
      title: '为你生成任务契约',
      taskType: `检测到: ${parsed.taskType} 类型任务`,
      paths: `推断的变更范围:\n${parsed.inferred.allowedPaths.map(p => `  ✓ ${p}`).join('\n')}`,
      commands: `推断的测试命令:\n  ✓ ${parsed.inferred.requiredCommands.join(', ')}`,
      risk: `风险等级: ${parsed.inferred.riskLevel}`,
      confidence: `置信度: ${(parsed.confidence * 100).toFixed(0)}%`,
      rules: parsed.inferred.guardRules.length > 0
        ? `保护规则:\n${parsed.inferred.guardRules.map(r => `  ✓ ${r}`).join('\n')}`
        : '',
      confirm: '确认这个契约吗？',
      actions: {
        confirm: '✅ 确认，继续',
        modify: '✏️ 修改范围',
        cancel: '❌ 取消'
      }
    };
  }

  return {
    title: 'Generated Task Contract',
    taskType: `Detected: ${parsed.taskType} task`,
    paths: `Inferred scope:\n${parsed.inferred.allowedPaths.map(p => `  ✓ ${p}`).join('\n')}`,
    commands: `Inferred test commands:\n  ✓ ${parsed.inferred.requiredCommands.join(', ')}`,
    risk: `Risk level: ${parsed.inferred.riskLevel}`,
    confidence: `Confidence: ${(parsed.confidence * 100).toFixed(0)}%`,
    rules: parsed.inferred.guardRules.length > 0
      ? `Guard rules:\n${parsed.inferred.guardRules.map(r => `  ✓ ${r}`).join('\n')}`
      : '',
    confirm: 'Confirm this contract?',
    actions: {
      confirm: '✅ Confirm',
      modify: '✏️ Modify scope',
      cancel: '❌ Cancel'
    }
  };
}
