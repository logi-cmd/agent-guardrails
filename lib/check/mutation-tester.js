/**
 * Lightweight mutation tester — zero dependencies.
 *
 * Applies basic source-code mutations to changed files and checks
 * whether the test suite catches them.  Surviving mutations indicate
 * weak or meaningless tests.
 *
 * Supported languages: JavaScript, TypeScript, Python.
 *
 * Mutation operators:
 *   - boolean literal flip      (true → false)
 *   - comparison operator swap  (=== → !==, > → <, >= → <=)
 *   - arithmetic operator swap (+ → -, * → /)
 *   - logical operator swap    (&& → ||)
 *   - return value replacement (return <expr> → return 0 / return None)
 *   - boundary value change   (0 → 1, 1 → 0, "" → "X")
 *
 * Usage:
 *   const result = await runMutationTests({
 *     repoRoot,
 *     changedFiles: ["src/auth.js"],
 *     testCommand: "npm test",
 *     timeoutMs: 30000
 *   });
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Mutation operators
// ---------------------------------------------------------------------------

/** @typedef {{ label: string, mutate: (line: string) => string|null }} MutationOperator */

const BOOLEAN_FLIP = {
  label: "boolean-flip",
  mutate(line) {
    // Avoid flipping inside strings or comments
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) return null;
    if (/["'`]/.test(line) && !/true|false/.test(line.replace(/(["'`])(?:\\.|.)*?\1/g, ""))) return null;
    if (line.includes("true") && !line.includes("true)")) {
      return { mutated: line.replace(/\btrue\b/, "false"), detail: "true → false" };
    }
    if (line.includes("false") && !line.includes("false)")) {
      return { mutated: line.replace(/\bfalse\b/, "true"), detail: "false → true" };
    }
    return null;
  }
};

const COMPARISON_SWAP = {
  label: "comparison-swap",
  mutate(line) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) return null;
    const swaps = [
      [/\b===\b/, "!=="], [/\b!==\b/, "==="],
      [/\b==\b/, "!="], [/\b!=\b/, "=="],
      [/>(?!=)/g, "<"], [/(?<!=)<(?!=)/g, ">"],
      [/\b>=\b/, "<="], [/\b<=\b/, ">="],
    ];
    for (const [pattern, replacement] of swaps) {
      if (pattern.test(line)) {
        return { mutated: line.replace(pattern, replacement), detail: `${pattern} → ${replacement}` };
      }
    }
    return null;
  }
};

