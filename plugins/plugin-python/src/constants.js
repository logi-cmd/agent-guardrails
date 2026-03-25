/**
 * Python-specific constants for semantic detection
 */

// Python file extension
export const PYTHON_EXTENSION = ".py";

// Python role aliases (snake_case conventions)
export const PYTHON_ROLE_ALIASES = new Map([
  // Service layer
  ["service", "service"],
  ["services", "service"],

  // Helper/utility layer
  ["helper", "helper"],
  ["helpers", "helper"],
  ["util", "util"],
  ["utils", "util"],
  ["common", "util"],
  ["utility", "util"],

  // API/Router layer
  ["api", "api"],
  ["router", "router"],
  ["routers", "router"],
  ["route", "router"],
  ["routes", "router"],
  ["view", "view"],
  ["views", "view"],
  ["endpoint", "api"],
  ["handler", "handler"],
  ["handlers", "handler"],
  ["controller", "controller"],
  ["controllers", "controller"],

  // Data layer
  ["model", "model"],
  ["models", "model"],
  ["schema", "schema"],
  ["schemas", "schema"],
  ["repo", "repo"],
  ["repository", "repo"],
  ["repositories", "repo"],
  ["dao", "dao"],
  ["daos", "dao"],

  // Business logic
  ["manager", "manager"],
  ["managers", "manager"],
  ["engine", "engine"],
  ["engines", "engine"],
  ["processor", "processor"],
  ["processors", "processor"],

  // Client/Adapter layer
  ["client", "client"],
  ["clients", "client"],
  ["adapter", "adapter"],
  ["adapters", "adapter"],
  ["connector", "adapter"],
  ["connectors", "adapter"],

  // Configuration
  ["config", "config"],
  ["settings", "config"],
  ["constants", "config"],
  ["enums", "config"],

  // Testing
  ["test", "test"],
  ["tests", "test"],
  ["spec", "test"],
  ["specs", "test"],
  ["conftest", "test"]
]);

// Python test file signals
export const PYTHON_TEST_SIGNALS = {
  directories: ["tests", "test", "__tests__", "testing"],
  prefixes: ["test_"],
  suffixes: ["_test.py"],
  files: ["conftest.py"]
};

// Common Python path roots
export const COMMON_PYTHON_PATH_ROOTS = new Set([
  "src",
  "lib",
  "app",
  "apps",
  "packages",
  "server",
  "client",
  "api",
  "backend",
  "services",
  "tests",
  "test"
]);

// Token blacklist for filtering
export const TEST_TOKEN_BLACKLIST = new Set([
  "test",
  "tests",
  "spec",
  "specs",
  "__tests__",
  "testing"
]);

// Python regex patterns for parsing
export const PYTHON_PATTERNS = {
  // Function definition (including async)
  functionDef: /^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,

  // Class definition
  classDef: /^class\s+([A-Za-z_][A-Za-z0-9_]*)\s*[:\(]/,

  // Decorator
  decorator: /^@([A-Za-z_][A-Za-z0-9_\.]*)/,

  // FastAPI route decorator
  fastapiRoute: /@(?:router|app|APIRouter)\s*\.\s*(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/,

  // Import statement: import X
  importStatement: /^import\s+([A-Za-z_][A-Za-z0-9_\.]+(?:\s*,\s*[A-Za-z_][A-Za-z0-9_\.]+)*)/,

  // From import: from X import Y
  fromImport: /^from\s+([A-Za-z_][A-Za-z0-9_\.]*)\s+import\s+(.+)/,

  // Relative import: from .X import Y
  relativeImport: /^from\s+(\.+[A-Za-z_][A-Za-z0-9_\.]*)\s+import\s+(.+)/,

  // Type annotation
  typeAnnotation: /->\s*([A-Za-z_\[\],\s]+)$/,

  // Pydantic model
  pydanticModel: /^class\s+(\w+)\s*\(\s*(?:BaseModel|[\w\.]*Model)\s*\)/,

  // Public symbol (non _ prefix)
  publicSymbol: /^([A-Za-z][A-Za-z0-9_]*)\s*=/,

  // __all__ definition
  allExport: /^__all__\s*=\s*\[([^\]]+)\]/,

  // Constant (UPPER_CASE)
  constant: /^([A-Z][A-Z0-9_]*)\s*=/
};

// FastAPI-specific patterns
export const FASTAPI_PATTERNS = {
  // Router definition
  routerDef: /(?:router|APIRouter)\s*=\s*(?:APIRouter|Router)\s*\(/,

  // Route decorator with response model
  routeWithResponse: /@(?:router|app)\.(get|post|put|delete|patch)\s*\([^)]*response_model\s*=\s*(\w+)/,

  // Dependency injection
  dependency: /(?:Depends|depends)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/,

  // Path parameter
  pathParam: /\{(\w+)\}/
};

// pytest-specific patterns
export const PYTEST_PATTERNS = {
  // Test function
  testFunction: /^def\s+(test_[A-Za-z0-9_]*)\s*\(/,

  // pytest fixture
  fixture: /@pytest\.fixture/,

  // pytest parametrize
  parametrize: /@pytest\.mark\.parametrize/,

  // pytest skip
  skip: /@pytest\.mark\.skip/,

  // assert statement
  assertStmt: /\bassert\s+/
};
