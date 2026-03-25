/**
 * TypeScript/JavaScript semantic detectors for agent-guardrails
 *
 * This plugin provides 4 semantic detectors:
 * 1. ts-pattern-drift - Detect parallel abstractions
 * 2. ts-interface-drift - Detect public surface changes
 * 3. ts-boundary-violation - Detect cross-layer import violations
 * 4. ts-source-test-relevance - Detect test-to-source relevance
 *
 * Version 2.0: Uses @typescript-eslint/parser for AST-based analysis
 * Falls back to regex-based analysis if AST parsing fails
 */

import fs from "node:fs";
import path from "node:path";

// AST Parser (primary method)
import {
  parseFile,
  extractExports,
  extractImports,
  extractDeclaredSymbols,
  detectPatternDriftAST
} from "./src/ast-parser.js";

// ============================================================================
// Constants
// ============================================================================

const ROLE_ALIASES = new Map([
  ["service", "service"],
  ["services", "service"],
  ["helper", "helper"],
  ["helpers", "helper"],
  ["util", "util"],
  ["utils", "util"],
  ["hook", "hook"],
  ["hooks", "hook"],
  ["adapter", "adapter"],
  ["adapters", "adapter"],
  ["client", "client"],
  ["clients", "client"],
  ["handler", "handler"],
  ["handlers", "handler"],
  ["controller", "controller"],
  ["controllers", "controller"],
  ["manager", "manager"],
  ["managers", "manager"],
  ["repository", "repository"],
  ["repositories", "repository"],
  ["repo", "repository"]
]);

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const COMMON_PATH_ROOTS = new Set(["src", "lib", "app", "apps", "packages", "server", "client", "tests", "test"]);
const TEST_TOKEN_BLACKLIST = new Set(["test", "tests", "spec", "__tests__"]);

// ============================================================================
// Utility Functions
// ============================================================================

function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

function splitTokens(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function unique(values) {
  return [...new Set(values)];
}

function isSupportedSourceFile(filePath) {
  const normalized = toPosixPath(filePath).toLowerCase();
  const extension = path.posix.extname(normalized);
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }

  return !(
    normalized.includes("/tests/") ||
    normalized.includes("/test/") ||
    normalized.includes("/__tests__/") ||
    normalized.includes(".test.") ||
    normalized.includes(".spec.")
  );
}

function isSupportedTestFile(filePath) {
  const normalized = toPosixPath(filePath).toLowerCase();
  const extension = path.posix.extname(normalized);
  if (!SOURCE_EXTENSIONS.has(extension)) {
    return false;
  }

  return (
    normalized.includes("/tests/") ||
    normalized.includes("/test/") ||
    normalized.includes("/__tests__/") ||
    normalized.includes(".test.") ||
    normalized.includes(".spec.")
  );
}

function createFinding({ severity, category, code, message, action, files = [] }) {
  return {
    severity,
    category,
    code,
    message,
    action,
    files: unique(files.map((item) => toPosixPath(item)).filter(Boolean))
  };
}

function readFileContent(repoRoot, filePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
  } catch {
    return "";
  }
}

// ============================================================================
// AST-Based Analysis Functions
// ============================================================================

/**
 * Analyze a file using AST parsing
 * @returns {object|null} Analysis result or null if parsing fails
 */
function analyzeFileAST(content, filePath) {
  const ast = parseFile(content, filePath);
  if (!ast) return null;

  return {
    exports: extractExports(ast),
    imports: extractImports(ast),
    symbols: extractDeclaredSymbols(ast)
  };
}

/**
 * Extract public surface using AST (primary) or regex (fallback)
 */
function extractPublicSurface(content, filePath) {
  // Try AST first
  const astAnalysis = analyzeFileAST(content, filePath);
  if (astAnalysis) {
    return astAnalysis.exports.map(exp => ({
      line: exp.line,
      names: exp.names,
      type: exp.type
    }));
  }

  // Fallback to regex
  return extractPublicSurfaceRegex(content);
}

/**
 * Regex-based public surface extraction (fallback)
 */
