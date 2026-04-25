/**
 * AST-based TypeScript/JavaScript parser using @typescript-eslint/parser
 * This replaces the regex-based parsing for more accurate semantic analysis.
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let parse = null;
let simpleTraverse = null;

try {
  ({ parse } = require("@typescript-eslint/parser"));
  ({ simpleTraverse } = require("@typescript-eslint/typescript-estree"));
} catch {
  // Keep the plugin usable from a source checkout even when optional parser
  // dependencies are not installed. Detectors fall back to regex-based logic.
}

/**
 * Parse a TypeScript/JavaScript file and return the AST
 * @param {string} content - The file content
 * @param {string} filePath - The file path (used for error messages)
 * @returns {object|null} - The parsed AST or null if parsing fails
 */
export function parseFile(content, filePath) {
  if (!parse) return null;

  try {
    return parse(content, {
      filePath,
      ecmaVersion: 2022,
      sourceType: "module",
      allowAutomaticSingleRunInference: true,
      project: undefined, // Don't require tsconfig.json
      // Enable JSX for .tsx/.jsx files
      ...(filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
        ? { ecmaFeatures: { jsx: true } }
        : {})
    });
  } catch (error) {
    // Return null for parse errors (e.g., incomplete code during editing)
    return null;
  }
}

/**
 * Extract export declarations from AST
 * @param {object} ast - The parsed AST
 * @returns {Array<{type: string, names: string[], line: number}>}
 */
export function extractExports(ast) {
  if (!ast || !ast.body || !simpleTraverse) return [];

  const exports = [];

  simpleTraverse(ast, {
    enter(node) {
      switch (node.type) {
        case "ExportNamedDeclaration":
          if (node.declaration) {
            // export function foo() {} / export const bar = 1
            const decl = node.declaration;
            if (decl.type === "FunctionDeclaration" && decl.id) {
              exports.push({
                type: "function",
                names: [decl.id.name],
                line: node.loc?.start?.line || 0,
                async: decl.async || false
              });
            } else if (decl.type === "VariableDeclaration" && decl.declarations) {
              const names = decl.declarations
                .filter(d => d.id && d.id.type === "Identifier")
                .map(d => d.id.name);
              if (names.length > 0) {
                exports.push({
                  type: "variable",
                  names,
                  line: node.loc?.start?.line || 0
                });
              }
            } else if (decl.type === "ClassDeclaration" && decl.id) {
              exports.push({
                type: "class",
                names: [decl.id.name],
                line: node.loc?.start?.line || 0
              });
            } else if (decl.type === "TSEnumDeclaration" && decl.id) {
              exports.push({
                type: "enum",
                names: [decl.id.name],
                line: node.loc?.start?.line || 0
              });
            } else if (decl.type === "TSInterfaceDeclaration" && decl.id) {
              exports.push({
                type: "interface",
                names: [decl.id.name],
                line: node.loc?.start?.line || 0
              });
            } else if (decl.type === "TSTypeAliasDeclaration" && decl.id) {
              exports.push({
                type: "type",
                names: [decl.id.name],
                line: node.loc?.start?.line || 0
              });
            }
          } else if (node.specifiers && node.specifiers.length > 0) {
            // export { foo, bar }
            const names = node.specifiers
              .filter(s => s.exported && s.exported.type === "Identifier")
              .map(s => s.exported.name);
            if (names.length > 0) {
              exports.push({
                type: "named",
                names,
                line: node.loc?.start?.line || 0
              });
            }
          }
          break;

        case "ExportDefaultDeclaration":
          // export default foo / export default function() {}
          const names = ["default"];
          if (node.declaration) {
            if (node.declaration.type === "Identifier") {
              names.push(node.declaration.name);
            } else if (node.declaration.type === "FunctionDeclaration" && node.declaration.id) {
              names.push(node.declaration.id.name);
            } else if (node.declaration.type === "ClassDeclaration" && node.declaration.id) {
              names.push(node.declaration.id.name);
            }
          }
          exports.push({
            type: "default",
            names,
            line: node.loc?.start?.line || 0
          });
          break;

        case "ExportAllDeclaration":
          // export * from './module'
          exports.push({
            type: "reexport-all",
            names: ["*"],
            source: node.source?.value,
            line: node.loc?.start?.line || 0
          });
          break;

        case "TSExportAssignment":
          // export = foo (CommonJS style)
          if (node.expression && node.expression.type === "Identifier") {
            exports.push({
              type: "commonjs",
              names: [node.expression.name],
              line: node.loc?.start?.line || 0
            });
          }
          break;
      }
    }
  });

  return exports;
}

/**
 * Extract import declarations from AST
 * @param {object} ast - The parsed AST
 * @returns {Array<{source: string, specifiers: string[], line: number}>}
 */
