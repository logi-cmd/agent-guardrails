/**
 * Python Semantic Detection Plugin for agent-guardrails
 *
 * Provides 4 core detectors:
 * - py-pattern-drift: Detect parallel abstractions
 * - py-interface-drift: Detect undeclared public surface changes
 * - py-boundary-violation: Detect cross-layer import violations
 * - py-source-test-relevance: Detect test-to-source relevance
 */
import path from "node:path";
import fs from "node:fs";

import {
  PYTHON_ROLE_ALIASES,
} from "./src/constants.js";

import {
  toPosixPath,
  isPythonFile,
  isPythonTestFile,
  isPythonSourceFile,
  hasScopeMatch,
  unique
} from "./src/utils/path.js";

import {
  splitTokens,
  normalizeRolelessTokens
} from "./src/utils/tokens.js";

import {
  readFileContent,
  extractPublicSurfaceSignals,
  extractImportSpecifiers,
  extractDeclaredSymbolTokens,
  extractFastAPIRoutes,
  hasPytestTests
} from "./src/utils/python-parser.js";

import { detectPatternDrift } from "./src/detectors/pattern-drift.js";
import { detectInterfaceDrift } from "./src/detectors/interface-drift.js";
import { detectBoundaryViolation } from "./src/detectors/boundary-violation.js";
import { detectSourceTestRelevance } from "./src/detectors/source-test-relevance.js";

// ============================================================================
// Plugin Export
// ============================================================================

/**
 * Get all Python semantic detectors
 * @returns {Array} Array of detector objects
 */
export async function getDetectors() {
  return [
    {
      name: "py-pattern-drift",
      run: detectPatternDrift
    },
    {
      name: "py-interface-drift",
      run: detectInterfaceDrift
    },
    {
      name: "py-boundary-violation",
      run: detectBoundaryViolation
    },
    {
      name: "py-source-test-relevance",
      run: detectSourceTestRelevance
    }
  ];
}

// Export utilities for external use
export {
  extractPublicSurfaceSignals,
  extractFastAPIRoutes,
  extractImportSpecifiers,
  isPythonTestFile,
  PYTHON_ROLE_ALIASES
};
