import fs from "node:fs";
import path from "node:path";

export const FIX_RULES = {
  'evidence-file-missing': {
    tier: 'tier1',
    name: 'Create evidence file',
    description: 'Creates missing evidence directory and file',
    autoApply: true,
    verify: ['exists'],
    check: (repoRoot) => {
      const evidenceDir = path.join(repoRoot, '.agent-guardrails', 'evidence');
      const evidenceFile = path.join(evidenceDir, 'current-task.md');
      return !fs.existsSync(evidenceFile);
    },
    apply: (filePath, repoRoot) => {
      const evidenceDir = path.join(repoRoot, '.agent-guardrails', 'evidence');
      if (!fs.existsSync(evidenceDir)) {
        fs.mkdirSync(evidenceDir, { recursive: true });
      }

      const evidenceFile = path.join(evidenceDir, 'current-task.md');
      const content = `# Current Task Evidence

## Commands Run

## Notable Results

## Residual Risk

## Notes

`;
      fs.writeFileSync(evidenceFile, content);
      return { filePath: path.relative(repoRoot, evidenceFile) };
    }
  },

  'evidence-dir-missing': {
    tier: 'tier1',
    name: 'Create evidence directory',
    description: 'Creates missing evidence directory',
    autoApply: true,
    verify: ['exists'],
    check: (repoRoot) => {
      const evidenceDir = path.join(repoRoot, '.agent-guardrails', 'evidence');
      return !fs.existsSync(evidenceDir);
    },
    apply: (filePath, repoRoot) => {
      const evidenceDir = path.join(repoRoot, '.agent-guardrails', 'evidence');
      fs.mkdirSync(evidenceDir, { recursive: true });
      return { filePath: path.relative(repoRoot, evidenceDir) };
    }
  },

  'test-stub-missing': {
    tier: 'tier1',
    name: 'Create test stub',
    description: 'Creates a test stub file for intended source file',
    autoApply: true,
    verify: ['exists', 'syntax'],
    check: (repoRoot, finding) => {
      if (!finding?.intendedFile) return false;

      const sourceFile = finding.intendedFile;
      if (!sourceFile.includes('/src/')) return false;

      const testFile = sourceFile
        .replace('/src/', '/tests/')
        .replace('.js', '.test.js')
        .replace('.ts', '.test.ts');

      const fullTestPath = path.join(repoRoot, testFile);
      return !fs.existsSync(fullTestPath);
    },
    apply: (filePath, repoRoot, finding) => {
      const sourceFile = finding.intendedFile;
      const testFile = sourceFile
        .replace('/src/', '/tests/')
        .replace('.js', '.test.js')
        .replace('.ts', '.test.ts');

      const fullTestPath = path.join(repoRoot, testFile);
      const testDir = path.dirname(fullTestPath);

      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }

      const sourceName = path.basename(sourceFile, path.extname(sourceFile));
      const isTs = sourceFile.endsWith('.ts');
      const ext = isTs ? 'ts' : 'js';

      const content = isTs
        ? `import { describe, it, expect } from '@jest/globals';
import { ${sourceName} } from '../src/${sourceName}';

describe('${sourceName}', () => {
  it('should be defined', () => {
    expect(${sourceName}).toBeDefined();
  });

  // TODO: Add tests for ${sourceName}
});
`
        : `const { ${sourceName} } = require('../src/${sourceName}');

describe('${sourceName}', () => {
  it('should be defined', () => {
    expect(${sourceName}).toBeDefined();
  });

  // TODO: Add tests for ${sourceName}
});
`;

      fs.writeFileSync(fullTestPath, content);
      return { filePath: path.relative(repoRoot, fullTestPath) };
    }
  },

  'gitignore-missing': {
    tier: 'tier1',
    name: 'Add .gitignore entries',
    description: 'Adds missing .gitignore entries for agent-guardrails',
    autoApply: true,
    verify: ['exists'],
    check: (repoRoot) => {
      const gitignorePath = path.join(repoRoot, '.gitignore');
      if (!fs.existsSync(gitignorePath)) return true;

      const content = fs.readFileSync(gitignorePath, 'utf8');
      return !content.includes('.agent-guardrails/');
    },
    apply: (filePath, repoRoot) => {
      const gitignorePath = path.join(repoRoot, '.gitignore');
      const entries = `
# Agent Guardrails
.agent-guardrals/daemon.log
.agent-guardrails/daemon-info.json
.agent-guardrails/daemon.pid
.agent-guardrails/daemon-result.json
.agent-guardrails/task-contract.json
`;

      if (fs.existsSync(gitignorePath)) {
        fs.appendFileSync(gitignorePath, entries);
      } else {
        fs.writeFileSync(gitignorePath, entries.trim() + '\n');
      }

      return { filePath: '.gitignore' };
    }
  },

  'empty-evidence-update': {
    tier: 'tier1',
    name: 'Update evidence template',
    description: 'Updates evidence file with template sections',
    autoApply: true,
    verify: ['exists'],
    check: (repoRoot) => {
      const evidenceFile = path.join(repoRoot, '.agent-guardrails', 'evidence', 'current-task.md');
      if (!fs.existsSync(evidenceFile)) return false;

      const content = fs.readFileSync(evidenceFile, 'utf8');
      return content.length < 50;
    },
    apply: (filePath, repoRoot) => {
      const evidenceFile = path.join(repoRoot, '.agent-guardrails', 'evidence', 'current-task.md');
      const content = fs.readFileSync(evidenceFile, 'utf8');

      const template = `# Current Task Evidence

## Commands Run

## Notable Results

## Residual Risk

## Notes

${content}
`;

      fs.writeFileSync(evidenceFile, template);
      return { filePath: path.relative(repoRoot, evidenceFile) };
    }
  }
};

export function getFixableIssues(repoRoot, findings) {
  const fixable = [];

  for (const [ruleId, rule] of Object.entries(FIX_RULES)) {
    if (rule.tier !== 'tier1') continue;

    for (const finding of findings || []) {
      try {
        if (rule.check(repoRoot, finding)) {
          fixable.push({
            ruleId,
            ...rule,
            finding,
            filePath: finding.filePath || finding.intendedFile || '.'
          });
        }
      } catch {
        // Skip rules that fail to check
      }
    }

    try {
      if (rule.check(repoRoot)) {
        fixable.push({
          ruleId,
          ...rule,
          filePath: '.'
        });
      }
    } catch {
      // Skip rules that fail to check
    }
  }

  return fixable;
}

export function getSuggestableIssues(repoRoot, findings) {
  const suggestable = [];

  for (const [ruleId, rule] of Object.entries(FIX_RULES)) {
    if (rule.tier !== 'tier2') continue;

    for (const finding of findings || []) {
      try {
        if (rule.check(repoRoot, finding)) {
          suggestable.push({
            ruleId,
            ...rule,
            finding
          });
        }
      } catch {
        // Skip rules that fail to check
      }
    }
  }

  return suggestable;
}