function extractPublicSurfaceRegex(content) {
  const EXPORT_NAME_PATTERN = /[A-Za-z_$][\w$]*/;
  const lines = content.split(/\r?\n/);
  const entries = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let match = trimmed.match(/^export\s+async\s+function\s+([A-Za-z_$][\w$]*)/);
    if (match) {
      entries.push({ line: trimmed, names: [match[1]] });
      continue;
    }

    match = trimmed.match(/^export\s+function\s+([A-Za-z_$][\w$]*)/);
    if (match) {
      entries.push({ line: trimmed, names: [match[1]] });
      continue;
    }

    match = trimmed.match(/^export\s+(?:const|let|class)\s+([A-Za-z_$][\w$]*)/);
    if (match) {
      entries.push({ line: trimmed, names: [match[1]] });
      continue;
    }

    match = trimmed.match(/^export\s+default(?:\s+(?:async\s+function|function|class)\s+([A-Za-z_$][\w$]*))?/);
    if (match) {
      entries.push({ line: trimmed, names: unique(["default", match[1]].filter(Boolean)) });
      continue;
    }

    match = trimmed.match(/^export\s*\{([^}]+)\}/);
    if (match) {
      const names = match[1]
        .split(",")
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => {
          const aliasMatch = item.match(/\bas\s+([A-Za-z_$][\w$]*)$/i);
          if (aliasMatch) return aliasMatch[1];
          const idMatch = item.match(EXPORT_NAME_PATTERN);
          return idMatch ? idMatch[0] : item;
        });
      entries.push({ line: trimmed, names });
      continue;
    }

    if (/^module\.exports\s*=/.test(trimmed)) {
      entries.push({ line: trimmed, names: ["module.exports"] });
      continue;
    }

    match = trimmed.match(/^exports\.([A-Za-z_$][\w$]*)\s*=/);
    if (match) {
      entries.push({ line: trimmed, names: [match[1]] });
    }
  }

  return entries;
}

/**
 * Extract import specifiers using AST (primary) or regex (fallback)
 */
function extractImportSpecifiers(content, filePath) {
  // Try AST first
  const astAnalysis = analyzeFileAST(content, filePath);
  if (astAnalysis) {
    return astAnalysis.imports.map(imp => ({
      source: imp.source,
      line: imp.line,
      dynamic: imp.dynamic || false
    }));
  }

  // Fallback to regex
  return extractImportSpecifiersRegex(content);
}

/**
 * Regex-based import extraction (fallback)
 */
function extractImportSpecifiersRegex(content) {
  const specifiers = [];
  const patterns = [
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\s+[\s\S]*?\bfrom\s+["']([^"']+)["']/g,
    /\bexport\s+[\s\S]*?\bfrom\s+["']([^"']+)["']/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      specifiers.push({ source: match[1] });
    }
  }

  return unique(specifiers.map(s => s.source));
}

/**
 * Extract declared symbol tokens using AST (primary) or regex (fallback)
 */
function extractDeclaredSymbolTokens(content, filePath) {
  // Try AST first
  const astAnalysis = analyzeFileAST(content, filePath);
  if (astAnalysis) {
    return unique(
      astAnalysis.symbols
        .filter(s => s.exported)
        .flatMap(s => splitTokens(s.name))
    );
  }

  // Fallback to regex
  const tokens = [];
  const patterns = [
    /\b(?:export\s+)?async\s+function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?function\s+([A-Za-z_$][\w$]*)/g,
    /\b(?:export\s+)?(?:const|let|class)\s+([A-Za-z_$][\w$]*)/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      tokens.push(...splitTokens(match[1]));
    }
  }

  return unique(tokens);
}

// ============================================================================
// Pattern Drift Detection
// ============================================================================

function analyzeRoleCandidate(filePath) {
  const normalized = toPosixPath(filePath);
  if (!isSupportedSourceFile(normalized)) return null;

  const directory = path.posix.dirname(normalized) === "." ? "" : path.posix.dirname(normalized);
  const basename = path.posix.basename(normalized, path.posix.extname(normalized));
  const tokens = splitTokens(basename);
  if (tokens.length < 2) return null;

  const role = ROLE_ALIASES.get(tokens[tokens.length - 1]);
  if (!role) return null;

  const stemTokens = tokens.slice(0, -1);
  if (stemTokens.length === 0) return null;

  const directoryTokens = directory
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .flatMap((token) => splitTokens(token));

  return {
    path: normalized,
    directory,
    role,
    stem: stemTokens.join("-"),
    featureKey: [...directoryTokens, ...stemTokens].join("-")
  };
}

function listSiblingMatches(repoRoot, candidate) {
  const directoryPath = candidate.directory ? path.join(repoRoot, candidate.directory) : repoRoot;
  let entries = [];

  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((dirent) => dirent.isFile())
    .map((dirent) => analyzeRoleCandidate(candidate.directory ? `${candidate.directory}/${dirent.name}` : dirent.name))
    .filter((other) => {
      return other &&
        other.path !== candidate.path &&
        other.directory === candidate.directory &&
        other.featureKey === candidate.featureKey &&
        other.role !== candidate.role;
    });
}

