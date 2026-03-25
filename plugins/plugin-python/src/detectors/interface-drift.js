/**
 * Interface Drift Detector for Python
 * Detects undeclared public surface changes
 */

import { toPosixPath, unique, isPythonSourceFile, hasScopeMatch } from "../utils/path.js"
import {
  PYTHON_TEST_SIGNALS
} from "../constants.js";
import { createFinding } from "../utils/finding.js"
import {
  extractPublicSurfaceSignals,
  extractFastAPIRoutes,
  extractImportSpecifiers,
  readFileContent
} from "../utils/python-parser.js"

import { isImplementationOnlyTask } from "../utils/task.js"

/**
 * Check if entry matches expected surface
 */
function matchesExpectedSurface(entry, expectedTokens) {
  const haystacks = [entry.line, ...entry.names].map((item) => item.toLowerCase())
  return expectedTokens.some((token) => haystacks.some((haystack) => haystack.includes(token)))
}

/**
 * Build unexpected surface message
 */
function buildUnexpectedSurfaceMessage(filePath, entries, expectedTokens) {
  const exportedNames = unique(entries.flatMap((entry) => entry.names)).join(", ")
  return `Public surface drift: ${filePath} exports ${exportedNames || "new public symbols"} without matching the declared expected public surface changes (${expectedTokens.join(", ")}).`
}

/**
 * Detect Python interface drift
 */
export async function detectInterfaceDrift({ context, addFinding }) {
  const expectedTokens = (context.taskContract?.expectedPublicSurfaceChanges ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  const implementationOnly = isImplementationOnlyTask(context.allowedChangeTypes)
  const seen = new Set()

  for (const filePath of context.changedFiles) {
    if (!isPythonSourceFile(filePath)) {
      continue
    }

    const content = readFileContent(context.repoRoot, filePath)
    const publicEntries = extractPublicSurfaceSignals(content)
      .filter((entry) => entry.isPublic)

    if (publicEntries.length === 0) {
      continue
    }

    if (implementationOnly) {
      if (seen.has(`impl:${filePath}`)) {
        continue
      }
      seen.add(`impl:${filePath}`)

      addFinding(
        createFinding({
          severity: "error",
          category: "risk",
          code: "py-interface-drift-implementation-only",
          message: `Public surface drift: ${filePath} introduces or changes exported symbols inside an implementation-only task.`,
          action: "Declare the task as interface-changing or remove the public-surface change.",
          files: [filePath]
        })
      )
      continue
    }

    if (expectedTokens.length === 0) {
      if (seen.has(`undoc:${filePath}`)) {
        continue
      }
      seen.add(`undoc:${filePath}`)

      addFinding(
        createFinding({
          severity: "warning",
          category: "risk",
          code: "py-interface-drift-undocumented-public-surface",
          message: `Public surface drift: ${filePath} exports public symbols without any declared expected public surface changes.`,
          action: "Document the expected public surface changes in the task contract.",
          files: [filePath]
        })
      )
      continue
    }

    const unmatchedEntries = publicEntries.filter(
      (entry) => !matchesExpectedSurface(entry, expectedTokens)
    )
    if (unmatchedEntries.length === 0 || seen.has(`unexpected:${filePath}`)) {
      continue
    }
    seen.add(`unexpected:${filePath}`)

    addFinding(
      createFinding({
        severity: "warning",
        category: "risk",
        code: "py-interface-drift-unexpected-public-surface",
        message: buildUnexpectedSurfaceMessage(filePath, unmatchedEntries, expectedTokens),
        action: "Align expectedPublicSurfaceChanges with the actual exported symbols or remove the undeclared export drift.",
        files: [filePath]
      })
    )
  }
}
