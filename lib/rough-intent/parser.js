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
 * - 仓库结构分析（框架检测、目录映射）
 *
 * Pro 功能:
 * - 语义分析推断
 * - 团队策略继承
 * - 历史学习
 * - 置信度详情
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

// 复合关键词模式（多关键词 → 多任务类型）
const COMPOUND_PATTERNS = [
  { keywords: ['登录', '页面'], types: ['ui', 'auth'], score: 3 },
  { keywords: ['接口', '性能'], types: ['api', 'performance'], score: 3 },
  { keywords: ['auth', 'page'], types: ['ui', 'auth'], score: 3 },
  { keywords: ['api', 'performance'], types: ['api', 'performance'], score: 3 },
  { keywords: ['数据库', '迁移'], types: ['database', 'config'], score: 3 },
  { keywords: ['database', 'migration'], types: ['database', 'config'], score: 3 },
];

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
  },
  deploy: {
    keywords: ['部署', 'deploy', 'release', '发布', '上线', 'ship'],
    suggestedPaths: ['Dockerfile', 'docker-compose.yml', '.github/workflows/', 'deploy/', 'k8s/'],
    riskLevel: 'high',
    guardRules: ['不要直接部署到生产环境', '先在测试环境验证', '保留回滚方案']
  },
  security: {
    keywords: ['安全', 'security', '漏洞', 'vulnerability', 'xss', 'csrf', '注入', 'injection'],
    suggestedPaths: ['src/middleware/', 'src/security/', 'src/auth/'],
    riskLevel: 'high',
    guardRules: ['不要降低安全等级', '添加安全测试', '记录安全变更']
  },
  database: {
    keywords: ['数据库', 'database', 'sql', 'migration', '迁移', '表结构', 'schema'],
    suggestedPaths: ['src/models/', 'migrations/', 'prisma/', 'db/'],
    riskLevel: 'high',
    guardRules: ['备份数据库', '在测试环境验证迁移', '不删除现有数据']
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
 * Analyze actual repo layout to detect framework and directory structure.
 * Reads max 2 levels deep for performance. Uses sync fs operations.
 * @param {string} repoRoot - Absolute path to repo root
 * @returns {{ framework: string, srcDir: string, testDir: string, modulePaths: string[], entryPoints: string[], testCommand: string, confidence: number }}
 */
export function analyzeRepoStructure(repoRoot) {
  if (!repoRoot || !existsSync(repoRoot)) {
    return { framework: 'unknown', srcDir: '', testDir: '', modulePaths: [], entryPoints: [], testCommand: '', confidence: 0 };
  }

  const topDirs = safeReaddir(repoRoot).filter(d => isDir(join(repoRoot, d)));
  const topFiles = safeReaddir(repoRoot).filter(d => isFile(join(repoRoot, d)));

  const pkgJson = tryReadJson(join(repoRoot, 'package.json'));
  const pyprojectToml = tryReadText(join(repoRoot, 'pyproject.toml'));
  const requirementsTxt = tryReadText(join(repoRoot, 'requirements.txt'));

  let framework = 'unknown';
  let srcDir = '';
  let testDir = '';
  const modulePaths = [];
  const entryPoints = [];
  let testCommand = '';
  let confidence = 0;

  if (pkgJson) {
    const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
    const scripts = pkgJson.scripts || {};

    if (deps['next']) {
      framework = 'nextjs';
      srcDir = topDirs.includes('src') ? 'src/' : '';
      testDir = detectTestDir(topDirs);
      modulePaths.push(
        srcDir ? 'src/app/' : 'app/',
        srcDir ? 'src/components/' : 'components/',
        srcDir ? 'src/lib/' : 'lib/'
      );
      entryPoints.push(srcDir ? 'src/app/page.tsx' : 'app/page.tsx');
      testCommand = scripts.test ? 'npm test' : '';
      confidence = 0.9;
    } else if (deps['express'] || deps['fastify'] || deps['koa']) {
      framework = 'express';
      srcDir = topDirs.includes('src') ? 'src/' : '';
      testDir = detectTestDir(topDirs);
      modulePaths.push(
        srcDir ? 'src/routes/' : 'routes/',
        srcDir ? 'src/middleware/' : 'middleware/',
        srcDir ? 'src/controllers/' : 'controllers/',
        srcDir ? 'src/services/' : 'services/'
      );
      entryPoints.push(srcDir ? 'src/index.ts' : 'index.ts', srcDir ? 'src/app.ts' : 'app.ts');
      testCommand = scripts.test ? 'npm test' : '';
      confidence = 0.85;
    } else if (topDirs.includes('packages') || topDirs.includes('apps')) {
      framework = 'monorepo';
      srcDir = '';
      testDir = detectTestDir(topDirs);
      const workspaces = [];
      for (const wsDir of ['packages', 'apps']) {
        if (topDirs.includes(wsDir)) {
          const subPkgs = safeReaddir(join(repoRoot, wsDir));
          for (const sp of subPkgs) {
            if (isDir(join(repoRoot, wsDir, sp))) {
              workspaces.push(`${wsDir}/${sp}/`);
            }
          }
        }
      }
      modulePaths.push(...workspaces);
      testCommand = scripts.test ? 'npm test' : '';
      confidence = 0.8;
    } else {
      framework = 'node';
      srcDir = topDirs.includes('src') ? 'src/' : (topDirs.includes('lib') ? 'lib/' : '');
      testDir = detectTestDir(topDirs);
      if (srcDir) modulePaths.push(srcDir);
      entryPoints.push(srcDir ? srcDir + 'index.ts' : 'index.ts');
      testCommand = scripts.test ? 'npm test' : '';
      confidence = 0.6;
    }
  } else if (pyprojectToml || requirementsTxt) {
    const pyContent = (pyprojectToml || '') + '\n' + (requirementsTxt || '');

    if (pyContent.includes('fastapi')) {
      framework = 'fastapi';
      srcDir = topDirs.includes('app') ? 'app/' : '';
      testDir = detectTestDir(topDirs);
      modulePaths.push(
        srcDir ? 'app/routers/' : 'routers/',
        srcDir ? 'app/models/' : 'models/',
        srcDir ? 'app/schemas/' : 'schemas/',
        srcDir ? 'app/services/' : 'services/'
      );
      entryPoints.push(srcDir ? 'app/main.py' : 'main.py');
      testCommand = 'pytest';
      confidence = 0.85;
    } else if (topFiles.includes('manage.py') || pyContent.includes('django')) {
      framework = 'django';
      srcDir = '';
      testDir = detectTestDir(topDirs);
      for (const d of topDirs) {
        const subPath = join(repoRoot, d);
        if (isDir(subPath) && existsSync(join(subPath, 'models.py'))) {
          modulePaths.push(d + '/');
        }
      }
      entryPoints.push('manage.py');
      testCommand = 'python manage.py test';
      confidence = 0.85;
    } else {
      framework = 'python';
      srcDir = topDirs.includes('app') ? 'app/' : (topDirs.includes('src') ? 'src/' : '');
      testDir = detectTestDir(topDirs);
      if (srcDir) modulePaths.push(srcDir);
      testCommand = 'pytest';
      confidence = 0.6;
    }
  } else {
    if (topDirs.includes('src')) {
      framework = 'unknown';
      srcDir = 'src/';
      testDir = detectTestDir(topDirs);
      modulePaths.push('src/');
      confidence = 0.3;
    } else {
      framework = 'unknown';
      testDir = detectTestDir(topDirs);
      confidence = 0.1;
    }
  }

  return { framework, srcDir, testDir, modulePaths, entryPoints, testCommand, confidence };
}

function safeReaddir(dirPath) {
  try {
    return readdirSync(dirPath);
  } catch {
    return [];
  }
}

function isDir(p) {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

function isFile(p) {
  try { return statSync(p).isFile(); } catch { return false; }
}

function tryReadJson(filePath) {
  try { return JSON.parse(readFileSync(filePath, 'utf8')); } catch { return null; }
}

function tryReadText(filePath) {
  try { return readFileSync(filePath, 'utf8'); } catch { return ''; }
}

function detectTestDir(topDirs) {
  for (const candidate of ['tests', 'test', '__tests__', 'spec']) {
    if (topDirs.includes(candidate)) return candidate + '/';
  }
  return '';
}

/**
 * 分析用户意图，返回任务类型和置信度
 */
export function classifyTask(intent) {
  const normalized = String(intent || '').toLowerCase().trim();

  if (!normalized) {
    return { type: 'general', confidence: 0 };
  }

  const scores = {};

  for (const [type, config] of Object.entries(TASK_TYPES)) {
    let score = 0;

    for (const keyword of config.keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        score += normalized === keyword.toLowerCase() ? 3 : 1;
      }
    }

    if (score > 0) {
      scores[type] = score;
    }
  }

  for (const pattern of COMPOUND_PATTERNS) {
    if (pattern.keywords.every(kw => normalized.includes(kw.toLowerCase()))) {
      for (const t of pattern.types) {
        scores[t] = (scores[t] || 0) + pattern.score;
      }
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
  const { isPro = false, repoRoot } = options;
  const suggestions = new Set();
  const taskConfig = TASK_TYPES[taskType] || TASK_TYPES.feature;

  for (const path of taskConfig.suggestedPaths) {
    suggestions.add(path);
  }

  const keywords = extractKeywords(intent);

  if (fileTree && fileTree.length > 0) {
    for (const filePath of fileTree) {
      const normalized = filePath.toLowerCase();

      for (const keyword of keywords) {
        if (normalized.includes(keyword.toLowerCase())) {
          const dir = filePath.substring(0, filePath.lastIndexOf('/'));
          if (dir) {
            suggestions.add(dir + '/');
          }
          suggestions.add(filePath);
        }
      }
    }
  }

  const repoStructure = repoRoot ? analyzeRepoStructure(repoRoot) : null;
  if (repoStructure && repoStructure.confidence > 0) {
    const fw = repoStructure.framework;

    const frameworkPaths = FRAMEWORK_TASK_PATHS[taskType];
    if (frameworkPaths) {
      const paths = frameworkPaths[fw] || frameworkPaths['node'] || [];
      for (const p of paths) {
        const resolved = repoStructure.srcDir && !p.startsWith(repoStructure.srcDir) && fw !== 'monorepo'
          ? repoStructure.srcDir + p
          : p;
        suggestions.add(resolved);
      }
    }

    for (const mp of repoStructure.modulePaths) {
      if (fileTree && fileTree.length > 0 && fileTree.some(f => f.startsWith(mp))) {
        suggestions.add(mp);
      }
    }
  }

  if (isPro) {
    // TODO: 使用 AST 分析依赖关系
    // TODO: 分析 import 语句
  }

  const filtered = [...suggestions].filter(p => p && !p.startsWith('node_modules') && !p.startsWith('.git'));

  if (fileTree && fileTree.length > 0) {
    const validated = filtered.filter(p => {
      const trimmed = p.replace(/\/$/, '');
      return fileTree.some(f => f === trimmed || f === p || f.startsWith(p) || f.startsWith(trimmed + '/'));
    });
    if (validated.length > 0) {
      return { paths: validated, confidence: repoStructure ? 0.85 : 0.7 };
    }
  }

  return {
    paths: filtered,
    confidence: keywords.length > 0 ? (repoStructure ? 0.8 : 0.7) : (repoStructure ? 0.6 : 0.4)
  };
}

const FRAMEWORK_TASK_PATHS = {
  auth: {
    express: ['middleware/', 'routes/auth.', 'services/user.', 'controllers/auth.'],
    nextjs: ['app/api/auth/', 'middleware.ts', 'lib/auth.'],
    fastapi: ['routers/auth.', 'services/auth.', 'models/user.'],
    django: ['views.py', 'urls.py'],
  },
  api: {
    express: ['routes/', 'controllers/', 'services/'],
    nextjs: ['app/api/', 'lib/api/'],
    fastapi: ['routers/', 'schemas/', 'services/'],
    django: ['views.py', 'urls.py', 'serializers.py'],
  },
  ui: {
    express: [],
    nextjs: ['app/', 'components/', 'styles/'],
    fastapi: ['templates/', 'static/'],
    django: ['templates/', 'static/'],
    node: ['components/', 'pages/', 'styles/'],
  },
  database: {
    express: ['models/', 'db/', 'migrations/'],
    nextjs: ['lib/db.', 'prisma/'],
    fastapi: ['models/', 'alembic/'],
    django: ['models.py', 'migrations/'],
    node: ['models/', 'db/', 'migrations/'],
  },
  test: {
    express: ['__tests__/', 'tests/', 'test/'],
    nextjs: ['__tests__/', '.test.', '.spec.'],
    fastapi: ['tests/', 'test_'],
    django: ['tests.py', 'tests/'],
  },
};

/**
 * 推断测试命令
 */
export function inferTestCommand(repoContext, options = {}) {
  const { packageJson, files } = repoContext;
  const { repoRoot } = options;

  if (repoRoot) {
    const structure = analyzeRepoStructure(repoRoot);
    if (structure.testCommand && structure.confidence >= 0.6) {
      return {
        command: structure.testCommand,
        source: `repo-structure (${structure.framework})`,
        confidence: Math.min(0.95, structure.confidence + 0.1)
      };
    }
  }

  if (packageJson?.scripts?.test) {
    return {
      command: 'npm test',
      source: 'package.json',
      confidence: 0.95
    };
  }

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
  const { isPro = false, repoRoot } = options;

  const classification = classifyTask(intent);

  const pathInference = inferPaths(
    intent,
    repoContext.fileTree,
    classification.type,
    { isPro, repoRoot }
  );

  const testCommand = inferTestCommand(repoContext, { repoRoot });

  const riskInference = inferRiskLevel(intent, classification.type);

  const guardRules = generateGuardRules(classification.type, intent);

  const result = {
    task: intent,
    taskType: classification.type,
    confidence: classification.confidence,

    inferred: {
      allowedPaths: pathInference.paths,
      requiredCommands: [testCommand.command],
      riskLevel: riskInference.level,
      guardRules,
      evidencePath: '.agent-guardrails/evidence/current-task.md'
    },

    sources: {
      taskType: `关键词匹配 (${(classification.confidence * 100).toFixed(0)}% 置信度)`,
      paths: pathInference.confidence > 0.6 ? (repoRoot ? '框架+关键词+文件树' : '关键词+文件树') : '任务类型默认',
      testCommand: testCommand.source,
      riskLevel: riskInference.reason
    },

    suggestions: classification.allMatches || []
  };

  if (isPro) {
    result.pro = {
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