export function extractImports(ast) {
  if (!ast || !ast.body || !simpleTraverse) return [];

  const imports = [];

  simpleTraverse(ast, {
    enter(node) {
      switch (node.type) {
        case "ImportDeclaration":
          if (node.source && typeof node.source.value === "string") {
            const specifiers = [];
            if (node.specifiers) {
              for (const spec of node.specifiers) {
                if (spec.type === "ImportDefaultSpecifier" && spec.local) {
                  specifiers.push(`default:${spec.local.name}`);
                } else if (spec.type === "ImportNamespaceSpecifier" && spec.local) {
                  specifiers.push(`*:${spec.local.name}`);
                } else if (spec.type === "ImportSpecifier" && spec.imported) {
                  const importedName = spec.imported.type === "Identifier"
                    ? spec.imported.name
                    : spec.imported.value;
                  specifiers.push(importedName);
                }
              }
            }
            imports.push({
              source: node.source.value,
              specifiers,
              line: node.loc?.start?.line || 0
            });
          }
          break;

        case "CallExpression":
          // require('module') or import('module')
          if (
            node.callee &&
            ((node.callee.type === "Identifier" && node.callee.name === "require") ||
             (node.callee.type === "Import"))
          ) {
            if (node.arguments && node.arguments[0]?.type === "Literal") {
              imports.push({
                source: node.arguments[0].value,
                specifiers: [],
                line: node.loc?.start?.line || 0,
                dynamic: true
              });
            }
          }
          break;
      }
    }
  });

  return imports;
}

/**
 * Extract declared symbols (functions, classes, variables, types) from AST
 * @param {object} ast - The parsed AST
 * @returns {Array<{name: string, type: string, line: number, exported: boolean}>}
 */
export function extractDeclaredSymbols(ast) {
  if (!ast || !ast.body || !simpleTraverse) return [];

  const symbols = [];

  simpleTraverse(ast, {
    enter(node, parent) {
      const isExported = parent?.type === "ExportNamedDeclaration" ||
                        parent?.type === "ExportDefaultDeclaration";

      switch (node.type) {
        case "FunctionDeclaration":
          if (node.id) {
            symbols.push({
              name: node.id.name,
              type: "function",
              line: node.loc?.start?.line || 0,
              exported: isExported,
              async: node.async || false
            });
          }
          break;

        case "ClassDeclaration":
          if (node.id) {
            symbols.push({
              name: node.id.name,
              type: "class",
              line: node.loc?.start?.line || 0,
              exported: isExported
            });
          }
          break;

        case "VariableDeclarator":
          if (node.id && node.id.type === "Identifier") {
            symbols.push({
              name: node.id.name,
              type: "variable",
              line: node.loc?.start?.line || 0,
              exported: isExported || parent?.parent?.type === "ExportNamedDeclaration"
            });
          }
          break;

        case "TSEnumDeclaration":
          if (node.id) {
            symbols.push({
              name: node.id.name,
              type: "enum",
              line: node.loc?.start?.line || 0,
              exported: isExported
            });
          }
          break;

        case "TSInterfaceDeclaration":
          if (node.id) {
            symbols.push({
              name: node.id.name,
              type: "interface",
              line: node.loc?.start?.line || 0,
              exported: isExported
            });
          }
          break;

        case "TSTypeAliasDeclaration":
          if (node.id) {
            symbols.push({
              name: node.id.name,
              type: "type",
              line: node.loc?.start?.line || 0,
              exported: isExported
            });
          }
          break;
      }
    }
  });

  return symbols;
}

/**
 * Extract function/method calls from AST
 * @param {object} ast - The parsed AST
 * @returns {Array<{name: string, line: number}>}
 */
export function extractFunctionCalls(ast) {
  if (!ast || !ast.body || !simpleTraverse) return [];

  const calls = [];

  simpleTraverse(ast, {
    enter(node) {
      if (node.type === "CallExpression") {
        let name = null;
        if (node.callee.type === "Identifier") {
          name = node.callee.name;
        } else if (node.callee.type === "MemberExpression" &&
                   node.callee.property?.type === "Identifier") {
          name = node.callee.property.name;
        }
        if (name) {
          calls.push({
            name,
            line: node.loc?.start?.line || 0
          });
        }
      }
    }
  });

  return calls;
}

/**
 * Detect pattern drift using AST analysis
 * This checks if a file introduces a new abstraction that parallels existing ones
 * @param {object} ast - The parsed AST
 * @param {string} filePath - The file path
 * @param {object} options - Options including knownPatterns
 * @returns {object|null} - Pattern drift info or null
 */
export function detectPatternDriftAST(ast, filePath, options = {}) {
  if (!ast || !ast.body) return null;

  const symbols = extractDeclaredSymbols(ast);
  const { knownPatterns = {} } = options;

  // Get the "stem" from the filename (e.g., "refund" from "refund_service.ts")
  const basename = filePath.split("/").pop().replace(/\.[^.]+$/, "");
  const parts = basename.split(/[-_]/);
  const stem = parts.slice(0, -1).join("_");
  const role = parts[parts.length - 1];

  if (!stem || !role) return null;

  // Check if this stem already has other roles defined
  const existingRoles = knownPatterns[stem] || [];
  const conflictingRoles = existingRoles.filter(r => r !== role);

  if (conflictingRoles.length === 0) return null;

  return {
    stem,
    newRole: role,
    existingRoles: conflictingRoles,
    symbols: symbols.filter(s => s.exported).map(s => s.name)
  };
}
