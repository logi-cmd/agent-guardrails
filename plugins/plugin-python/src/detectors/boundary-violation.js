/**
 * Boundary Violation Detector for Python
 * Detects cross-layer import violations
 */

import path from "node:path"
import fs from "node:fs"

import { toPosixPath, unique, isPythonSourceFile, hasScopeMatch } from "../utils/path.js"
import { createFinding } from "../utils/finding.js"
import { extractImportSpecifiers, readFileContent } from "../utils/python-parser.js"
import { normalizeBoundaryRules } from "../utils/boundary.js"
import { boundaryExceptionDeclared } from "../utils/exception.js"

/**
 * Resolve Python import target to a local path
 */
function resolvePythonImportTarget(filePath, specifier, repoRoot) {
  const normalizedSpecifier = specifier.trim()
  if (!normalizedSpecifier || normalizedSpecifier.startsWith("#")) {
    return null
  }

  // Relative import: from . import X or from ..X import Y
  if (normalizedSpecifier.startsWith(".")) {
    const directory = path.posix.dirname(toPosixPath(filePath))
    const dots = normalizedSpecifier.match(/^(\.+)(.*)$/)
    if (!dots) {
      return null
    }
    const dotCount = dots[1].length
    const moduleName = dots[2] || ""
    let relative = ""

    if (dotCount === 1) {
      relative = moduleName
    } else {
      const upLevels = dotCount - 1
      const parts = directory.split("/").filter(Boolean)
      const newParts = parts.slice(0, Math.max(0, parts.length - upLevels))
      relative = moduleName ? [...newParts, moduleName].join("/") : newParts.join("/")
    }

    const resolved = path.posix.normalize(relative)
    return resolved === "." || resolved === "" ? "__init__.py" : `${resolved}.py`
  }

  // Module alias: @/app/services -> app/services
  if (normalizedSpecifier.startsWith("@/")) {
    return normalizedSpecifier.slice(2)
  }

  // Standard path patterns: src/app/X, lib/app/X, app/X
  if (/^(src|lib|app|apps|packages|server|client)\//.test(normalizedSpecifier)) {
    return path.posix.normalize(normalizedSpecifier)
  }

  // Absolute import: app.services.X -> app/services/X.py or app/services/__init__.py
  const possiblePaths = [
    `${normalizedSpecifier.replace(/\./g, "/")}.py`,
    `${normalizedSpecifier.replace(/\./g, "/")}/__init__.py`
  ]

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(path.join(repoRoot, p))) {
        return p
      }
    } catch {
      // Ignore errors
    }
  }

  return null
}

/**
 * Build boundary violation message
 */
function buildBoundaryViolationMessage(filePath, importTarget, rule) {
  return `Module boundary violation: ${filePath} imports ${importTarget} across the declared ${rule.label}.`
}

/**
 * Detect Python boundary violations
 */
export async function detectBoundaryViolation({ context, addFinding }) {
  const boundaryRules = normalizeBoundaryRules(context.config.boundaries)
  if (boundaryRules.length === 0) {
    return
  }

  const expectedBoundaryExceptions = (
    context.taskContract?.expectedBoundaryExceptions ?? []
  )
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const seen = new Set()

  for (const filePath of context.changedFiles) {
    if (!isPythonSourceFile(filePath)) {
      continue
    }

    const applicableRules = boundaryRules.filter((rule) =>
      hasScopeMatch(filePath, rule.from)
    )
    if (applicableRules.length === 0) {
      continue
    }

    const content = readFileContent(context.repoRoot, filePath)
    const importSpecifiers = extractImportSpecifiers(content)

    for (const specifier of importSpecifiers) {
      const importTarget = resolvePythonImportTarget(filePath, specifier.module, context.repoRoot)
      if (!importTarget) {
        continue
      }

      for (const rule of applicableRules) {
        if (!rule.disallow.some((scope) => hasScopeMatch(importTarget, scope))) {
          continue
        }

        if (boundaryExceptionDeclared(filePath, importTarget, expectedBoundaryExceptions)) {
          continue
        }

        const code =
          rule.severity === "warning"
            ? "py-boundary-violation-suggestive-import"
            : "py-boundary-violation-forbidden-import"
        const key = `${filePath}:${importTarget}:${code}`
        if (seen.has(key)) {
          continue
        }
        seen.add(key)

        addFinding(
          createFinding({
            severity: rule.severity,
            category: "consistency",
            code,
            message: buildBoundaryViolationMessage(filePath, importTarget, rule),
            action:
              rule.action ??
              `Route the dependency through an allowed layer or declare a justified boundary exception for ${importTarget}.`,
            files: [filePath]
          })
        )
      }
    }
  }
}
