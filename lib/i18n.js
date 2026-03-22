const resources = {
  en: {
    cli: {
      usage: "Usage:",
      commands: "Commands:",
      supportedPresets: "Supported presets:",
      supportedAdapters: "Supported adapters:",
      supportedLocales: "Supported locales:",
      initSummary: "Seed guardrail files into a repository",
      planSummary: "Print a bounded implementation brief and write a richer task contract by default",
      checkSummary: "Validate scope, consistency, correctness, risk, and production-profile rules for the current change",
      unknownCommand: "Unknown command \"{command}\""
    },
    errors: {
      missingTask: "Pass task text with --task \"...\"",
      missingInitConfig: "Missing .agent-guardrails/config.json. Run `agent-guardrails init . --preset node-service` first.",
      missingCheckConfig: "Missing .agent-guardrails/config.json. Run init first.",
      unknownPreset: "Unknown preset \"{preset}\". Supported presets: {supportedPresets}",
      unknownAdapters: "Unknown adapter(s): {adapters}. Supported adapters: {supportedAdapters}"
    },
    init: {
      initialized: "Initialized guardrails for \"{projectName}\" with preset \"{preset}\".",
      adapters: "Adapters: {adapters}",
      created: "Created:",
      skipped: "Skipped existing files:",
      nextSteps: "Next steps:",
      nextPlan: "- Run `agent-guardrails plan --task \"<task>\" --allow-paths \"src/,tests/\" --intended-files \"src/file.js,tests/file.test.js\" --allowed-change-types \"implementation-only\" --required-commands \"npm test\" --evidence \".agent-guardrails/evidence/current-task.md\"`.",
      nextChange: "- Make the smallest change that fits the task contract.",
      nextEvidence: "- Update `.agent-guardrails/evidence/current-task.md` with commands run, notable results, and residual risk.",
      nextCheck: "- Run `agent-guardrails check --base-ref origin/main --commands-run \"npm test\" --review` before finishing."
    },
    plan: {
      title: "Agent Guardrails Task Brief",
      task: "Task",
      preset: "Preset",
      readBeforeWriting: "Read before writing",
      constraints: "Constraints",
      definitionOfDone: "Definition of done",
      taskContract: "Task contract",
      printOnly: "Print only mode; no contract written.",
      writtenTo: "Written to {contractPath}",
      allowedPath: "Allowed path: {value}",
      intendedFile: "Intended file: {value}",
      protectedPath: "Protected path: {value}",
      allowedChangeType: "Allowed change type: {value}",
      riskLevel: "Risk level: {value}",
      reviewNotesRequiredYes: "Review notes required: yes",
      reviewNotesRequiredNo: "Review notes required: no",
      validationProfile: "Validation profile: {value}",
      requiredCommand: "Required command: {value}",
      evidencePath: "Evidence path: {value}",
      acknowledgedSkip: "Acknowledged skip: {value}",
      implementationShape: "Implementation shape",
      existingPatternSummary: "Existing pattern summary: {value}",
      existingPatternSummaryDefault: "Existing pattern summary: describe the current module pattern before editing",
      smallestViableChange: "Smallest viable change: {value}",
      smallestViableChangeDefault: "Smallest viable change: keep the implementation to the narrowest working slice",
      assumption: "Assumption or unknown: {value}",
      noneDeclared: "{label}: none declared",
      implementationNote: "Implementation note",
      implementationNote1: "List the exact files you plan to touch before editing.",
      implementationNote2: "If the task requires new abstractions, justify why existing patterns are insufficient.",
      implementationNote3: "Keep interface, config, and migration changes explicit instead of folding them into a generic task.",
      implementationNote4: "Stop and surface missing context instead of inventing it.",
      acceptanceAlignment: "Acceptance alignment",
      acceptanceCriteria: "Acceptance criterion: {value}",
      nonGoal: "Non-goal: {value}",
      behaviorChange: "Expected behavior change: {value}",
      userVisibleEffect: "User-visible effect: {value}",
      productionProfile: "Production profile: {value}",
      nfrRequirement: "Non-functional requirement: {value}",
      intendedSymbol: "Intended symbol: {value}",
      expectedPublicSurfaceChange: "Expected public surface change: {value}",
      expectedBoundaryException: "Expected boundary exception: {value}",
      expectedTestTarget: "Expected test target: {value}",
      loadSensitivePath: "Load-sensitive path: {value}",
      expectedConcurrencyImpact: "Expected concurrency impact: {value}",
      observabilityRequirement: "Observability requirement: {value}",
      rollbackNotes: "Rollback notes: {value}",
      riskJustification: "Risk justification: {value}"
    },
    check: {
      title: "Agent Guardrails Check",
      preset: "Preset: {value}",
      diffSource: "Diff source: {value}",
      changedFiles: "Changed files: {value}",
      sourceFiles: "Source files: {value}",
      testFiles: "Test files: {value}",
      topLevelEntries: "Top-level entries touched: {value}",
      changeTypes: "Change types: {value}",
      allowedPaths: "Allowed paths: {value}",
      outOfScopeFiles: "Out of scope files: {value}",
      taskContract: "Task contract: {value}",
      taskAllowedPaths: "Task allowed paths: {value}",
      taskOutOfScopeFiles: "Task out of scope files: {value}",
      intendedFiles: "Intended files: {value}",
      outOfIntendedFiles: "Out of intended files: {value}",
      taskRequiredCommands: "Task required commands: {value}",
      commandsReported: "Commands reported: {value}",
      missingRequiredCommands: "Missing required commands: {value}",
      taskEvidencePaths: "Task evidence paths: {value}",
      missingEvidenceFiles: "Missing evidence files: {value}",
      productionProfile: "Production profile: {value}",
      nfrRequirements: "Non-functional requirements: {value}",
      warnings: "Warnings:",
      failures: "Failures:",
      allPassed: "All baseline guardrail checks passed.",
      reviewSummary: "Review summary:",
      scopeIssues: "Scope issues: {value}",
      validationIssues: "Missing validation: {value}",
      consistencyConcerns: "Consistency concerns: {value}",
      riskConcerns: "High-risk surface changes: {value}",
      scopeGroup: "Scope issues",
      validationGroup: "Missing validation",
      consistencyGroup: "Consistency concerns",
      riskGroup: "High-risk surface changes",
      action: "Action: {value}",
      findingSeverity: "[{severity}] {message}"
    },
    findings: {
      missingRequiredFile: "Required file is missing: {path}",
      diffUnavailable: "Unable to inspect repository diff. {details}",
      noChangesBaseRef: "No git changes detected relative to base ref \"{baseRef}\".",
      noChangesWorkingTree: "No git changes detected. Working-tree checks were skipped.",
      changedFileBudgetExceeded: "Changed file count ({count}) exceeds configured task budget ({budget}).",
      broadTopLevelChange: "Task spans {count} top-level areas ({areas}), which is wider than the recommended review surface ({budget}).",
      repoAllowedPathViolation: "Changed files outside allowed paths: {files}",
      taskPathViolation: "Changed files outside task contract paths: {files}",
      intendedFileViolation: "Changed files outside intended files: {files}",
      taskBreadthSuspicious: "Changed file count ({count}) is much larger than the declared intended file set ({intendedCount}).",
      missingRequiredCommands: "Missing required commands from task contract: {commands}",
      missingEvidenceFiles: "Missing required evidence files: {files}",
      sourceWithoutTests: "Source files changed without any accompanying test changes.",
      taskProtectedPathsTouched: "Task touched review-critical paths: {paths}",
      protectedAreaRiskLevelTooLow: "Protected area touched without sufficient task risk level: {label}",
      protectedAreaTouched: "High-risk area changed: {label}",
      protectedAreaMissingReviewNotes: "High-risk area changed without review-oriented notes in evidence: {label}",
      taskMissingReviewNotes: "Task contract requires review notes, but the evidence files do not include them.",
      changeTypeViolation: "Changed files violate the declared change types ({types}): {files}",
      interfaceChangeWithoutContract: "Interface-like files changed without an explicit allowed change type declaration: {files}",
      configOrMigrationChange: "Config or migration files changed: {files}",
      productionProfileMissingNfr: "Task declares a production profile without any explicit non-functional requirements.",
      criticalPathTouchedWithoutRollback: "Critical path changed without rollback notes: {files}",
      performanceSensitiveAreaTouched: "Performance-sensitive area changed: {files}",
      observabilityRequirementsUnaddressed: "Observability requirements were declared, but the evidence note does not mention them.",
      concurrencyRequirementsUnaddressed: "Concurrency or performance requirements were declared, but the evidence note does not mention validation for them."
    }
  },
  "zh-CN": {
    cli: {
      usage: "用法：",
      commands: "命令：",
      supportedPresets: "支持的 preset：",
      supportedAdapters: "支持的 adapter：",
      supportedLocales: "支持的语言：",
      initSummary: "向仓库写入 guardrail 文件",
      planSummary: "输出受约束的实现简报，并默认写入更丰富的任务契约",
      checkSummary: "校验当前改动的范围、一致性、正确性、风险和生产画像规则",
      unknownCommand: "未知命令 \"{command}\""
    },
    errors: {
      missingTask: "请通过 --task \"...\" 传入任务描述",
      missingInitConfig: "缺少 .agent-guardrails/config.json。请先运行 `agent-guardrails init . --preset node-service`。",
      missingCheckConfig: "缺少 .agent-guardrails/config.json。请先执行 init。",
      unknownPreset: "未知 preset \"{preset}\"。支持的 preset：{supportedPresets}",
      unknownAdapters: "未知 adapter：{adapters}。支持的 adapter：{supportedAdapters}"
    },
    init: {
      initialized: "已为 \"{projectName}\" 使用 preset \"{preset}\" 初始化 guardrails。",
      adapters: "Adapters：{adapters}",
      created: "已创建：",
      skipped: "已跳过现有文件：",
      nextSteps: "下一步：",
      nextPlan: "- 运行 `agent-guardrails plan --task \"<task>\" --allow-paths \"src/,tests/\" --intended-files \"src/file.js,tests/file.test.js\" --allowed-change-types \"implementation-only\" --required-commands \"npm test\" --evidence \".agent-guardrails/evidence/current-task.md\"`。",
      nextChange: "- 只做符合任务契约的最小改动。",
      nextEvidence: "- 更新 `.agent-guardrails/evidence/current-task.md`，写明执行过的命令、关键结果和残余风险。",
      nextCheck: "- 完成前运行 `agent-guardrails check --base-ref origin/main --commands-run \"npm test\" --review`。"
    },
    plan: {
      title: "Agent Guardrails 任务简报",
      task: "任务",
      preset: "Preset",
      readBeforeWriting: "编码前先阅读",
      constraints: "约束",
      definitionOfDone: "完成定义",
      taskContract: "任务契约",
      printOnly: "仅打印模式；未写入任务契约。",
      writtenTo: "已写入 {contractPath}",
      allowedPath: "允许路径：{value}",
      intendedFile: "预期文件：{value}",
      protectedPath: "保护路径：{value}",
      allowedChangeType: "允许的改动类型：{value}",
      riskLevel: "风险级别：{value}",
      reviewNotesRequiredYes: "需要 review 说明：是",
      reviewNotesRequiredNo: "需要 review 说明：否",
      validationProfile: "验证画像：{value}",
      requiredCommand: "必须执行的命令：{value}",
      evidencePath: "证据文件：{value}",
      acknowledgedSkip: "已确认跳过项：{value}",
      implementationShape: "实现形状",
      existingPatternSummary: "现有模式总结：{value}",
      existingPatternSummaryDefault: "现有模式总结：在改代码前先说明当前模块的实现模式",
      smallestViableChange: "最小可行改动：{value}",
      smallestViableChangeDefault: "最小可行改动：把实现收敛到最小工作切片",
      assumption: "假设或未知项：{value}",
      noneDeclared: "{label}：未声明",
      implementationNote: "实现说明",
      implementationNote1: "开始编辑前列出你计划修改的准确文件。",
      implementationNote2: "如果任务确实需要新抽象，说明为什么现有模式不够。",
      implementationNote3: "接口、配置、迁移类改动必须显式声明，不要混进普通实现任务。",
      implementationNote4: "如果上下文不足，要明确提出，不要自行脑补。",
      acceptanceAlignment: "需求与验收对齐",
      acceptanceCriteria: "验收标准：{value}",
      nonGoal: "不在范围内：{value}",
      behaviorChange: "预期行为变化：{value}",
      userVisibleEffect: "用户可见影响：{value}",
      productionProfile: "生产画像：{value}",
      nfrRequirement: "非功能性要求：{value}",
      intendedSymbol: "预期符号：{value}",
      expectedPublicSurfaceChange: "预期公共接口变化：{value}",
      expectedBoundaryException: "预期边界例外：{value}",
      expectedTestTarget: "预期测试目标：{value}",
      loadSensitivePath: "负载敏感路径：{value}",
      expectedConcurrencyImpact: "预期并发影响：{value}",
      observabilityRequirement: "可观测性要求：{value}",
      rollbackNotes: "回滚说明：{value}",
      riskJustification: "风险说明：{value}"
    },
    check: {
      title: "Agent Guardrails 检查结果",
      preset: "Preset：{value}",
      diffSource: "Diff 来源：{value}",
      changedFiles: "变更文件数：{value}",
      sourceFiles: "源码文件数：{value}",
      testFiles: "测试文件数：{value}",
      topLevelEntries: "触及的顶层区域：{value}",
      changeTypes: "改动类型：{value}",
      allowedPaths: "允许路径数：{value}",
      outOfScopeFiles: "越界文件数：{value}",
      taskContract: "任务契约：{value}",
      taskAllowedPaths: "任务允许路径数：{value}",
      taskOutOfScopeFiles: "任务范围外文件数：{value}",
      intendedFiles: "预期文件数：{value}",
      outOfIntendedFiles: "预期外文件数：{value}",
      taskRequiredCommands: "任务要求命令数：{value}",
      commandsReported: "已上报命令数：{value}",
      missingRequiredCommands: "缺失命令数：{value}",
      taskEvidencePaths: "任务证据文件数：{value}",
      missingEvidenceFiles: "缺失证据文件数：{value}",
      productionProfile: "生产画像：{value}",
      nfrRequirements: "非功能性要求：{value}",
      warnings: "警告：",
      failures: "失败项：",
      allPassed: "所有基础 guardrail 检查均已通过。",
      reviewSummary: "Review 摘要：",
      scopeIssues: "范围问题：{value}",
      validationIssues: "验证缺口：{value}",
      consistencyConcerns: "一致性问题：{value}",
      riskConcerns: "高风险变更：{value}",
      scopeGroup: "范围问题",
      validationGroup: "验证缺口",
      consistencyGroup: "一致性问题",
      riskGroup: "高风险变更",
      action: "处理建议：{value}",
      findingSeverity: "[{severity}] {message}"
    },
    findings: {
      missingRequiredFile: "缺少必需文件：{path}",
      diffUnavailable: "无法读取仓库 diff。{details}",
      noChangesBaseRef: "相对于基线 \"{baseRef}\" 没有检测到 git 变更。",
      noChangesWorkingTree: "未检测到 git 变更，已跳过 working-tree 检查。",
      changedFileBudgetExceeded: "变更文件数（{count}）超过了任务预算（{budget}）。",
      broadTopLevelChange: "本次任务跨越了 {count} 个顶层区域（{areas}），已经超出推荐的 review 范围（{budget}）。",
      repoAllowedPathViolation: "存在超出仓库允许路径的变更：{files}",
      taskPathViolation: "存在超出任务契约路径的变更：{files}",
      intendedFileViolation: "存在超出预期文件的变更：{files}",
      taskBreadthSuspicious: "变更文件数（{count}）明显大于声明的预期文件数（{intendedCount}）。",
      missingRequiredCommands: "缺少任务契约要求的命令：{commands}",
      missingEvidenceFiles: "缺少要求的证据文件：{files}",
      sourceWithoutTests: "源码发生了变更，但没有任何配套测试改动。",
      taskProtectedPathsTouched: "任务触及了 review 关键路径：{paths}",
      protectedAreaRiskLevelTooLow: "触及保护区域，但任务风险级别不足：{label}",
      protectedAreaTouched: "触及高风险区域：{label}",
      protectedAreaMissingReviewNotes: "触及高风险区域，但证据中缺少面向 review 的说明：{label}",
      taskMissingReviewNotes: "任务契约要求提供 review 说明，但证据文件中没有体现。",
      changeTypeViolation: "存在违反声明改动类型（{types}）的文件：{files}",
      interfaceChangeWithoutContract: "存在接口类文件变更，但任务没有显式声明改动类型：{files}",
      configOrMigrationChange: "存在配置或迁移类变更：{files}",
      productionProfileMissingNfr: "任务声明了生产画像，但没有任何明确的非功能性要求。",
      criticalPathTouchedWithoutRollback: "触及关键路径，但缺少回滚说明：{files}",
      performanceSensitiveAreaTouched: "触及性能敏感区域：{files}",
      observabilityRequirementsUnaddressed: "任务声明了可观测性要求，但证据中没有体现。",
      concurrencyRequirementsUnaddressed: "任务声明了并发或性能要求，但证据中没有体现相关验证。"
    }
  }
};

