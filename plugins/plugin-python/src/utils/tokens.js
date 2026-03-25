/**
 * Token utilities for Python naming conventions
 */

/**
 * Split Python identifier into tokens
 * Handles: snake_case, PascalCase, camelCase, UPPER_CASE
 * @param {string} value - Value to split
 * @returns {string[]} Array of lowercase tokens
 */
export function splitTokens(value) {
  return value
    // Handle snake_case: insert space before underscores, then remove underscores
    .replace(/_/g, " ")
    // Handle PascalCase/camelCase: insert space before uppercase letters
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    // Handle consecutive uppercase (e.g., XMLParser -> XML Parser)
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    // Split on non-alphanumeric
    .split(/[^a-zA-Z0-9]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Convert tokens to snake_case
 * @param {string[]} tokens - Array of tokens
 * @returns {string} snake_case string
 */
export function toSnakeCase(tokens) {
  return tokens.join("_");
}

/**
 * Convert tokens to kebab-case
 * @param {string[]} tokens - Array of tokens
 * @returns {string} kebab-case string
 */
export function toKebabCase(tokens) {
  return tokens.join("-");
}

/**
 * Normalize tokens by removing role and test tokens
 * @param {string[]} tokens - Array of tokens
 * @param {Map} roleAliases - Role aliases map
 * @param {Set} testBlacklist - Test token blacklist
 * @returns {string[]} Filtered tokens
 */
export function normalizeRolelessTokens(tokens, roleAliases, testBlacklist) {
  return tokens.filter(
    (token) => !roleAliases.has(token) && !testBlacklist.has(token)
  );
}

/**
 * Check if a Python name is private (starts with _)
 * @param {string} name - Name to check
 * @returns {boolean} True if private
 */
export function isPrivateName(name) {
  return name.startsWith("_");
}

/**
 * Check if a Python name is dunder (starts and ends with __)
 * @param {string} name - Name to check
 * @returns {boolean} True if dunder
 */
export function isDunderName(name) {
  return name.startsWith("__") && name.endsWith("__");
}

/**
 * Check if a Python name is public (not private or dunder)
 * @param {string} name - Name to check
 * @returns {boolean} True if public
 */
export function isPublicName(name) {
  return !isPrivateName(name) && !isDunderName(name);
}