function buildPatternDriftMessage(candidate, siblingMatches) {
  const existingRoles = [...new Set(siblingMatches.map((item) => item.role))].join(", ");
  return `Potential pattern drift: ${candidate.path} introduces a parallel "${candidate.role}" abstraction for "${candidate.stem}" alongside existing ${existingRoles} code.`;
}

async function detectPatternDrift({ context, addFinding }) {
  const seen = new Set();

  for (const filePath of context.changedFiles) {
    const candidate = analyzeRoleCandidate(filePath);
    if (!candidate) continue;

    const siblingMatches = listSiblingMatches(context.repoRoot, candidate);
    if (siblingMatches.length === 0) continue;

    const key = `${candidate.path}:${siblingMatches.map((item) => item.path).sort().join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);

    addFinding(createFinding({
      severity: "warning",
      category: "consistency",
      code: "pattern-drift-parallel-abstraction",
      message: buildPatternDriftMessage(candidate, siblingMatches),
      action: "Reuse the existing abstraction pattern or explain why a parallel abstraction is necessary.",
      files: [candidate.path, ...siblingMatches.map((item) => item.path)]
    }));
  }
}

// ============================================================================
// Interface Drift Detection
// ============================================================================

function isImplementationOnlyTask(allowedChangeTypes) {
  return allowedChangeTypes.length > 0 && allowedChangeTypes.every((item) => item === "implementation-only");
}

function matchesExpectedSurface(entry, expectedTokens) {
  const haystacks = [entry.line, ...(entry.names || [])].map((item) => String(item ?? "").toLowerCase());
  return expectedTokens.some((token) => haystacks.some((haystack) => haystack.includes(token)));
}

function buildUnexpectedSurfaceMessage(filePath, entries, expectedTokens) {
  const exportedNames = unique(entries.flatMap((entry) => entry.names || [])).join(", ");
  return `Public surface drift: ${filePath} exports ${exportedNames || "new public symbols"} without matching the declared expected public surface changes (${expectedTokens.join(", ")}).`;
}

async function detectInterfaceDrift({ context, addFinding }) {
  const expectedTokens = (context.taskContract?.expectedPublicSurfaceChanges ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const implementationOnly = isImplementationOnlyTask(context.allowedChangeTypes);
  const seen = new Set();

  for (const filePath of context.changedFiles) {
    if (!isSupportedSourceFile(filePath)) continue;

    const content = readFileContent(context.repoRoot, filePath);
    const exportEntries = extractPublicSurface(content, filePath);
    if (exportEntries.length === 0) continue;

    if (implementationOnly) {
      if (seen.has(`impl:${filePath}`)) continue;
      seen.add(`impl:${filePath}`);
      addFinding(createFinding({
        severity: "error",
        category: "risk",
        code: "interface-drift-implementation-only",
        message: `Public surface drift: ${filePath} introduces or changes exported symbols inside an implementation-only task.`,
        action: "Declare the task as interface-changing or remove the public-surface change.",
        files: [filePath]
      }));
      continue;
    }

    if (expectedTokens.length === 0) {
      if (seen.has(`undoc:${filePath}`)) continue;
      seen.add(`undoc:${filePath}`);
      addFinding(createFinding({
        severity: "warning",
        category: "risk",
        code: "interface-drift-undocumented-public-surface",
        message: `Public surface drift: ${filePath} exports public symbols without any declared expected public surface changes.`,
        action: "Document the expected public surface changes in the task contract.",
        files: [filePath]
      }));
      continue;
    }

    const unmatchedEntries = exportEntries.filter((entry) => !matchesExpectedSurface(entry, expectedTokens));
    if (unmatchedEntries.length === 0 || seen.has(`unexpected:${filePath}`)) continue;

    seen.add(`unexpected:${filePath}`);
    addFinding(createFinding({
      severity: "warning",
      category: "risk",
      code: "interface-drift-unexpected-public-surface",
      message: buildUnexpectedSurfaceMessage(filePath, unmatchedEntries, expectedTokens),
      action: "Align expectedPublicSurfaceChanges with the actual exported symbols or remove the undeclared export drift.",
      files: [filePath]
    }));
  }
}

// ============================================================================
// Boundary Violation Detection
// ============================================================================

function hasScopeMatch(targetPath, scope) {
  const normalizedTarget = toPosixPath(targetPath).toLowerCase();
  const normalizedScope = toPosixPath(scope).toLowerCase();

  if (!normalizedScope) return false;
  if (normalizedTarget === normalizedScope) return true;

  const scopePrefix = normalizedScope.endsWith("/") ? normalizedScope : `${normalizedScope}/`;
  return normalizedTarget.startsWith(scopePrefix);
}

function resolveImportTarget(filePath, specifier) {
  const normalizedSpecifier = specifier.trim();
  if (!normalizedSpecifier || normalizedSpecifier.startsWith("#")) return null;

  if (normalizedSpecifier.startsWith(".")) {
    const directory = path.posix.dirname(toPosixPath(filePath));
    return path.posix.normalize(path.posix.join(directory, normalizedSpecifier));
  }

  if (normalizedSpecifier.startsWith("@/")) {
    return normalizedSpecifier.slice(2);
  }

  if (/^(src|lib|app|apps|packages|server|client)\//.test(normalizedSpecifier)) {
    return path.posix.normalize(normalizedSpecifier);
  }

  return null;
}

function normalizeBoundaryRules(boundaries) {
  if (!Array.isArray(boundaries)) return [];

  return boundaries
    .map((rule) => {
      if (!rule || typeof rule !== "object") return null;

      const from = typeof rule.from === "string" ? toPosixPath(rule.from) : "";
      const disallow = unique(
        (Array.isArray(rule.disallow) ? rule.disallow : [rule.to ?? rule.disallow])
          .filter((item) => typeof item === "string" && item.trim())
          .map((item) => toPosixPath(item))
      );

      if (!from || disallow.length === 0) return null;

      return {
        from,
        disallow,
        severity: rule.severity === "warning" ? "warning" : "error",
        label: rule.label ?? `${from} boundary`,
        action: rule.action ?? null
      };
    })
    .filter(Boolean);
}

function boundaryExceptionDeclared(filePath, targetPath, expectedBoundaryExceptions) {
  if (expectedBoundaryExceptions.length === 0) return false;

  const haystacks = [
    `${filePath} -> ${targetPath}`.toLowerCase(),
    filePath.toLowerCase(),
    targetPath.toLowerCase()
  ];

  return expectedBoundaryExceptions.some((token) => haystacks.some((haystack) => haystack.includes(token)));
}

function buildBoundaryViolationMessage(filePath, importTarget, rule) {
  return `Module boundary violation: ${filePath} imports ${importTarget} across the declared ${rule.label}.`;
}

async function detectBoundaryViolation({ context, addFinding }) {
  const boundaryRules = normalizeBoundaryRules(context.config.boundaries);
  if (boundaryRules.length === 0) return;

  const expectedBoundaryExceptions = (context.taskContract?.expectedBoundaryExceptions ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set();

  for (const filePath of context.changedFiles) {
    if (!isSupportedSourceFile(filePath)) continue;

    const applicableRules = boundaryRules.filter((rule) => hasScopeMatch(filePath, rule.from));
    if (applicableRules.length === 0) continue;

    const content = readFileContent(context.repoRoot, filePath);
    const importSpecifiers = extractImportSpecifiers(content, filePath);

    const importTargets = (Array.isArray(importSpecifiers) ? importSpecifiers : [importSpecifiers])
      .flatMap(spec => typeof spec === "string" ? spec : spec.source)
      .filter(Boolean)
      .map((specifier) => resolveImportTarget(filePath, specifier))
      .filter(Boolean);

    for (const importTarget of importTargets) {
      for (const rule of applicableRules) {
        if (!rule.disallow.some((scope) => hasScopeMatch(importTarget, scope))) continue;

        if (boundaryExceptionDeclared(filePath, importTarget, expectedBoundaryExceptions)) continue;

        const code = rule.severity === "warning"
          ? "boundary-violation-suggestive-import"
          : "boundary-violation-forbidden-import";
        const key = `${filePath}:${importTarget}:${code}`;
        if (seen.has(key)) continue;
        seen.add(key);

        addFinding(createFinding({
          severity: rule.severity,
          category: "consistency",
          code,
          message: buildBoundaryViolationMessage(filePath, importTarget, rule),
          action: rule.action ?? `Route the dependency through an allowed layer or declare a justified boundary exception for ${importTarget}.`,
          files: [filePath]
        }));
      }
    }
  }
}

// ============================================================================
// Source-Test Relevance Detection
// ============================================================================

function normalizeRolelessStemTokens(tokens) {
  return tokens.filter((token) => !ROLE_ALIASES.has(token) && !TEST_TOKEN_BLACKLIST.has(token));
}

function analyzeSurfaceProfile(filePath, content) {
  const normalized = toPosixPath(filePath);
  const directory = path.posix.dirname(normalized) === "." ? "" : path.posix.dirname(normalized);
  const basename = path.posix.basename(normalized, path.posix.extname(normalized));
  const directoryTokens = directory
    .split("/")
    .filter(Boolean)
    .flatMap((segment) => splitTokens(segment))
    .filter((token) => !COMMON_PATH_ROOTS.has(token) && !TEST_TOKEN_BLACKLIST.has(token));
  const basenameTokens = normalizeRolelessStemTokens(splitTokens(basename));
  const symbolTokens = extractDeclaredSymbolTokens(content, filePath);

  return {
    path: normalized,
    directory,
    basename,
    basenameTokens,
    directoryTokens,
    symbolTokens,
    stemKey: basenameTokens.join("-"),
    keyTokens: unique([...basenameTokens, ...directoryTokens, ...symbolTokens])
  };
}

function scoreTestRelevance(sourceProfile, testProfile, testContentLower) {
  let score = 0;
  const basenameOverlap = sourceProfile.basenameTokens.filter((token) => testProfile.basenameTokens.includes(token));
  const directoryOverlap = sourceProfile.directoryTokens.filter((token) => testProfile.directoryTokens.includes(token));
  const exactStemMatch = sourceProfile.stemKey && sourceProfile.stemKey === testProfile.stemKey;
  const symbolMention = sourceProfile.symbolTokens.some((token) => testContentLower.includes(token));
  const basenameMention = sourceProfile.basenameTokens.some((token) => testContentLower.includes(token));

  score += Math.min(4, basenameOverlap.length * 2);
  score += Math.min(2, directoryOverlap.length);
  if (exactStemMatch) score += 2;
  if (symbolMention) score += 2;
  if (basenameMention) score += 1;

  return score;
}

async function detectSourceTestRelevance({ context, addFinding }) {
  if (context.sourceFiles.length === 0 || context.testFiles.length === 0) return;

  const expectedTestTargets = (context.taskContract?.expectedTestTargets ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const changedTestPathsLower = context.testFiles.map((filePath) => filePath.toLowerCase());
  const seen = new Set();
  const testProfiles = context.testFiles
    .filter((filePath) => isSupportedTestFile(filePath))
    .map((filePath) => {
      const content = readFileContent(context.repoRoot, filePath);
      return {
        path: filePath,
        profile: analyzeSurfaceProfile(filePath, content),
        contentLower: content.toLowerCase()
      };
    });

  for (const filePath of context.sourceFiles) {
    if (!isSupportedSourceFile(filePath)) continue;

    const sourceContent = readFileContent(context.repoRoot, filePath);
    const sourceProfile = analyzeSurfaceProfile(filePath, sourceContent);
    const relevantTests = testProfiles.filter((testItem) => {
      return scoreTestRelevance(sourceProfile, testItem.profile, testItem.contentLower) >= 3;
    });

    if (relevantTests.length > 0) continue;

    const expectedTargetsTouched = expectedTestTargets.filter((token) => {
      return changedTestPathsLower.some((testPath) => testPath.includes(token));
    });
    const files = [filePath, ...context.testFiles];

    if (expectedTestTargets.length > 0 && expectedTargetsTouched.length === 0) {
      const key = `expected:${filePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      addFinding(createFinding({
        severity: "error",
        category: "validation",
        code: "source-test-relevance-missed-expected-targets",
        message: `Source-to-test relevance is weak: ${filePath} changed, but the changed tests (${context.testFiles.join(", ")}) do not include the declared expected test targets (${expectedTestTargets.join(", ")}).`,
        action: "Update the expected test targets or change the tests so they exercise the touched behavior surface.",
        files
      }));
      continue;
    }

    const key = `weak:${filePath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addFinding(createFinding({
      severity: "warning",
      category: "validation",
      code: "source-test-relevance-weak",
      message: `Source-to-test relevance is weak: the changed tests (${context.testFiles.join(", ")}) do not appear to validate the behavior touched in ${filePath}.`,
      action: "Tighten the tests so they mention or cover the changed behavior surface more directly.",
      files
    }));
  }
}

// ============================================================================
// Plugin Entry Point
// ============================================================================

export async function getDetectors() {
  return [
    {
      name: "ts-pattern-drift",
      run: detectPatternDrift
    },
    {
      name: "ts-interface-drift",
      run: detectInterfaceDrift
    },
    {
      name: "ts-boundary-violation",
      run: detectBoundaryViolation
    },
    {
      name: "ts-source-test-relevance",
      run: detectSourceTestRelevance
    }
  ];
}