export const supportedLocales = ["en", "zh-CN"];

function interpolate(template, vars) {
  return Object.entries(vars || {}).reduce((output, [key, value]) => {
    return output.replaceAll(`{${key}}`, String(value));
  }, template);
}

function normalizeLocale(locale) {
  if (!locale) {
    return null;
  }

  const normalized = String(locale).trim().replaceAll("_", "-");
  const lower = normalized.toLowerCase();

  if (lower === "zh" || lower.startsWith("zh-cn")) {
    return "zh-CN";
  }

  if (lower.startsWith("en")) {
    return "en";
  }

  return null;
}

function getSystemLocale() {
  return (
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    process.env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    "en"
  );
}

export function resolveLocale(explicitLocale = null) {
  return normalizeLocale(
    explicitLocale ||
    process.env.AGENT_GUARDRAILS_LOCALE ||
    getSystemLocale()
  ) ?? "en";
}

export function createTranslator(explicitLocale = null) {
  const locale = resolveLocale(explicitLocale);
  const resource = resources[locale] ?? resources.en;

  function t(key, vars = {}) {
    const value = key.split(".").reduce((current, segment) => current?.[segment], resource);
    if (typeof value === "string") {
      return interpolate(value, vars);
    }

    const fallback = key.split(".").reduce((current, segment) => current?.[segment], resources.en);
    if (typeof fallback === "string") {
      return interpolate(fallback, vars);
    }

    return key;
  }

  return { locale, t };
}
