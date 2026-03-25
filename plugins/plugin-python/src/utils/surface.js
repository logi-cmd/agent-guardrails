/**
 * Surface matching utilities for Python plugin
 */

/**
 * Check if entry matches expected surface tokens
 */
export function matchesExpectedSurface(entry, expectedTokens) {
  const haystacks = [entry.line, ...entry.names].map((item) => item.toLowerCase())
  return expectedTokens.some((token) => haystacks.some((haystack) => haystack.includes(token))
  )
}
