/**
 * Exception utilities for Python plugin
 */

/**
 * Check if boundary exception is declared
 */
export function boundaryExceptionDeclared(filePath, targetPath, expectedBoundaryExceptions) {
  if (expectedBoundaryExceptions.length === 0) {
    return false
  }

  const haystacks = [
    `${filePath} -> ${targetPath}`.toLowerCase(),
    filePath.toLowerCase(),
    targetPath.toLowerCase()
  ]

  return expectedBoundaryExceptions.some((token) =>
    haystacks.some((haystack) => haystack.includes(token))
  )
}
