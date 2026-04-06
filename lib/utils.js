import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const projectRoot = path.resolve(__dirname, "..");
export const defaultTaskContractPath = ".agent-guardrails/task-contract.json";
export const supportedPresets = ["node-service", "nextjs", "python-fastapi", "monorepo", "static-frontend", "generic"];
export const supportedAdapters = [
  "claude-code",
  "codex",
  "cursor",
  "gemini",
  "opencode"
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

  let parsed;
  try {
    parsed = JSON.parse(readText(configPath));
  } catch (cause) {
    throw new Error(
      `agent-guardrails: Failed to parse config at ${configPath}: ${cause.message}`,
      { cause }
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `agent-guardrails: Config at ${configPath} must be a JSON object, got ${Array.isArray(parsed) ? "array" : typeof parsed}.`
    );
  }

  return parsed;
}

export function resolveTaskContractPath(repoRoot, customPath = defaultTaskContractPath) {
  return path.join(repoRoot, customPath);
}

function ensureArray(value, fieldName, contractPath) {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  throw new Error(
    `agent-guardrails: Task contract field "${fieldName}" must be an array, got ${typeof value} (in ${contractPath}).`
  );
}

function ensureStringOrNull(value, fieldName, contractPath) {
  if (value == null || typeof value === "string") {
    return value ?? "";
  }
  throw new Error(
    `agent-guardrails: Task contract field "${fieldName}" must be a string, got ${typeof value} (in ${contractPath}).`
  );
}

