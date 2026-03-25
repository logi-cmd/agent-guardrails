/**
 * Task utilities for Python plugin
 */

/**
 * Check if task is implementation-only
 */
export function isImplementationOnlyTask(allowedChangeTypes) {
  return (
    allowedChangeTypes.length > 0 &&
    allowedChangeTypes.every((item) => item === "implementation-only")
  )
}
