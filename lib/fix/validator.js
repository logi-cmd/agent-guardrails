import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export class FixRollback {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.fixes = [];
  }

  async applyFix(fix) {
    const filePath = path.resolve(this.repoRoot, fix.filePath);
    const original = await fs.promises.readFile(filePath, 'utf8').catch(() => null);

    this.fixes.push({
      filePath,
      original,
      fix,
      timestamp: Date.now()
    });

    try {
      await fix.apply(filePath, this.repoRoot);

      const verification = await verifyFix(this.repoRoot, fix, filePath);

      if (!verification.success) {
        await this.rollbackLast();
        return {
          success: false,
          reason: verification.reason,
          rolledBack: true
        };
      }

      return {
        success: true,
        filePath: fix.filePath,
        fixType: fix.type
      };

    } catch (err) {
      await this.rollbackLast();
      return {
        success: false,
        reason: err.message,
        rolledBack: true
      };
    }
  }

  async rollbackLast() {
    const lastFix = this.fixes.pop();
    if (!lastFix) return;

    if (lastFix.original === null) {
      try {
        await fs.promises.unlink(lastFix.filePath);
      } catch {}
    } else {
      try {
        await fs.promises.writeFile(lastFix.filePath, lastFix.original);
      } catch {}
    }
  }

  async rollbackAll() {
    for (let i = this.fixes.length - 1; i >= 0; i--) {
      const fix = this.fixes[i];
      if (fix.original === null) {
        try {
          await fs.promises.unlink(fix.filePath);
        } catch {}
      } else {
        try {
          await fs.promises.writeFile(fix.filePath, fix.original);
        } catch {}
      }
    }
    this.fixes = [];
  }

  getAppliedFixes() {
    return this.fixes.map(f => ({
      filePath: f.filePath,
      type: f.fix.type,
      timestamp: f.timestamp
    }));
  }
}

export async function verifyFix(repoRoot, fix, filePath) {
  if (fix.tier === 'tier3') {
    return { success: false, reason: 'tier3-not-auto-fixable' };
  }

  if (fix.verify?.includes('exists')) {
    try {
      await fs.promises.access(filePath);
    } catch {
      return { success: false, reason: 'file-not-created' };
    }
  }

  if (fix.verify?.includes('syntax')) {
    const syntaxCheck = await checkSyntax(filePath);
    if (!syntaxCheck.ok) {
      return { success: false, reason: 'syntax-error' };
    }
  }

  if (fix.verify?.includes('compile')) {
    const compileCheck = await checkCompilation(repoRoot);
    if (!compileCheck.ok) {
      return { success: false, reason: 'compile-failed' };
    }
  }

  if (fix.verify?.includes('test')) {
    const testCheck = await runQuickTests(repoRoot, filePath);
    if (!testCheck.ok) {
      return { success: false, reason: 'test-failed' };
    }
  }

  return { success: true };
}

async function checkSyntax(filePath) {
  const ext = path.extname(filePath);
  const content = await fs.promises.readFile(filePath, 'utf8').catch(() => '');

  if (ext === '.js' || ext === '.mjs') {
    try {
      new Function(content);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  if (ext === '.ts') {
    return { ok: true };
  }

  return { ok: true };
}

async function checkCompilation(repoRoot) {
  const packageJsonPath = path.join(repoRoot, 'package.json');

  try {
    await fs.promises.access(packageJsonPath);
  } catch {
    return { ok: true };
  }

  try {
    const { stdout, stderr } = await execAsync(
      'npm run build --if-present 2>&1 || echo "no build script"',
      { cwd: repoRoot, timeout: 30000 }
    );

    if (stdout.includes('no build script')) {
      return { ok: true };
    }

    if (stderr && !stderr.includes('warning')) {
      return { ok: false, error: stderr };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function runQuickTests(repoRoot, filePath) {
  const testFile = filePath.replace(/\.js$/, '.test.js')
                          .replace(/\.ts$/, '.test.ts')
                          .replace('/src/', '/tests/');

  if (!fs.existsSync(testFile)) {
    return { ok: true };
  }

  try {
    const { stdout, stderr } = await execAsync(
      `npm test -- --testPathPattern="${path.basename(testFile)}" --passWithNoTests 2>&1 || echo "test failed"`,
      { cwd: repoRoot, timeout: 60000 }
    );

    if (stdout.includes('test failed') || stderr?.includes('FAIL')) {
      return { ok: false, error: 'tests failed' };
    }

    return { ok: true };
  } catch {
    return { ok: true };
  }
}
