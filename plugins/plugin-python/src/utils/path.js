/**
 * Path utilities for Python files
 */
import path from "node:path";

/**
 * Convert Windows path to POSIX path
 * @param {string} filePath - File path to convert
 * @returns {string} POSIX-style path
 */
export function toPosixPath(filePath) {
  return filePath.replaceAll("\\", "/");
}

/**
 * Check if a file is a Python source file
 * @param {string} filePath - File path to check
 * @returns {boolean} True if Python file
 */
export function isPythonFile(filePath) {
  const normalized = toPosixPath(filePath).toLowerCase();
  return normalized.endsWith(".py");
}

/**
 * Check if a file is a Python test file
 * @param {string} filePath - File path to check
 * @param {Object} signals - Test signals configuration
 * @returns {boolean} True if test file
 */
export function isPythonTestFile(filePath, signals = {}) {
  const normalized = toPosixPath(filePath).toLowerCase();

  if (!normalized.endsWith(".py")) {
    return false;
  }

  const { directories = [], prefixes = [], suffixes = [], files = [] } = signals;

  // Check directory
  if (directories.some((d) => normalized.includes(`/${d}/`))) {
    return true;
  }

  // Check prefix
  const basename = path.posix.basename(normalized);
  if (prefixes.some((p) => basename.startsWith(p))) {
    return true;
  }

  // Check suffix
  if (suffixes.some((s) => normalized.endsWith(s))) {
    return true;
  }

  // Check specific files
  if (files.some((f) => basename === f)) {
    return true;
  }

  return false;
}

/**
 * Check if a file is a Python source file (non-test)
 * @param {string} filePath - File path to check
 * @param {Object} signals - Test signals configuration
 * @returns {boolean} True if source file
 */
export function isPythonSourceFile(filePath, signals = {}) {
  if (!isPythonFile(filePath)) {
    return false;
  }

  return !isPythonTestFile(filePath, signals);
}

/**
 * Get the Python module path from a file path
 * @param {string} filePath - File path
 * @param {string} repoRoot - Repository root
 * @returns {string} Module path (e.g., "app.services.user_service")
 */
export function getPythonModulePath(filePath, repoRoot) {
  const normalized = toPosixPath(filePath);
  const normalizedRoot = toPosixPath(repoRoot);

  let relativePath = normalized;
  if (normalized.startsWith(normalizedRoot)) {
    relativePath = normalized.slice(normalizedRoot.length);
  }

  // Remove leading slash
  if (relativePath.startsWith("/")) {
    relativePath = relativePath.slice(1);
  }

  // Remove .py extension
  if (relativePath.endsWith(".py")) {
    relativePath = relativePath.slice(0, -3);
  }

  // Handle __init__.py
  if (relativePath.endsWith("/__init__")) {
    relativePath = relativePath.slice(0, -9);
  }

  // Convert slashes to dots
  return relativePath.replace(/\//g, ".");
}

/**
 * Check if a path has scope match
 * @param {string} targetPath - Target path
 * @param {string} scope - Scope to match
 * @returns {boolean} True if matches
 */
export function hasScopeMatch(targetPath, scope) {
  const normalizedTarget = toPosixPath(targetPath).toLowerCase();
  const normalizedScope = toPosixPath(scope).toLowerCase();

  if (!normalizedScope) {
    return false;
  }

  if (normalizedTarget === normalizedScope) {
    return true;
  }

  const scopePrefix = normalizedScope.endsWith("/") ? normalizedScope : `${normalizedScope}/`;
  return normalizedTarget.startsWith(scopePrefix);
}

/**
 * Get unique values from array
 * @param {Array} values - Array of values
 * @returns {Array} Unique values
 */
export function unique(values) {
  return [...new Set(values)];
}
