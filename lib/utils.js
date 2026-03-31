import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..");
export const defaultTaskContractPath = ".agent-guardrails/task-contract.json";
export const supportedPresets = ["node-service", "nextjs", "python-fastapi", "monorepo"];
export const supportedAdapters = [
  "claude-code",
  "codex",
  "cursor",
  "gemini",
  "openhands",
  "opencode",
  "openclaw",
  "windsurf"
];

export function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, content, { force = false, append = false, appendMarker = null } = {}) {
  const exists = fs.existsSync(filePath);

  if (append && exists) {
    if (appendMarker && fs.readFileSync(filePath, "utf8").includes(`<!-- ${appendMarker}:start -->`)) {
      return false;
    }
    const markerStart = appendMarker ? `\n<!-- ${appendMarker}:start -->\n` : "";
    const markerEnd = appendMarker ? `\n<!-- ${appendMarker}:end -->\n` : "";
    ensureDirectory(path.dirname(filePath));
    fs.appendFileSync(filePath, `${markerStart}${content}${markerEnd}`, "utf8");
    return true;
  }

  if (force) {
    ensureDirectory(path.dirname(filePath));
    fs.writeFileSync(filePath, content, "utf8");
    return true;
  }

  if (exists) {
    return false;
  }

  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
  return true;
}

export function loadTemplate(relativePath, { locale = null } = {}) {
  if (locale) {
    const localizedPath = path.join(projectRoot, "templates", "locales", locale, relativePath);
    if (fs.existsSync(localizedPath)) {
      return readText(localizedPath);
    }
  }

  return readText(path.join(projectRoot, "templates", relativePath));
}

export function applyTemplate(template, replacements) {
  return Object.entries(replacements).reduce((output, [key, value]) => {
    return output.replaceAll(`{{${key}}}`, value);
  }, template);
}

export function loadJson(relativePath) {
  return JSON.parse(loadTemplate(relativePath));
}

export function parseCommaSeparatedList(value) {
  if (!value || value === true) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => normalizeRepoPath(item.trim()))
    .filter(Boolean);
}

export function parseStringList(value) {
  if (!value || value === true) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseAdapterList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeRepoPath(filePath) {
  return path.posix.normalize(filePath.replaceAll("\\", "/").replace(/^\.\//, "")).replace(/^\/+/, "");
}

export function readConfig(repoRoot) {
  const configPath = path.join(repoRoot, ".agent-guardrails", "config.json");
  if (!fs.existsSync(configPath)) {
    return null;
  }

  return JSON.parse(readText(configPath));
}

export function resolveTaskContractPath(repoRoot, customPath = defaultTaskContractPath) {
  return path.join(repoRoot, customPath);
}

export function readTaskContract(repoRoot, customPath = defaultTaskContractPath) {
  const contractPath = resolveTaskContractPath(repoRoot, customPath);
  if (!fs.existsSync(contractPath)) {
    return null;
  }

  const contract = JSON.parse(readText(contractPath));
  return {
    schemaVersion: contract.schemaVersion ?? 1,
    task: contract.task ?? "",
    preset: contract.preset ?? "",
    createdAt: contract.createdAt ?? null,
    allowedPaths: contract.allowedPaths ?? [],
    requiredCommands: contract.requiredCommands ?? [],
    evidencePaths: contract.evidencePaths ?? [],
    intendedFiles: contract.intendedFiles ?? [],
    protectedPaths: contract.protectedPaths ?? [],
    allowedChangeTypes: contract.allowedChangeTypes ?? [],
    riskLevel: contract.riskLevel ?? null,
    requiresReviewNotes: Boolean(contract.requiresReviewNotes),
    validationProfile: contract.validationProfile ?? "standard",
    securityRequirements: contract.securityRequirements ?? [],
    dependencyRequirements: contract.dependencyRequirements ?? [],
    performanceRequirements: contract.performanceRequirements ?? [],
    understandingRequirements: contract.understandingRequirements ?? [],
    continuityRequirements: contract.continuityRequirements ?? [],
    acknowledgedSkips: contract.acknowledgedSkips ?? [],
    patternSummary: contract.patternSummary ?? "",
    smallestViableChange: contract.smallestViableChange ?? "",
    assumptions: contract.assumptions ?? [],
    acceptanceCriteria: contract.acceptanceCriteria ?? [],
    nonGoals: contract.nonGoals ?? [],
    expectedBehaviorChanges: contract.expectedBehaviorChanges ?? [],
    userVisibleEffects: contract.userVisibleEffects ?? [],
    intendedSymbols: contract.intendedSymbols ?? [],
    expectedPublicSurfaceChanges: contract.expectedPublicSurfaceChanges ?? [],
    expectedBoundaryExceptions: contract.expectedBoundaryExceptions ?? [],
    expectedTestTargets: contract.expectedTestTargets ?? [],
    productionProfile: contract.productionProfile ?? "",
    nfrRequirements: contract.nfrRequirements ?? [],
    expectedLoadSensitivePaths: contract.expectedLoadSensitivePaths ?? [],
    expectedConcurrencyImpact: contract.expectedConcurrencyImpact ?? "",
    observabilityRequirements: contract.observabilityRequirements ?? [],
    rollbackNotes: contract.rollbackNotes ?? "",
    riskJustification: contract.riskJustification ?? "",
    ...contract
  };
}

export function writeTaskContract(repoRoot, contract, customPath = defaultTaskContractPath) {
  const contractPath = resolveTaskContractPath(repoRoot, customPath);
  ensureDirectory(path.dirname(contractPath));
  fs.writeFileSync(contractPath, `${JSON.stringify(contract, null, 2)}\n`, "utf8");
  return contractPath;
}

export function listChangedFiles(repoRoot) {
  const injected = process.env.AGENT_GUARDRAILS_CHANGED_FILES;
  if (injected) {
    return {
      files: injected
        .split(path.delimiter)
        .map((item) => item.trim())
        .filter(Boolean),
      error: null
    };
  }

  try {
    const output = execFileSync(
      "git",
      ["status", "--porcelain"],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );

    return {
      files: output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const normalized = line.slice(3).trim();
          if (normalized.includes(" -> ")) {
            return normalized.split(" -> ").at(-1);
          }
          return normalized;
        }),
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      files: [],
      error: `Unable to inspect working-tree changes. Run inside a git repository or pass --base-ref <ref>. ${message}`
    };
  }
}

export function listChangedFilesFromBaseRef(repoRoot, baseRef) {
  const injectedFiles = process.env.AGENT_GUARDRAILS_BASE_REF_CHANGED_FILES;
  const injectedError = process.env.AGENT_GUARDRAILS_BASE_REF_ERROR;

  if (injectedError) {
    return {
      files: [],
      error: injectedError
    };
  }

  if (injectedFiles) {
    return {
      files: injectedFiles
        .split(path.delimiter)
        .map((item) => item.trim())
        .filter(Boolean),
      error: null
    };
  }

  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );

    return {
      files: output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
      error: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      files: [],
      error: `Unable to diff against base ref "${baseRef}": ${message}`
    };
  }
}

