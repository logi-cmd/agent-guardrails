import { FixRollback, verifyFix } from './validator.js';
import { getFixableIssues, FIX_RULES } from './rules.js';

export class AutoFixEngine {
  constructor(repoRoot, options = {}) {
    this.repoRoot = repoRoot;
    this.options = {
      autoApply: true,
      dryRun: false,
      ...options
    };
    this.rollback = new FixRollback(repoRoot);
    this.results = [];
  }

  async run(checkResult) {
    this.results = [];

    if (!checkResult || checkResult.ok) {
      return {
        applied: [],
        failed: [],
        skipped: []
      };
    }

    const findings = checkResult.findings || [];
    const fixableIssues = getFixableIssues(this.repoRoot, findings);

    const applied = [];
    const failed = [];
    const skipped = [];

    for (const issue of fixableIssues) {
      if (this.options.dryRun) {
        skipped.push({
          ruleId: issue.ruleId,
          name: issue.name,
          description: issue.description,
          reason: 'dry-run'
        });
        continue;
      }

      if (!this.options.autoApply && issue.autoApply) {
        skipped.push({
          ruleId: issue.ruleId,
          name: issue.name,
          description: issue.description,
          reason: 'auto-apply-disabled'
        });
        continue;
      }

      try {
        const result = await this.applyFix(issue);
        if (result.success) {
          applied.push({
            ruleId: issue.ruleId,
            name: issue.name,
            filePath: result.filePath,
            fixType: result.fixType
          });
        } else {
          failed.push({
            ruleId: issue.ruleId,
            name: issue.name,
            reason: result.reason,
            rolledBack: result.rolledBack
          });
        }
      } catch (err) {
        failed.push({
          ruleId: issue.ruleId,
          name: issue.name,
          reason: err.message,
          rolledBack: false
        });
      }
    }

    return { applied, failed, skipped };
  }

  async applyFix(issue) {
    const fix = {
      type: issue.ruleId,
      tier: issue.tier,
      verify: issue.verify,
      filePath: issue.filePath,
      apply: (filePath, repoRoot) => {
        return issue.apply(filePath, repoRoot, issue.finding);
      }
    };

    return await this.rollback.applyFix(fix);
  }

  async rollbackAll() {
    await this.rollback.rollbackAll();
  }

  getResults() {
    return {
      applied: this.results.filter(r => r.success),
      failed: this.results.filter(r => !r.success),
      allFixes: this.rollback.getAppliedFixes()
    };
  }
}

export async function runAutoFix(repoRoot, checkResult, options = {}) {
  const engine = new AutoFixEngine(repoRoot, options);
  return await engine.run(checkResult);
}

export function getFixPreview(repoRoot, checkResult) {
  const findings = checkResult?.findings || [];
  const fixableIssues = getFixableIssues(repoRoot, findings);

  return fixableIssues.map(issue => ({
    ruleId: issue.ruleId,
    name: issue.name,
    description: issue.description,
    tier: issue.tier,
    autoApply: issue.autoApply,
    filePath: issue.filePath
  }));
}