export function readTaskContract(repoRoot, customPath = defaultTaskContractPath) {
  const contractPath = resolveTaskContractPath(repoRoot, customPath);
  if (!fs.existsSync(contractPath)) {
    return null;
  }

  let contract;
  try {
    contract = JSON.parse(readText(contractPath));
  } catch (cause) {
    throw new Error(
      `agent-guardrails: Failed to parse task contract at ${contractPath}: ${cause.message}`,
      { cause }
    );
  }

  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    throw new Error(
      `agent-guardrails: Task contract at ${contractPath} must be a JSON object, got ${Array.isArray(contract) ? "array" : typeof contract}.`
    );
  }

  return {
    schemaVersion: typeof contract.schemaVersion === "number" ? contract.schemaVersion : 1,
    task: ensureStringOrNull(contract.task, "task", contractPath),
    preset: ensureStringOrNull(contract.preset, "preset", contractPath),
    createdAt: contract.createdAt ?? null,
    allowedPaths: ensureArray(contract.allowedPaths, "allowedPaths", contractPath),
    requiredCommands: ensureArray(contract.requiredCommands, "requiredCommands", contractPath),
    evidencePaths: ensureArray(contract.evidencePaths, "evidencePaths", contractPath),
    intendedFiles: ensureArray(contract.intendedFiles, "intendedFiles", contractPath),
    protectedPaths: ensureArray(contract.protectedPaths, "protectedPaths", contractPath),
    allowedChangeTypes: ensureArray(contract.allowedChangeTypes, "allowedChangeTypes", contractPath),
    riskLevel: contract.riskLevel ?? null,
    requiresReviewNotes: Boolean(contract.requiresReviewNotes),
    validationProfile: ensureStringOrNull(contract.validationProfile, "validationProfile", contractPath) || "standard",
    securityRequirements: ensureArray(contract.securityRequirements, "securityRequirements", contractPath),
    dependencyRequirements: ensureArray(contract.dependencyRequirements, "dependencyRequirements", contractPath),
    performanceRequirements: ensureArray(contract.performanceRequirements, "performanceRequirements", contractPath),
    understandingRequirements: ensureArray(contract.understandingRequirements, "understandingRequirements", contractPath),
    continuityRequirements: ensureArray(contract.continuityRequirements, "continuityRequirements", contractPath),
    acknowledgedSkips: ensureArray(contract.acknowledgedSkips, "acknowledgedSkips", contractPath),
    patternSummary: ensureStringOrNull(contract.patternSummary, "patternSummary", contractPath),
    smallestViableChange: ensureStringOrNull(contract.smallestViableChange, "smallestViableChange", contractPath),
    assumptions: ensureArray(contract.assumptions, "assumptions", contractPath),
    acceptanceCriteria: ensureArray(contract.acceptanceCriteria, "acceptanceCriteria", contractPath),
    nonGoals: ensureArray(contract.nonGoals, "nonGoals", contractPath),
    expectedBehaviorChanges: ensureArray(contract.expectedBehaviorChanges, "expectedBehaviorChanges", contractPath),
    userVisibleEffects: ensureArray(contract.userVisibleEffects, "userVisibleEffects", contractPath),
    intendedSymbols: ensureArray(contract.intendedSymbols, "intendedSymbols", contractPath),
    expectedPublicSurfaceChanges: ensureArray(contract.expectedPublicSurfaceChanges, "expectedPublicSurfaceChanges", contractPath),
    expectedBoundaryExceptions: ensureArray(contract.expectedBoundaryExceptions, "expectedBoundaryExceptions", contractPath),
    expectedTestTargets: ensureArray(contract.expectedTestTargets, "expectedTestTargets", contractPath),
    productionProfile: ensureStringOrNull(contract.productionProfile, "productionProfile", contractPath),
    nfrRequirements: ensureArray(contract.nfrRequirements, "nfrRequirements", contractPath),
    expectedLoadSensitivePaths: ensureArray(contract.expectedLoadSensitivePaths, "expectedLoadSensitivePaths", contractPath),
    expectedConcurrencyImpact: ensureStringOrNull(contract.expectedConcurrencyImpact, "expectedConcurrencyImpact", contractPath),
    observabilityRequirements: ensureArray(contract.observabilityRequirements, "observabilityRequirements", contractPath),
    rollbackNotes: ensureStringOrNull(contract.rollbackNotes, "rollbackNotes", contractPath),
    riskJustification: ensureStringOrNull(contract.riskJustification, "riskJustification", contractPath),
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
    const gitRoot = resolveGitRoot(repoRoot) || repoRoot;
    const output = execFileSync(
      "git",
      ["status", "--porcelain"],
      { cwd: gitRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );

    const prefix = gitRoot !== path.resolve(repoRoot)
      ? path.relative(gitRoot, repoRoot).replaceAll("\\", "/")
      : "";

    return {
      files: output
        .split(/\r?\n/)
        .filter((line) => line.trim())
        .map((line) => {
          const normalized = line.slice(3).trim();
          if (normalized.includes(" -> ")) {
            return normalized.split(" -> ").at(-1);
          }
          return normalized;
        })
        .filter((filePath) => !prefix || filePath.startsWith(prefix + "/"))
        .map((filePath) => prefix ? filePath.slice(prefix.length + 1) : filePath),
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

  const gitRoot = resolveGitRoot(repoRoot) || repoRoot;
  const prefix = gitRoot !== path.resolve(repoRoot)
    ? path.relative(gitRoot, repoRoot).replaceAll("\\", "/")
    : "";

  function parseDiffOutput(output) {
    return output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((filePath) => !prefix || filePath.startsWith(prefix + "/"))
      .map((filePath) => prefix ? filePath.slice(prefix.length + 1) : filePath);
  }

  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", `${baseRef}...HEAD`],
      { cwd: gitRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );

    return {
      files: parseDiffOutput(output),
      error: null
    };
  } catch (primaryError) {
    // Fallback: base-ref not found (e.g. no remote), try working-tree diff against HEAD
    try {
      const output = execFileSync(
        "git",
        ["diff", "--name-only", "--diff-filter=ACMR", "HEAD"],
        { cwd: gitRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );

      const files = parseDiffOutput(output);
      return {
        files,
        error: null,
        fallback: true,
        fallbackReason: `base-ref "${baseRef}" not found, fell back to working-tree diff (HEAD). For full baseline comparison, add a remote: git remote add origin <url> && git push -u origin <branch>.`
      };
    } catch (fallbackError) {
      const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
      return {
        files: [],
        error: `Unable to diff against base ref "${baseRef}": ${message}`
      };
    }
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
    security: checks.security ?? {},
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

/**
 * Resolve the git repository root from a starting directory.
 * Returns null if the directory is not inside a git repository.
 */
export function resolveGitRoot(startDir) {
  try {
    const output = execFileSync(
      "git",
      ["rev-parse", "--show-toplevel"],
      { cwd: startDir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    );
    const raw = output.trim();
    const resolved = path.resolve(raw);
    if (process.platform === "win32" && raw.startsWith("/") && !raw.startsWith("//")) {
      return path.resolve(raw.replace(/^\/([a-zA-Z])\//, "$1:/"));
    }
    return resolved;
  } catch {
    return null;
  }
}

/**
 * Resolve the correct repo root for agent-guardrails operations.
 *
 * Priority:
 * 1. If config exists at startDir → use startDir
 * 2. If config exists at git root (and git root ≠ startDir) → use git root
 * 3. Otherwise → return startDir (will error naturally downstream)
 *
 * This prevents the "parent directory detection" bug where a project
 * set up in a subdirectory of a larger git repo would incorrectly
 * use the parent's .git for change detection.
 */
export function resolveRepoRoot(startDir) {
  const configPath = path.join(startDir, ".agent-guardrails", "config.json");
  if (fs.existsSync(configPath)) {
    return startDir;
  }

  const gitRoot = resolveGitRoot(startDir);
  if (gitRoot && gitRoot !== path.resolve(startDir)) {
    const gitRootConfigPath = path.join(gitRoot, ".agent-guardrails", "config.json");
    if (fs.existsSync(gitRootConfigPath)) {
      return gitRoot;
    }
  }

  return startDir;
}