const ARITHMETIC_SWAP = {
  label: "arithmetic-swap",
  mutate(line) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) return null;
    // Only swap standalone operators, not inside strings
    const swaps = [
      [/(?<!["'`].*)\+(?!=(?!["'`]|$))/, "-"],
      [/(?<!["'`].*)\-(?!=(?!["'`]|$))/, "+"],
      [/(?<!["'`].*)\*(?=(?!["'`]|$))/, "/"],
    ];
    for (const [pattern, replacement] of swaps) {
      if (pattern.test(line)) {
        return { mutated: line.replace(pattern, replacement), detail: `arithmetic swap` };
      }
    }
    return null;
  }
};

const LOGICAL_SWAP = {
  label: "logical-swap",
  mutate(line) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) return null;
    if (line.includes("&&") && !line.includes("&& ")) {
      return { mutated: line.replace("&&", "||"), detail: "&& → ||" };
    }
    if (line.includes("||") && !line.includes("|| ")) {
      return { mutated: line.replace("||", "&&"), detail: "|| → &&" };
    }
    return null;
  }
};

const RETURN_VALUE_REPLACE = {
  label: "return-value",
  mutate(line) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("#")) return null;
    // Match return statements with a value
    const returnMatch = line.match(/^(\s*return\s+)(.+)$/);
    if (!returnMatch) return null;
    const indent = returnMatch[1];
    const originalValue = returnMatch[2].replace(/;$/, "");
    // Skip if already returning a simple literal
    if (/^(0|1|true|false|null|undefined|None|""|''|`\s*$)/.test(originalValue.trim())) return null;
    return { mutated: `${indent}0;`, detail: `return ${originalValue} → return 0` };
  }
};

const BOUNDARY_CHANGE = {
  label: "boundary-change",
  mutate(line) {
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) return null;
    // Change 0 to 1 and vice versa in comparisons
    if (/\b===?\s*0\b/.test(line)) {
      return { mutated: line.replace(/(\b===?\s*)0\b/, "$11"), detail: "0 → 1 in comparison" };
    }
    if (/\b===?\s*1\b/.test(line)) {
      return { mutated: line.replace(/(\b===?\s*)1\b/, "$10"), detail: "1 → 0 in comparison" };
    }
    if (/\.length\s*===?\s*0/.test(line)) {
      return { mutated: line.replace(/(\.length\s*===?\s*)0/, "$11"), detail: "length === 0 → length === 1" };
    }
    return null;
  }
};

const ALL_OPERATORS = [BOOLEAN_FLIP, COMPARISON_SWAP, ARITHMETIC_SWAP, LOGICAL_SWAP, RETURN_VALUE_REPLACE, BOUNDARY_CHANGE];

// ---------------------------------------------------------------------------
// Language detection
// ---------------------------------------------------------------------------

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx"].includes(ext)) return "javascript";
  if (ext === ".py") return "python";
  return null;
}

function isCommentLine(line, lang) {
  const trimmed = line.trimStart();
  if (lang === "python") return trimmed.startsWith("#");
  return trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");
}

function isSourceLine(line, lang) {
  if (!line.trim()) return false;
  return !isCommentLine(line, lang);
}

// ---------------------------------------------------------------------------
// Core mutation logic
// ---------------------------------------------------------------------------

/**
 * Generate mutations for a single source file.
 * Returns an array of { filePath, lineNumber, original, mutated, operator, detail }.
 */
function generateMutationsForFile(filePath, content) {
  const lang = detectLanguage(filePath);
  if (!lang) return [];

  const lines = content.split(/\r?\n/);
  const mutations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!isSourceLine(line, lang)) continue;

    for (const op of ALL_OPERATORS) {
      const result = op.mutate(line);
      if (result && result.mutated !== line) {
        mutations.push({
          filePath,
          lineNumber: i + 1,
          original: line,
          mutated: result.mutated,
          operator: op.label,
          detail: result.detail
        });
      }
    }
  }

  return mutations;
}

/**
 * Run a single mutation test:
 * 1. Write the mutated file
 * 2. Run the test command
 * 3. Restore the original file
 * Returns { mutation, killed: boolean, output: string }
 */
function runSingleMutation(repoRoot, mutation, testCommand, timeoutMs) {
  const absolutePath = path.join(repoRoot, mutation.filePath);
  let originalContent;
  try {
    originalContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return { mutation, killed: false, output: "Could not read file", error: true };
  }

  // Apply mutation
  const lines = originalContent.split(/\r?\n/);
  lines[mutation.lineNumber - 1] = mutation.mutated;
  const mutatedContent = lines.join("\n");

  try {
    fs.writeFileSync(absolutePath, mutatedContent, "utf-8");

    let killed = false;
    let output = "";
    try {
      const result = execSync(testCommand, {
        cwd: repoRoot,
        timeout: timeoutMs,
        encoding: "utf-8",
        stdio: "pipe"
      });
      output = result.slice(0, 500);
      // If tests pass → mutation survived (not killed)
      killed = false;
    } catch (err) {
      // If tests fail → mutation was killed (good)
      killed = true;
      output = (err.stderr || err.message || "").slice(0, 500);
    }

    return { mutation, killed, output };
  } finally {
    // Always restore original
    try {
      fs.writeFileSync(absolutePath, originalContent, "utf-8");
    } catch {
      // Best effort restore
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run mutation testing on changed source files.
 *
 * @param {{ repoRoot: string, changedFiles: string[], testCommand: string, timeoutMs?: number, maxMutations?: number }} options
 * @returns {Promise<{ total: number, killed: number, survived: number, mutations: Array, score: number }>}
 */
export async function runMutationTests({ repoRoot, changedFiles, testCommand, timeoutMs = 15000, maxMutations = 50 }) {
  const sourceFiles = changedFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"].includes(ext);
  });

  // Generate all mutations
  const allMutations = [];
  for (const relPath of sourceFiles) {
    const absolutePath = path.join(repoRoot, relPath);
    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      const fileMutations = generateMutationsForFile(relPath, content);
      allMutations.push(...fileMutations);
    } catch {
      // Skip unreadable files
    }
  }

  // Cap mutations to avoid long-running tests
  const capped = allMutations.slice(0, maxMutations);

  let baselineOk = true;
  let baselineOutput = "";
  try {
    const baselineResult = execSync(testCommand, {
      cwd: repoRoot,
      timeout: timeoutMs,
      encoding: "utf-8",
      stdio: "pipe"
    });
    baselineOutput = String(baselineResult || "").slice(0, 500);
  } catch (err) {
    baselineOk = false;
    baselineOutput = String(err?.stderr || err?.message || "").slice(0, 500);
  }

  if (!baselineOk) {
    return {
      total: 0,
      killed: 0,
      survived: 0,
      errors: 1,
      score: null,
      baselineOk: false,
      baselineOutput,
      mutations: []
    };
  }

  // Run each mutation
  const results = [];
  for (const mutation of capped) {
    const result = runSingleMutation(repoRoot, mutation, testCommand, timeoutMs);
    results.push(result);
  }

  const killed = results.filter((r) => r.killed).length;
  const survived = results.filter((r) => !r.killed && !r.error).length;
  const errors = results.filter((r) => r.error).length;
  const total = results.length;
  const score = total > 0 ? Math.round((killed / total) * 100) : 100;

  return {
    total,
    killed,
    survived,
    errors,
    score,
    baselineOk: true,
    baselineOutput,
    mutations: results.map((r) => ({
      file: r.mutation.filePath,
      line: r.mutation.lineNumber,
      operator: r.mutation.operator,
      detail: r.mutation.detail,
      original: r.mutation.original.trim(),
      mutated: r.mutation.mutated.trim(),
      killed: r.killed,
      ...(r.error ? { error: true } : {})
    }))
  };
}

/**
 * Generate mutations for a file without running tests.
 * Useful for preview / dry-run.
 */
export function previewMutations(repoRoot, changedFiles) {
  const sourceFiles = changedFiles.filter((f) => {
    const ext = path.extname(f).toLowerCase();
    return [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py"].includes(ext);
  });

  const allMutations = [];
  for (const relPath of sourceFiles) {
    const absolutePath = path.join(repoRoot, relPath);
    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      const fileMutations = generateMutationsForFile(relPath, content);
      allMutations.push(...fileMutations);
    } catch {
      // Skip
    }
  }

  return {
    totalMutations: allMutations.length,
    files: sourceFiles.length,
    mutations: allMutations.map((m) => ({
      file: m.filePath,
      line: m.lineNumber,
      operator: m.operator,
      detail: m.detail,
      original: m.original.trim(),
      mutated: m.mutated.trim()
    }))
  };
}
