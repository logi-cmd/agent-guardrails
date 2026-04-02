import fs from "node:fs";
import path from "node:path";
import { executeCheck } from "../commands/check.js";
import {
  defaultTaskContractPath,
  ensureDirectory,
  normalizeRepoPath,
  readTaskContract,
  writeTaskContract
} from "../utils.js";
import {
  buildContinuitySummary,
  bootstrapTaskSession,
  prepareFinishCheck,
  readRepoGuardrails,
  summarizeReviewRisks,
  generatePrecisionPrompts
} from "./service.js";
function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeLines(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (value == null) {
    return [];
  }

  return [String(value).trim()].filter(Boolean);
}

function renderEvidenceNote({ task, commandsRun, notableResults, reviewNotes, residualRisk }) {
  const lines = [
    "# Task Evidence",
    "",
    `- Task: ${task || "Unknown"}`,
    `- Commands run: ${commandsRun.length > 0 ? commandsRun.join(", ") : "pending"}`,
    `- Notable results: ${notableResults.length > 0 ? notableResults.join(" | ") : "pending"}`,
    `- Review notes: ${reviewNotes.length > 0 ? reviewNotes.join(" | ") : "pending"}`,
    `- Residual risk: ${residualRisk || "pending"}`,
    ""
  ];

  return `${lines.join("\n")}`;
}

function ensureEvidenceFiles({ repoRoot, contract }) {
  return (contract.evidencePaths ?? []).map((relativePath) => {
    const normalizedPath = normalizeRepoPath(relativePath);
    const absolutePath = path.join(repoRoot, relativePath);
    const existed = fs.existsSync(absolutePath);

    if (!existed) {
      ensureDirectory(path.dirname(absolutePath));
      fs.writeFileSync(
        absolutePath,
        renderEvidenceNote({
          task: contract.task,
          commandsRun: [],
          notableResults: [],
          reviewNotes: [],
          residualRisk: ""
        }),
        "utf8"
      );
    }

    return {
      path: normalizedPath,
      existed,
      created: !existed
    };
  });
}

function writeEvidenceUpdate({ repoRoot, contract, evidence, commandsRun }) {
  const evidencePaths = contract.evidencePaths ?? [];
  if (evidencePaths.length === 0) {
    return [];
  }

  const task = String(evidence?.task || contract.task || "").trim();
  const effectiveCommands = unique([
    ...commandsRun,
    ...normalizeLines(evidence?.commandsRun)
  ]);
  const notableResults = normalizeLines(evidence?.notableResults);
  const reviewNotes = normalizeLines(evidence?.reviewNotes);
  const residualRisk = String(evidence?.residualRisk || "none").trim();

  return evidencePaths.map((relativePath) => {
    const absolutePath = path.join(repoRoot, relativePath);
    ensureDirectory(path.dirname(absolutePath));
    fs.writeFileSync(
      absolutePath,
      renderEvidenceNote({
        task,
        commandsRun: effectiveCommands,
        notableResults,
        reviewNotes,
        residualRisk
      }),
      "utf8"
    );

    return {
      path: normalizeRepoPath(relativePath),
      updated: true
    };
  });
}

