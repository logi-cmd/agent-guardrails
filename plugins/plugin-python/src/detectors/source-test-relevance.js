/**
 * Source-to-Test Relevance Detector for Python
 * Detects test-to-source relevance
 */

import path from "node:path"

import { toPosixPath, unique, isPythonSourceFile, isPythonTestFile } from "../utils/path.js"
import { createFinding } from "../utils/finding.js"
import {
  PYTHON_TEST_SIGNALS,
} from "../constants.js"
import {
  splitTokens,
  normalizeRolelessTokens
} from "../utils/tokens.js"
import {
  extractDeclaredSymbolTokens,
  extractPublicSurfaceSignals,
  readFileContent,
  hasPytestTests
} from "../utils/python-parser.js"

import { PYTHON_ROLE_ALIASES } from "../constants.js"

const COMMON_PATH_ROOTS = new Set([
  "src",
  "lib",
  "app",
  "apps",
  "packages",
  "server",
  "client",
  "tests",
  "test",
  "api",
  "routers",
  "services",
  "models",
  "schemas",
  "core",
  "utils",
  "helpers"
])

/**
 * Analyze Python surface profile
 */
function analyzePythonSurfaceProfile(filePath, content) {
  const normalized = toPosixPath(filePath)
  const directory = path.posix.dirname(normalized) === "." ? "" : path.posix.dirname(normalized)
  const basename = path.posix.basename(normalized, ".py")
  const directoryTokens = directory
    .split("/")
    .filter(Boolean)
    .flatMap((segment) => splitTokens(segment))
    .filter((token) => !COMMON_PATH_ROOTS.has(token))

  const basenameTokens = normalizeRolelessTokens(splitTokens(basename), PYTHON_ROLE_ALIASES, new Set())
  const symbolTokens = extractDeclaredSymbolTokens(content)
  const stemKey = basenameTokens.join("_")
  const keyTokens = unique([...basenameTokens, ...directoryTokens, ...symbolTokens])

  return {
    path: normalized,
    directory,
    basename,
    basenameTokens,
    directoryTokens,
    symbolTokens,
    stemKey,
    keyTokens
  }
}

/**
 * Score test relevance
 */
function scorePythonTestRelevance(sourceProfile, testProfile, testContentLower) {
  let score = 0
  const basenameOverlap = sourceProfile.basenameTokens.filter((token) =>
    testProfile.basenameTokens.includes(token)
  )
  const directoryOverlap = sourceProfile.directoryTokens.filter((token) =>
    testProfile.directoryTokens.includes(token)
  )
  const exactStemMatch = sourceProfile.stemKey && sourceProfile.stemKey === testProfile.stemKey
  const symbolMention = sourceProfile.symbolTokens.some((token) =>
    testContentLower.includes(token)
  )
  const basenameMention = sourceProfile.basenameTokens.some((token) =>
    testContentLower.includes(token)
  )

  score += Math.min(4, basenameOverlap.length * 2)
  score += Math.min(2, directoryOverlap.length)
  if (exactStemMatch) {
    score += 2
  }
  if (symbolMention) {
    score += 2
  }
  if (basenameMention) {
    score += 1
  }
  if (hasPytestTests(testContentLower)) {
    for (const symbol of sourceProfile.symbolTokens) {
      if (testContentLower.includes(`test_${symbol.toLowerCase()}`)) {
        score += 2
        break
      }
    }
  }

  return score
}

/**
 * Detect Python source-test relevance
 */
export async function detectSourceTestRelevance({ context, addFinding }) {
  if (context.sourceFiles.length === 0 || context.testFiles.length === 0) {
    return
  }

  const expectedTestTargets = (context.taskContract?.expectedTestTargets ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  const changedTestPathsLower = context.testFiles.map((filePath) => filePath.toLowerCase())
  const seen = new Set()

  const testProfiles = context.testFiles
    .filter((filePath) => isPythonTestFile(filePath, PYTHON_TEST_SIGNALS))
    .map((filePath) => {
      const content = readFileContent(context.repoRoot, filePath)
      return {
        path: filePath,
        profile: analyzePythonSurfaceProfile(filePath, content),
        contentLower: content.toLowerCase()
      }
    })

  for (const filePath of context.sourceFiles) {
    if (!isPythonSourceFile(filePath)) {
      continue
    }

    const sourceContent = readFileContent(context.repoRoot, filePath)
    const sourceProfile = analyzePythonSurfaceProfile(filePath, sourceContent)

    const relevantTests = testProfiles.filter((testItem) => {
      return scorePythonTestRelevance(sourceProfile, testItem.profile, testItem.contentLower) >= 3
    })

    if (relevantTests.length > 0) {
      continue
    }

    const expectedTargetsTouched = expectedTestTargets.filter((token) => {
      return changedTestPathsLower.some((testPath) => testPath.includes(token))
    })

    const files = [filePath, ...context.testFiles]

    if (expectedTestTargets.length > 0 && expectedTargetsTouched.length === 0) {
      const key = `expected:${filePath}`
      if (seen.has(key)) {
        continue
      }
      seen.add(key)

      addFinding(
        createFinding({
          severity: "error",
          category: "validation",
          code: "py-source-test-relevance-missed-expected-targets",
          message: `Source-to-test relevance is weak: ${filePath} changed, but the changed tests (${context.testFiles.join(", ")}) do not include the declared expected test targets (${expectedTestTargets.join(", ")}).`,
          action: "Update the expected test targets or change the tests so they exercise the touched behavior surface.",
          files
        })
      )
      continue
    }

    const key = `weak:${filePath}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)

    addFinding(
      createFinding({
        severity: "warning",
        category: "validation",
        code: "py-source-test-relevance-weak",
        message: `Source-to-test relevance is weak: the changed tests (${context.testFiles.join(", ")}) do not appear to validate the behavior touched in ${filePath}.`,
        action: "Tighten the tests so that mention or cover the changed behavior surface more directly.",
        files
      })
    )
  }
}
