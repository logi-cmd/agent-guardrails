import { AutoFixEngine, getFixPreview } from '../lib/fix/auto-fix.js';
import { FixRollback } from '../lib/fix/validator.js';
import { getFixableIssues, FIX_RULES } from '../lib/fix/rules.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runTests() {
  console.log('🧪 Auto-Fix Tests\n');

  let passed = 0;
  let failed = 0;

  // Test 1: FixRollback basic functionality
  try {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-test-'));
    const testFile = path.join(testDir, 'test.txt');
    fs.writeFileSync(testFile, 'original content');

    const rollback = new FixRollback(testDir);
    const fix = {
      type: 'test-fix',
      tier: 'tier1',
      verify: [],
      filePath: 'test.txt',
      apply: (fp) => {
        fs.writeFileSync(fp, 'modified content');
      }
    };

    const result = await rollback.applyFix(fix);

    if (!result.success) {
      throw new Error('Fix application failed');
    }

    const content = fs.readFileSync(testFile, 'utf8');
    if (content !== 'modified content') {
      throw new Error('Fix not applied');
    }

    fs.rmSync(testDir, { recursive: true, force: true });

    console.log('✅ testFixRollback passed');
    passed++;
  } catch (err) {
    console.log('❌ testFixRollback failed:', err.message);
    failed++;
  }

  // Test 2: getFixableIssues with missing evidence
  try {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-test-'));

    const findings = [];
    const fixable = getFixableIssues(testDir, findings);

    const hasEvidenceFix = fixable.some(f => f.ruleId === 'evidence-dir-missing');

    if (!hasEvidenceFix) {
      throw new Error('Should detect missing evidence directory');
    }

    fs.rmSync(testDir, { recursive: true, force: true });

    console.log('✅ testGetFixableIssues passed');
    passed++;
  } catch (err) {
    console.log('❌ testGetFixableIssues failed:', err.message);
    failed++;
  }

  // Test 3: FIX_RULES structure
  try {
    for (const [ruleId, rule] of Object.entries(FIX_RULES)) {
      if (!rule.tier) {
        throw new Error(`Rule ${ruleId} missing tier`);
      }
      if (!rule.apply) {
        throw new Error(`Rule ${ruleId} missing apply function`);
      }
      if (!rule.check) {
        throw new Error(`Rule ${ruleId} missing check function`);
      }
    }

    console.log('✅ testFixRulesStructure passed');
    passed++;
  } catch (err) {
    console.log('❌ testFixRulesStructure failed:', err.message);
    failed++;
  }

  // Test 4: AutoFixEngine dry run
  try {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-test-'));

    const engine = new AutoFixEngine(testDir, { dryRun: true });
    const result = await engine.run({ ok: false, findings: [] });

    if (result.applied.length !== 0) {
      throw new Error('Dry run should not apply fixes');
    }

    fs.rmSync(testDir, { recursive: true, force: true });

    console.log('✅ testAutoFixEngineDryRun passed');
    passed++;
  } catch (err) {
    console.log('❌ testAutoFixEngineDryRun failed:', err.message);
    failed++;
  }

  // Test 5: getFixPreview
  try {
    const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-test-'));

    const preview = getFixPreview(testDir, { ok: false, findings: [] });

    if (!Array.isArray(preview)) {
      throw new Error('Preview should be an array');
    }

    fs.rmSync(testDir, { recursive: true, force: true });

    console.log('✅ testGetFixPreview passed');
    passed++;
  } catch (err) {
    console.log('❌ testGetFixPreview failed:', err.message);
    failed++;
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

export async function run() {
  const success = await runTests();
  if (!success) {
    throw new Error("Auto-fix tests failed");
  }
}