export function startAgentNativeLoop({
  repoRoot,
  taskRequest,
  selectedFiles = [],
  changedFiles = [],
  overrides = {},
  contractPath = defaultTaskContractPath,
  locale = null,
  writeFiles = true
}) {
  const task = String(taskRequest || "").trim();
  if (!task) {
    return {
      error: true,
      code: "MISSING_TASK",
      message: "Could not start agent loop. taskRequest is required and must not be empty."
    };
  }

  const sessionResult = bootstrapTaskSession({
    repoRoot,
    flags: { ...overrides, task },
    selectedFiles,
    changedFiles,
    locale
  });

  if (!sessionResult) {
    return {
      error: true,
      code: "MISSING_CONFIG",
      message: "Could not bootstrap task session. Ensure .agent-guardrails/config.json exists and contains valid checks configuration."
    };
  }

  const contract = {
    schemaVersion: 3,
    createdAt: new Date().toISOString(),
    ...sessionResult.contract
  };
  const normalizedContractPath = normalizeRepoPath(contractPath);
  const evidenceFiles = writeFiles
    ? ensureEvidenceFiles({ repoRoot, contract })
    : (contract.evidencePaths ?? []).map((relativePath) => ({
      path: normalizeRepoPath(relativePath),
      existed: fs.existsSync(path.join(repoRoot, relativePath)),
      created: false
    }));

  if (writeFiles) {
    writeTaskContract(repoRoot, contract, contractPath);
  }

  const finishCheck = prepareFinishCheck({
    repoRoot,
    session: contract.session,
    locale
  });
  const continuity = buildContinuitySummary({
    taskContract: contract,
    changedFiles: contract.session?.changedFiles ?? [],
    findings: [],
    review: { summary: { consistencyConcerns: 0 } },
    protectedAreaMatches: [],
    locale
  });

  return {
    guardrails: readRepoGuardrails(repoRoot, locale),
    contractPath: normalizedContractPath,
    contract,
    session: contract.session,
    evidenceFiles,
    finishCheck,
    continuity,
    loop: {
      status: "bootstrapped",
      reuseTargets: continuity.reuseTargets,
      nextActions: unique([
        ...(contract.session?.nextActions ?? []),
        ...(finishCheck.nextActions ?? []),
        ...(continuity.nextActions ?? [])
      ])
    }
  };
}

export async function finishAgentNativeLoop({
  repoRoot,
  contractPath = defaultTaskContractPath,
  commandsRun = [],
  baseRef = "",
  evidence = null,
  locale = null
}) {
  const contract = readTaskContract(repoRoot, contractPath);
  if (!contract) {
    return {
      error: true,
      code: "MISSING_CONTRACT",
      message: "Could not finish agent loop. Ensure a task contract exists (run start_agent_native_loop first)."
    };
  }

  const normalizedCommands = unique(commandsRun.map((item) => String(item).trim()).filter(Boolean));
  const evidenceFiles = evidence && typeof evidence === "object"
    ? writeEvidenceUpdate({
      repoRoot,
      contract,
      evidence,
      commandsRun: normalizedCommands
    })
    : [];

  const flags = {
    review: true
  };

  if (contractPath && contractPath !== defaultTaskContractPath) {
    flags["contract-path"] = contractPath;
  }
  if (baseRef) {
    flags["base-ref"] = String(baseRef);
  }
  if (normalizedCommands.length > 0) {
    flags["commands-run"] = normalizedCommands.join(",");
  }

  const checkResult = await executeCheck({
    repoRoot,
    flags,
    locale,
    suppressExitCode: true
  });

  const precisionPrompts = generatePrecisionPrompts({
    findings: (checkResult?.findings ?? []),
    taskContract: contract,
    locale
  });

  return {
    contractPath: normalizeRepoPath(contractPath),
    evidenceFiles,
    checkResult,
    reviewerSummary: summarizeReviewRisks(checkResult, locale),
    precisionPrompts
  };
}

export async function persistArchaeologyFromFinish({ repoRoot, contract, checkResult, locale }) {
  try {
    const { appendArchaeologyNote } = await import("../chat/archaeology-store.js");
    const changedFiles = (checkResult?.changedFiles || []).map(f =>
      typeof f === "string" ? { path: f, changeType: "unknown" } : f
    );

    if (changedFiles.length === 0) return null;

    const note = {
      timestamp: new Date().toISOString(),
      sessionId: contract?.session?.sessionId || null,
      task: contract?.task || "",
      files: changedFiles.map(f => ({
        path: f.path,
        changeType: f.type || f.changeType || "unknown",
        nature: "unknown"
      })),
      totalAdditions: 0,
      totalDeletions: 0,
      riskIndicators: (checkResult?.findings || [])
        .filter(f => f.severity === "error" || f.severity === "warning")
        .map(f => f.code)
        .slice(0, 5),
      summary: contract?.task || "Task completed"
    };

    return appendArchaeologyNote(repoRoot, note);
  } catch {
    return null;
  }
}
