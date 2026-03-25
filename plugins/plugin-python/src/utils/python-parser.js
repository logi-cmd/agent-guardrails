/**
 * Python code parsing utilities using regex patterns
 */
import { PYTHON_PATTERNS, FASTAPI_PATTERNS, PYTEST_PATTERNS } from "../constants.js";
import { splitTokens, isPublicName } from "./tokens.js";
import { unique } from "./path.js";

/**
 * Read file content from repository
 * @param {string} repoRoot - Repository root path
 * @param {string} filePath - Relative file path
 * @returns {string} File content or empty string
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Read file content from repository
 * @param {string} repoRoot - Repository root path
 * @param {string} filePath - Relative file path
 * @returns {string} File content or empty string
 */
export function readFileContent(repoRoot, filePath) {
  try {
    return fs.readFileSync(path.join(repoRoot, filePath), "utf8");
  } catch {
    return "";
  }
}

/**
 * Extract Python function definitions from content
 * @param {string} content - Python source code
 * @returns {Array} Array of function info objects
 */
export function extractFunctionDefs(content) {
  const lines = content.split(/\r?\n/);
  const functions = [];
  let currentDecorators = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect decorators
    const decoratorMatch = trimmed.match(/^@([A-Za-z_][A-Za-z0-9_\.]*)/);
    if (decoratorMatch) {
      currentDecorators.push(decoratorMatch[1]);
      continue;
    }

    // Function definition (including async)
    const funcMatch = trimmed.match(/^(async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (funcMatch) {
      functions.push({
        name: funcMatch[2],
        isAsync: !!funcMatch[1],
        decorators: [...currentDecorators],
        isPublic: isPublicName(funcMatch[2])
      });
    }

    // Reset decorators if not a decorator or function line
    if (!trimmed.startsWith("@") && !trimmed.match(/^(async\s+)?def\s+/)) {
      currentDecorators = [];
    }
  }

  return functions;
}

/**
 * Extract Python class definitions from content
 * @param {string} content - Python source code
 * @returns {Array} Array of class info objects
 */
export function extractClassDefs(content) {
  const lines = content.split(/\r?\n/);
  const classes = [];
  let currentDecorators = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Collect decorators
    const decoratorMatch = trimmed.match(/^@([A-Za-z_][A-Za-z0-9_\.]*)/);
    if (decoratorMatch) {
      currentDecorators.push(decoratorMatch[1]);
      continue;
    }

    // Class definition
    const classMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\(]/);
    if (classMatch) {
      classes.push({
        name: classMatch[1],
        decorators: [...currentDecorators],
        isPublic: isPublicName(classMatch[1])
      });
    }

    currentDecorators = [];
  }

  return classes;
}

/**
 * Extract Python import specifiers from content
 * @param {string} content - Python source code
 * @returns {Array} Array of import specifier objects
 */
export function extractImportSpecifiers(content) {
  const specifiers = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    // from X import Y
    const fromMatch = trimmed.match(/^from\s+([A-Za-z_][A-Za-z0-9_\.]*)\s+import\s+(.+)/);
    if (fromMatch) {
      const module = fromMatch[1];
      const names = fromMatch[2]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      specifiers.push({
        module,
        names,
        type: "from-import",
        isRelative: module.startsWith(".")
      });
      continue;
    }

    // import X
    const importMatch = trimmed.match(/^import\s+(.+)/);
    if (importMatch) {
      const modules = importMatch[1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      specifiers.push({
        module: modules[0],
        names: modules,
        type: "import",
        isRelative: false
      });
    }
  }

  return specifiers;
}

/**
 * Extract FastAPI routes from content
 * @param {string} content - Python source code
 * @returns {Array} Array of route info objects
 */
export function extractFastAPIRoutes(content) {
  const lines = content.split(/\r?\n/);
  const routes = [];
  let currentDecorators = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // FastAPI route decorator: @router.get("/path") or @app.post("/path")
    const routeMatch = trimmed.match(/@(?:router|app|APIRouter)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/);
    if (routeMatch) {
      currentDecorators.push({
        method: routeMatch[1].toUpperCase(),
        path: routeMatch[2]
      });
      continue;
    }

    // Following function definition
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (funcMatch && currentDecorators.length > 0) {
      for (const dec of currentDecorators) {
        routes.push({
          name: funcMatch[1],
          method: dec.method,
          path: dec.path
        });
      }
      currentDecorators = [];
    }

    // Reset if not a decorator or function
    if (!trimmed.startsWith("@") && !trimmed.match(/^(async\s+)?def\s+/)) {
      currentDecorators = [];
    }
  }

  return routes;
}

