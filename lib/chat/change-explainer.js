// Change explainer module for agent-guardrails
// Provides human-readable explanations of changes based on real git diff analysis
// Includes lightweight archaeology note for quick traceability

import { execFileSync } from "node:child_process";
import { createTranslator } from "../i18n.js";

// ---------------------------------------------------------------------------
// Internal: locale helper
// ---------------------------------------------------------------------------

function isZh(locale) {
  if (!locale) return false;
  const lower = String(locale).toLowerCase();
  return lower === "zh-cn" || lower === "zh" || lower.startsWith("zh");
}

// ---------------------------------------------------------------------------
// 1. readGitDiffSummary — reads per-file diff stats from git
// ---------------------------------------------------------------------------

/**
 * @param {string} repoRoot - Absolute path to the git repository root
 * @param {string} [baseRef="HEAD"] - Git ref to diff against
 * @returns {Array<{path:string, additions:number, deletions:number, changeType:string, binary:boolean}>}
 */
export function readGitDiffSummary(repoRoot, baseRef = "HEAD") {
  if (!repoRoot) return [];

  const results = [];

  let numstatOutput = "";
  try {
    const ref = baseRef || "HEAD";
    if (ref === "HEAD" || ref === "WORKING_TREE") {
      numstatOutput = execFileSync(
        "git",
        ["diff", "--numstat", "HEAD"],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
      );
    } else {
      numstatOutput = execFileSync(
        "git",
        ["diff", "--numstat", `${ref}...HEAD`],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
      );
    }
  } catch {
    return [];
  }

  const numstatLines = numstatOutput.split(/\r?\n/).filter(Boolean);
  const statsMap = new Map();

  for (const line of numstatLines) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const [addStr, delStr, filePath] = parts;
    const binary = addStr === "-" && delStr === "-";
    statsMap.set(filePath, {
      additions: binary ? 0 : parseInt(addStr, 10) || 0,
      deletions: binary ? 0 : parseInt(delStr, 10) || 0,
      binary
    });
  }

  let nameStatusOutput = "";
  try {
    const ref = baseRef || "HEAD";
    if (ref === "HEAD" || ref === "WORKING_TREE") {
      nameStatusOutput = execFileSync(
        "git",
        ["diff", "--name-status", "HEAD"],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
      );
    } else {
      nameStatusOutput = execFileSync(
        "git",
        ["diff", "--name-status", `${ref}...HEAD`],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
      );
    }
  } catch {
    for (const [filePath, stat] of statsMap) {
      results.push({
        path: filePath,
        additions: stat.additions,
        deletions: stat.deletions,
        changeType: "M",
        binary: stat.binary
      });
    }
    return results;
  }

  const nameStatusLines = nameStatusOutput.split(/\r?\n/).filter(Boolean);

  for (const line of nameStatusLines) {
    const match = line.match(/^([AMDRC]\d*)\t+(.+)$/);
    if (!match) continue;

    let changeType = match[1].charAt(0);
    const rawPath = match[2].trim();

    let filePath = rawPath;
    if (changeType === "R") {
      const renameParts = rawPath.split("\t");
      filePath = renameParts.length > 1 ? renameParts[renameParts.length - 1] : rawPath;
    }

    const stat = statsMap.get(filePath) || { additions: 0, deletions: 0, binary: false };
    results.push({
      path: filePath,
      additions: stat.additions,
      deletions: stat.deletions,
      changeType,
      binary: stat.binary
    });
  }

  // Include numstat files not in name-status
  const coveredPaths = new Set(results.map((r) => r.path));
  for (const [filePath, stat] of statsMap) {
    if (!coveredPaths.has(filePath)) {
      results.push({
        path: filePath,
        additions: stat.additions,
        deletions: stat.deletions,
        changeType: "M",
        binary: stat.binary
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. readDiffHunks — reads actual diff content for a file
// ---------------------------------------------------------------------------

function readDiffHunks(repoRoot, filePath, baseRef = "HEAD", maxHunks = 5) {
  if (!repoRoot) return [];

  let output = "";
  try {
    const ref = baseRef || "HEAD";
    if (ref === "HEAD" || ref === "WORKING_TREE") {
      output = execFileSync(
        "git",
        ["diff", "HEAD", "--", filePath],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
      );
    } else {
      output = execFileSync(
        "git",
        ["diff", `${ref}...HEAD`, "--", filePath],
        { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 10000 }
      );
    }
  } catch {
    return [];
  }

  const hunkPattern = /^@@ .* @@/gm;
  const hunkStarts = [];
  let match;
  while ((match = hunkPattern.exec(output)) !== null) {
    hunkStarts.push(match.index);
  }

  if (hunkStarts.length === 0) return [];

  const hunks = [];
  for (let i = 0; i < Math.min(hunkStarts.length, maxHunks); i++) {
    const start = hunkStarts[i];
    const end = i + 1 < hunkStarts.length ? hunkStarts[i + 1] : output.length;
    hunks.push(output.slice(start, end));
  }

  return hunks;
}

// ---------------------------------------------------------------------------
// 3. analyzeDiffHunk — classifies the nature of a diff hunk
// ---------------------------------------------------------------------------

/** @typedef {{"changeNature": string, "summary": string}} HunkAnalysis */

const TEST_PATH_PATTERNS = [
  /(^|\/)(test|tests|spec|specs|__tests__|__test__)\//i,
  /\.(test|spec)\.[^.]+$/i
];

const CONFIG_EXTENSIONS = [
  ".json", ".yaml", ".yml", ".toml", ".ini", ".env", ".conf"
];

const STYLE_EXTENSIONS = [
  ".css", ".scss", ".sass", ".less", ".styl", ".styled."
];

const DOC_EXTENSIONS = [".md", ".txt", ".rst", ".adoc"];

/**
 * @param {string} hunk - A git diff hunk string
 * @param {string} filePath - File path for context
 * @param {string} [locale="en"] - Locale for summary
 * @returns {HunkAnalysis}
 */
export function analyzeDiffHunk(hunk, filePath, locale = "en") {
  const zh = isZh(locale);
  const lines = hunk.split(/\r?\n/);
  const addedLines = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  const removedLines = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
  const allAdded = addedLines.join("\n");
  const allRemoved = removedLines.join("\n");
  const normalizedPath = String(filePath || "").replaceAll("\\", "/").toLowerCase();

  // Check if file is a test file
  const isTestFile = TEST_PATH_PATTERNS.some((p) => p.test(normalizedPath));

  // Check if file is a config file
  const isConfigFile = CONFIG_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));

  // Check if file is a style file
  const isStyleFile = STYLE_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));

  // Check if file is documentation
  const isDocFile = DOC_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));

  // --- Config changes ---
  if (isConfigFile) {
    return {
      changeNature: "config-changed",
      summary: zh
        ? `配置文件 ${filePath} 已修改`
        : `Configuration file ${filePath} modified`
    };
  }

  // --- Style changes ---
  if (isStyleFile) {
    return {
      changeNature: "style-change",
      summary: zh
        ? `样式文件 ${filePath} 已修改`
        : `Style file ${filePath} modified`
    };
  }

  // --- Documentation ---
  if (isDocFile) {
    return {
      changeNature: "documentation",
      summary: zh
        ? `文档 ${filePath} 已更新`
        : `Documentation ${filePath} updated`
    };
  }

  // --- Import/require patterns ---
  const importAdded = /(?:^|\n)[+]\s*(?:import\s|from\s|require\s*\()/.test(allAdded);
  const importRemoved = /(?:^|\n)[-]\s*(?:import\s|from\s|require\s*\()/.test(allRemoved);

  if (importAdded && !importRemoved) {
    if (isTestFile) {
      return {
        changeNature: "test-modified",
        summary: zh
          ? `测试文件 ${filePath} 新增了导入`
          : `Test file ${filePath} added imports`
      };
    }
    return {
      changeNature: "import-added",
      summary: zh
        ? `${filePath} 新增了依赖导入`
        : `${filePath} added import dependencies`
    };
  }
  if (importRemoved && !importAdded) {
    return {
      changeNature: "import-removed",
      summary: zh
        ? `${filePath} 移除了导入依赖`
        : `${filePath} removed import dependencies`
    };
  }

  // --- Function/class/export patterns ---
  const funcAdded = /(?:^|\n)[+]\s*(?:export\s+(?:default\s+)?(?:async\s+)?function|function\s+\w+|(?:export\s+)?(?:async\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+|def\s+\w+|public\s+(?:static\s+)?(?:async\s+)?\w+\s*\()/.test(allAdded);
  const funcRemoved = /(?:^|\n)[-]\s*(?:export\s+(?:default\s+)?(?:async\s+)?function|function\s+\w+|(?:export\s+)?(?:async\s+)?(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?\(|class\s+\w+|def\s+\w+|public\s+(?:static\s+)?(?:async\s+)?\w+\s*\()/.test(allRemoved);
  const exportAdded = /(?:^|\n)[+]\s*export\s/.test(allAdded);

  if (funcAdded && !funcRemoved) {
    if (isTestFile) {
      return {
        changeNature: "test-added",
        summary: zh
          ? `测试文件 ${filePath} 新增了测试用例`
          : `Test file ${filePath} added new test cases`
      };
    }
    return {
      changeNature: "function-added",
      summary: zh
        ? `${filePath} 新增了函数或类定义`
        : `${filePath} added new function or class definition`
    };
  }

  if (funcRemoved && !funcAdded) {
    return {
      changeNature: "function-deleted",
      summary: zh
        ? `${filePath} 删除了函数或类定义`
        : `${filePath} removed function or class definition`
    };
  }

  if (funcAdded && funcRemoved) {
    if (isTestFile) {
      return {
        changeNature: "test-modified",
        summary: zh
          ? `测试文件 ${filePath} 修改了测试用例`
          : `Test file ${filePath} modified test cases`
      };
    }
    return {
      changeNature: "function-modified",
      summary: zh
        ? `${filePath} 修改了函数或类`
        : `${filePath} modified function or class`
    };
  }

  // --- Test modifications (no function pattern but test file path) ---
  if (isTestFile && addedLines.length > 0) {
    return {
      changeNature: "test-modified",
      summary: zh
        ? `测试文件 ${filePath} 已修改`
        : `Test file ${filePath} modified`
    };
  }

  // --- Export surface change ---
  if (exportAdded) {
    return {
      changeNature: "function-modified",
      summary: zh
        ? `${filePath} 新增了导出`
        : `${filePath} added new exports`
    };
  }

  // --- Fallback: if there are added/removed lines but no pattern matched ---
  if (addedLines.length > 0 || removedLines.length > 0) {
    if (isTestFile) {
      return {
        changeNature: "test-modified",
        summary: zh
          ? `测试文件 ${filePath} 已修改`
          : `Test file ${filePath} modified`
      };
    }
    return {
      changeNature: "unknown",
      summary: zh
        ? `${filePath} 有代码变更`
        : `${filePath} has code changes`
    };
  }

  return {
    changeNature: "unknown",
    summary: zh
      ? `${filePath} 已变更`
      : `${filePath} changed`
  };
}

// ---------------------------------------------------------------------------
// 4. generateChangeExplanation — main exported function
// ---------------------------------------------------------------------------

const NATURE_CATEGORY_MAP = {
  "function-added": "implementation",
  "function-modified": "implementation",
  "function-deleted": "implementation",
  "import-added": "dependencies",
  "import-removed": "dependencies",
  "config-changed": "configuration",
  "test-added": "tests",
  "test-modified": "tests",
  "style-change": "style",
  "documentation": "documentation",
  "unknown": "other"
};

function detectRiskIndicators(fileAnalyses) {
  const risks = [];
  const hasExportAdded = fileAnalyses.some((f) => f.nature === "function-modified");
  const hasCrossModuleImport = fileAnalyses.some((f) => f.nature === "import-added");

  if (hasExportAdded) {
    risks.push("new export surface");
  }
  if (hasCrossModuleImport) {
    risks.push("cross-module import added");
  }

  const totalAdditions = fileAnalyses.reduce((sum, f) => sum + (f.additions || 0), 0);
  if (totalAdditions > 200) {
    risks.push("large change size");
  }

  const deletedFiles = fileAnalyses.filter((f) => f.changeType === "D");
  if (deletedFiles.length > 0) {
    risks.push("file deletion");
  }

  return risks;
}

/**
 * @param {{ changedFiles: Array, taskContract: object, findings: Array, locale: string, repoRoot?: string }} opts
 * @returns {object|string} Structured explanation object, or string fallback
 */
export function generateChangeExplanation({ changedFiles, taskContract, findings, locale, repoRoot }) {
  const zh = isZh(locale);

  // Guard for empty input
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) {
    const fallback = zh ? "未检测到变更。" : "No changes detected.";
    return {
      summary: fallback,
      files: [],
      categories: {},
      riskIndicators: []
    };
  }

  const taskText = taskContract && taskContract.task ? taskContract.task : "";

  // Try to get real diff data from git
  let diffSummary = [];
  if (repoRoot) {
    try {
      diffSummary = readGitDiffSummary(repoRoot, "HEAD");
    } catch {
      diffSummary = [];
    }
  }

  // Build a map from diffSummary for quick lookup
  const diffMap = new Map();
  for (const ds of diffSummary) {
    diffMap.set(ds.path, ds);
  }

  // Limit: max 10 files, max 5 hunks per file
  const filesToAnalyze = changedFiles.slice(0, 10);
  const fileAnalyses = [];

  for (const cf of filesToAnalyze) {
    const filePath = cf && cf.path ? cf.path : "";
    if (!filePath) continue;

    const diffInfo = diffMap.get(filePath);
    const changeType = diffInfo ? diffInfo.changeType : (cf.type === "added" ? "A" : cf.type === "deleted" ? "D" : "M");
    const additions = diffInfo ? diffInfo.additions : 0;
    const deletions = diffInfo ? diffInfo.deletions : 0;

    let nature = "unknown";
    let summary = "";

    // Try to read actual hunks from git
    if (repoRoot) {
      const hunks = readDiffHunks(repoRoot, filePath, "HEAD", 5);
      if (hunks.length > 0) {
        // Analyze the first hunk to classify the change
        const analysis = analyzeDiffHunk(hunks[0], filePath, locale);
        nature = analysis.changeNature;
        summary = analysis.summary;

        // If we have multiple hunks, enrich the summary
        if (hunks.length > 1 && nature === "unknown") {
          // Scan all hunks for a better classification
          for (let i = 1; i < hunks.length; i++) {
            const nextAnalysis = analyzeDiffHunk(hunks[i], filePath, locale);
            if (nextAnalysis.changeNature !== "unknown") {
              nature = nextAnalysis.changeNature;
              summary = nextAnalysis.summary;
              break;
            }
          }
        }
      } else {
        // No hunks readable — classify by file path patterns
        const pathAnalysis = classifyByPath(filePath, locale);
        nature = pathAnalysis.changeNature;
        summary = pathAnalysis.summary;
      }
    } else {
      // No repo root — classify by file path only
      const pathAnalysis = classifyByPath(filePath, locale);
      nature = pathAnalysis.changeNature;
      summary = pathAnalysis.summary;
    }

    fileAnalyses.push({
      path: filePath,
      changeType,
      nature,
      summary,
      additions,
      deletions
    });
  }

  // Group by category
  const categories = {};
  for (const fa of fileAnalyses) {
    const category = NATURE_CATEGORY_MAP[fa.nature] || "other";
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(fa.path);
  }

  // Detect risk indicators
  const riskIndicators = detectRiskIndicators(fileAnalyses);

  // Build summary sentence
  const fileCount = changedFiles.length;
  const categoryKeys = Object.keys(categories);
  let summary;

  if (zh) {
    const parts = categoryKeys.map((cat) => {
      const catLabel = categoryLabelZh(cat);
      const count = categories[cat].length;
      return `${count} 个${catLabel}`;
    });
    summary = `共修改 ${fileCount} 个文件：${parts.join("，")}`;
    if (taskText) summary += `。任务意图：${taskText}`;
    if (riskIndicators.length > 0) {
      summary += `。风险提示：${riskIndicators.join("、")}`;
    }
  } else {
    const parts = categoryKeys.map((cat) => {
      const catLabel = categoryLabelEn(cat);
      const count = categories[cat].length;
      return `${count} ${catLabel}`;
    });
    summary = `Modified ${fileCount} file(s): ${parts.join(", ")}`;
    if (taskText) summary += `. Task: ${taskText}`;
    if (riskIndicators.length > 0) {
      summary += `. Risk indicators: ${riskIndicators.join(", ")}`;
    }
  }

  return {
    summary,
    files: fileAnalyses,
    categories,
    riskIndicators
  };
}

// ---------------------------------------------------------------------------
// 5. generateArchaeologyNote — structured archaeology note
// ---------------------------------------------------------------------------

/**
 * @param {{ changedFiles: Array, taskContract: object, sessionId: string, repoRoot?: string }} opts
 * @returns {object} Structured archaeology note
 */
export function generateArchaeologyNote({ changedFiles, taskContract, sessionId, repoRoot }) {
  const taskText = taskContract && taskContract.task ? taskContract.task : "";

  // Try to get real diff data
  let diffSummary = [];
  if (repoRoot) {
    try {
      diffSummary = readGitDiffSummary(repoRoot, "HEAD");
    } catch {
      diffSummary = [];
    }
  }

  const diffMap = new Map();
  for (const ds of diffSummary) {
    diffMap.set(ds.path, ds);
  }

  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const fileDetails = [];
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const f of files) {
    const filePath = f && f.path ? f.path : "";
    if (!filePath) continue;

    const diffInfo = diffMap.get(filePath);
    const changeType = diffInfo ? diffInfo.changeType : (f.type === "added" ? "A" : f.type === "deleted" ? "D" : "M");
    const additions = diffInfo ? diffInfo.additions : 0;
    const deletions = diffInfo ? diffInfo.deletions : 0;

    totalAdditions += additions;
    totalDeletions += deletions;

    // Classify nature
    let nature = "unknown";
    if (repoRoot) {
      const hunks = readDiffHunks(repoRoot, filePath, "HEAD", 3);
      if (hunks.length > 0) {
        const analysis = analyzeDiffHunk(hunks[0], filePath, "en");
        nature = analysis.changeNature;
      } else {
        const pathAnalysis = classifyByPath(filePath, "en");
        nature = pathAnalysis.changeNature;
      }
    } else {
      const pathAnalysis = classifyByPath(filePath, "en");
      nature = pathAnalysis.changeNature;
    }

    fileDetails.push({
      path: filePath,
      changeType,
      nature,
      additions,
      deletions
    });
  }

  // Detect risk indicators
  const riskIndicators = detectRiskIndicators(
    fileDetails.map((fd) => ({ ...fd, nature: fd.nature }))
  );

  // Build summary
  const fileNames = fileDetails.map((f) => f.path);
  const joined = fileNames.length > 0 ? fileNames.join(", ") : "";
  let summary = `变更原因：${taskText} | 涉及文件：${joined} | +${totalAdditions}/-${totalDeletions}`;
  if (sessionId) summary += ` | 会话：${sessionId}`;
  if (riskIndicators.length > 0) summary += ` | 风险：${riskIndicators.join("、")}`;

  return {
    timestamp: new Date().toISOString(),
    sessionId: sessionId || null,
    task: taskText,
    files: fileDetails,
    totalAdditions,
    totalDeletions,
    riskIndicators,
    summary
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Classify a file by path patterns when no diff hunk is available.
 */
function classifyByPath(filePath, locale) {
  const zh = isZh(locale);
  const normalizedPath = String(filePath || "").replaceAll("\\", "/").toLowerCase();

  const isTestFile = TEST_PATH_PATTERNS.some((p) => p.test(normalizedPath));
  const isConfigFile = CONFIG_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));
  const isStyleFile = STYLE_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));
  const isDocFile = DOC_EXTENSIONS.some((ext) => normalizedPath.endsWith(ext));

  if (isConfigFile) {
    return {
      changeNature: "config-changed",
      summary: zh ? `配置文件 ${filePath} 已修改` : `Configuration file ${filePath} modified`
    };
  }
  if (isStyleFile) {
    return {
      changeNature: "style-change",
      summary: zh ? `样式文件 ${filePath} 已修改` : `Style file ${filePath} modified`
    };
  }
  if (isDocFile) {
    return {
      changeNature: "documentation",
      summary: zh ? `文档 ${filePath} 已更新` : `Documentation ${filePath} updated`
    };
  }
  if (isTestFile) {
    return {
      changeNature: "test-modified",
      summary: zh ? `测试文件 ${filePath} 已修改` : `Test file ${filePath} modified`
    };
  }

  return {
    changeNature: "unknown",
    summary: zh ? `${filePath} 有代码变更` : `${filePath} has code changes`
  };
}

function categoryLabelZh(category) {
  switch (category) {
    case "implementation": return "实现文件";
    case "dependencies": return "依赖变更";
    case "configuration": return "配置文件";
    case "tests": return "测试文件";
    case "style": return "样式文件";
    case "documentation": return "文档";
    case "other": return "其他";
    default: return category;
  }
}

function categoryLabelEn(category) {
  switch (category) {
    case "implementation": return "implementation";
    case "dependencies": return "dependency";
    case "configuration": return "configuration";
    case "tests": return "test";
    case "style": return "style";
    case "documentation": return "documentation";
    case "other": return "other";
    default: return category;
  }
}

// CommonJS compatibility: allow require('./change-explainer.js') to work as well
if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateChangeExplanation, generateArchaeologyNote, readGitDiffSummary, analyzeDiffHunk };
}