export function isSourceFile(filePath, config) {
  const normalized = filePath.replaceAll("\\", "/");
  const extensions = config.checks.sourceExtensions ?? [];
  const roots = config.checks.sourceRoots ?? [];
  return roots.some((root) => normalized.startsWith(`${root}/`)) &&
    extensions.some((extension) => normalized.endsWith(extension));
}

export function isTestFile(filePath, config) {
  const normalized = normalizeRepoPath(filePath);
  const extensions = config.checks.testExtensions ?? [];
  const roots = config.checks.testRoots ?? [];
  const filenameSignals = config.checks.testFileSignals ?? [];

  const rootMatch = roots.some((root) => normalized.startsWith(`${root}/`));
  const extensionMatch = extensions.some((extension) => normalized.endsWith(extension));
  const filenameMatch = filenameSignals.some((signal) => normalized.includes(signal));

  return (rootMatch && extensionMatch) || filenameMatch;
}

export function normalizeAllowedScope(scope, repoRoot) {
  const normalized = normalizeRepoPath(scope);

  if (!normalized || normalized === ".") {
    return { kind: "all", value: "" };
  }

  if (normalized.endsWith("/**")) {
    return { kind: "directory", value: normalized.slice(0, -3) };
  }

  const absolutePath = path.join(repoRoot, scope);
  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
    return { kind: "directory", value: normalized.replace(/\/+$/, "") };
  }

  if (scope.endsWith("/")) {
    return { kind: "directory", value: normalized.replace(/\/+$/, "") };
  }

  return { kind: "file", value: normalized };
}

export function isPathWithinAllowedScope(filePath, scope, repoRoot) {
  const normalizedFile = normalizeRepoPath(filePath);
  const normalizedScope = normalizeAllowedScope(scope, repoRoot);

  if (normalizedScope.kind === "all") {
    return true;
  }

  if (normalizedScope.kind === "file") {
    return normalizedFile === normalizedScope.value;
  }

  return (
    normalizedFile === normalizedScope.value ||
    normalizedFile.startsWith(`${normalizedScope.value}/`)
  );
}

export function findOutOfScopeFiles(filePaths, allowedScopes, repoRoot) {
  if (!allowedScopes || allowedScopes.length === 0) {
    return [];
  }

  return filePaths.filter((filePath) => {
    return !allowedScopes.some((scope) => isPathWithinAllowedScope(filePath, scope, repoRoot));
  });
}

export function formatList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

export function getTopLevelEntry(filePath) {
  const normalized = normalizeRepoPath(filePath);
  return normalized.split("/")[0] || normalized;
}

export function unique(items) {
  return [...new Set(items)];
}

export function readTextIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readText(filePath);
}

export function getCheckSections(config) {
  const checks = config.checks ?? {};
  return {
    consistency: checks.consistency ?? {},
    correctness: checks.correctness ?? {},
    risk: checks.risk ?? {},
    review: config.review ?? {}
  };
}

export function getProtectedAreas(config) {
  return config.protectedAreas ?? [];
}

export function normalizeChangeType(value) {
  const normalized = String(value || "").trim().toLowerCase();

  if (!normalized) {
    return "";
  }

  if (normalized === "implementation-only") {
    return "implementation-only";
  }

  if (normalized === "interface-changing") {
    return "interface-changing";
  }

  return normalized;
}

/**
 * Read the agent-guardrails package.json version
 */
export function readOwnPackageJson() {
  const packageJsonPath = path.join(import.meta.dirname, "..", "package.json");
  try {
    const content = fs.readFileSync(packageJsonPath, "utf8");
    return JSON.parse(content);
  } catch {
    return { version: "unknown", name: "agent-guardrails" };
  }
}