/**
 * Extract Pydantic models from content
 * @param {string} content - Python source code
 * @returns {Array} Array of model info objects
 */
export function extractPydanticModels(content) {
  const lines = content.split(/\r?\n/);
  const models = [];
  let currentClass = null;
  let fields = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Pydantic model definition: class X(BaseModel) or class X(pydantic.BaseModel)
    const classMatch = trimmed.match(/^class\s+(\w+)\s*\(\s*(?:BaseModel|[\w\.]*Model)\s*\)/);
    if (classMatch) {
      if (currentClass) {
        models.push({ name: currentClass, fields });
      }
      currentClass = classMatch[1];
      fields = [];
      continue;
    }

    if (currentClass) {
      // Field definition: name: Type or name: Type = default
      const fieldMatch = trimmed.match(/^(\w+)\s*:\s*(.+)/);
      if (fieldMatch && !fieldMatch[1].startsWith("_") && !fieldMatch[1].startsWith("class ")) {
        const fieldType = fieldMatch[2].split("=")[0].trim();
        fields.push({
          name: fieldMatch[1],
          type: fieldType
        });
      }

      // Class ends at next non-indented class or function
      if (trimmed.startsWith("class ") || trimmed.startsWith("def ")) {
        if (!trimmed.startsWith(" ") && !trimmed.startsWith("\t")) {
          models.push({ name: currentClass, fields });
          currentClass = null;
          fields = [];
        }
      }
    }
  }

  if (currentClass) {
    models.push({ name: currentClass, fields });
  }

  return models;
}

/**
 * Extract public surface signals from Python content
 * @param {string} content - Python source code
 * @returns {Array} Array of public surface entries
 */
export function extractPublicSurfaceSignals(content) {
  const lines = content.split(/\r?\n/);
  const entries = [];
  let currentDecorators = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    // Collect decorators
    const decoratorMatch = trimmed.match(/^@([A-Za-z_][A-Za-z0-9_\.]*)/);
    if (decoratorMatch) {
      currentDecorators.push(decoratorMatch[1]);
      continue;
    }

    // __all__ definition
    const allMatch = trimmed.match(/^__all__\s*=\s*\[([^\]]+)\]/);
    if (allMatch) {
      const names = allMatch[1]
        .split(",")
        .map((s) => s.trim().replace(/['"]/g, ""))
        .filter(Boolean);
      entries.push({
        line: trimmed,
        names,
        decorators: [],
        isPublic: true,
        isAllExport: true
      });
      currentDecorators = [];
      continue;
    }

    // Function definition (including async)
    const funcMatch = trimmed.match(/^(async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (funcMatch) {
      entries.push({
        line: trimmed,
        names: [funcMatch[2]],
        decorators: [...currentDecorators],
        isPublic: isPublicName(funcMatch[2])
      });
      currentDecorators = [];
      continue;
    }

    // Class definition
    const classMatch = trimmed.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\(]/);
    if (classMatch) {
      entries.push({
        line: trimmed,
        names: [classMatch[1]],
        decorators: [...currentDecorators],
        isPublic: isPublicName(classMatch[1])
      });
      currentDecorators = [];
      continue;
    }

    // Top-level constant (UPPER_CASE)
    const constMatch = trimmed.match(/^([A-Z][A-Z0-9_]*)\s*=/);
    if (constMatch) {
      entries.push({
        line: trimmed,
        names: [constMatch[1]],
        decorators: [],
        isPublic: true
      });
      currentDecorators = [];
      continue;
    }

    // Reset decorators
    currentDecorators = [];
  }

  return entries;
}

/**
 * Extract declared symbol tokens from Python content
 * @param {string} content - Python source code
 * @returns {string[]} Array of symbol tokens
 */
export function extractDeclaredSymbolTokens(content) {
  const tokens = [];
  const patterns = [
    /\b(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\bclass\s+([A-Za-z_][A-Za-z0-9_]*)/g,
    /\b([A-Z][A-Z0-9_]*)\s*=/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      tokens.push(...splitTokens(match[1]));
    }
  }

  return unique(tokens);
}

/**
 * Check if content has pytest test functions
 * @param {string} content - Python source code
 * @returns {boolean} True if has test functions
 */
export function hasPytestTests(content) {
  return /\bdef\s+test_/.test(content) || /@pytest\.fixture/.test(content);
}
