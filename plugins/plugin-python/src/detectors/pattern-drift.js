/**
 * Pattern Drift Detector for Python
 * Detects parallel abstractions (重复模式)
 */

import path from "node:path"
import fs from "node:fs"

import { toPosixPath, unique, isPythonSourceFile } from "../utils/path.js"
import { PYTHON_ROLE_ALIASES } from "../constants.js"
import { createFinding } from "../utils/finding.js"
import { splitTokens } from "../utils/tokens.js"

/**
 * Analyze a Python file for role candidate patterns
 */
function analyzePythonRoleCandidate(filePath) {
  const normalized = toPosixPath(filePath)
  if (!isPythonSourceFile(normalized)) {
    return null
  }

  const directory = path.posix.dirname(normalized) === "." ? "" : path.posix.dirname(normalized)
  const basename = path.posix.basename(normalized, ".py")
  const tokens = splitTokens(basename)

  if (tokens.length < 2) {
    return null
  }

  const role = PYTHON_ROLE_ALIASES.get(tokens[tokens.length - 1])
  if (!role) {
    return null
  }

  const stemTokens = tokens.slice(0, -1)
  if (stemTokens.length === 0) {
    return null
  }

  const directoryTokens = directory
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .flatMap((token) => splitTokens(token))

  return {
    path: normalized,
    directory,
    role,
    stem: stemTokens.join("_"),
    featureKey: [...directoryTokens, ...stemTokens].join("_")
  }
}

/**
 * List sibling role matches in the same directory
 */
function listPythonSiblingMatches(repoRoot, candidate) {
  const directoryPath = candidate.directory ? path.join(repoRoot, candidate.directory) : repoRoot
  let entries = []

  try {
    entries = fs.readdirSync(directoryPath, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((dirent) => dirent.isFile())
    .map((dirent) =>
      analyzePythonRoleCandidate(
        candidate.directory ? `${candidate.directory}/${dirent.name}` : dirent.name
      )
    )
    .filter((other) => {
      return (
        other &&
        other.path !== candidate.path &&
        other.directory === candidate.directory &&
        other.featureKey === candidate.featureKey &&
        other.role !== candidate.role
      )
    })
}

/**
 * Build pattern drift message
 */
function buildPatternDriftMessage(candidate, siblingMatches) {
  const existingRoles = [...new Set(siblingMatches.map((item) => item.role))].join(", ")
  return `Potential pattern drift: ${candidate.path} introduces a parallel "${candidate.role}" abstraction for "${candidate.stem}" alongside existing ${existingRoles} code.`
}

/**
 * Detect Python pattern drift
 */
export async function detectPatternDrift({ context, addFinding }) {
  const seen = new Set()

  for (const filePath of context.changedFiles) {
    const candidate = analyzePythonRoleCandidate(filePath)
    if (!candidate) {
      continue
    }

    const siblingMatches = listPythonSiblingMatches(context.repoRoot, candidate)
    if (siblingMatches.length === 0) {
      continue
    }

    const key = `${candidate.path}:${siblingMatches.map((item) => item.path).sort().join(",")}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    addFinding(
      createFinding({
        severity: "warning",
        category: "consistency",
        code: "py-pattern-drift-parallel-abstraction",
        message: buildPatternDriftMessage(candidate, siblingMatches),
        action: "Reuse the existing abstraction pattern or explain why a parallel abstraction is necessary.",
        files: [candidate.path, ...siblingMatches.map((item) => item.path)]
      })
    )
  }
}
