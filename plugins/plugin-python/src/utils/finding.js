/**
 * Finding utilities for Python plugin
 */

import { unique } from "./path.js"

import { toPosixPath } from "./path.js"

/**
 * Create a standardized finding object
 */
export function createFinding({ severity, category, code, message, action, files = [] }) {
  return {
    severity,
    category,
    code,
    message,
    action,
    files: unique(files.map((item) => toPosixPath(item)).filter(Boolean))
  }
}
