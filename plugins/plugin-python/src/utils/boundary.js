/**
 * Boundary utilities for Python plugin
 */

import { toPosixPath } from "./path.js"

/**
 * Normalize boundary rules from config
 */
export function normalizeBoundaryRules(boundaries) {
  if (!Array.isArray(boundaries)) {
    return []
  }

  return boundaries
    .map((rule) => {
      if (!rule || typeof rule !== "object") {
        return null
      }

      const from = typeof rule.from === "string" ? toPosixPath(rule.from) : ""
      const disallow = (Array.isArray(rule.disallow) ? rule.disallow : [rule.to ?? rule.disallow])
        .filter((item) => typeof item === "string" && item.trim())
        .map((item) => toPosixPath(item))

      if (!from || disallow.length === 0) {
        return null
      }

      return {
        from,
        disallow,
        severity: rule.severity === "warning" ? "warning" : "error",
        label: rule.label ?? `${from} boundary`,
        action: rule.action ?? null
      }
    })
    .filter(Boolean)
}
