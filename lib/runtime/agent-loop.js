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
  bootstrapTaskSession,
  prepareFinishCheck,
  readRepoGuardrails,
  summarizeReviewRisks
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
    return null;
  }

  const sessionResult = bootstrapTaskSession({
    repoRoot,
    flags: { ...overrides, task },
    selectedFiles,
    changedFiles,
    locale
  });

  if (!sessionResult) {
    return null;
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

  return {
    guardrails: readRepoGuardrails(repoRoot, locale),
    contractPath: normalizedContractPath,
    contract,
    session: contract.session,
    evidenceFiles,
    finishCheck,
    loop: {
      status: "bootstrapped",
      nextActions: unique([
        ...(contract.session?.nextActions ?? []),
        ...(finishCheck.nextActions ?? [])
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
    return null;
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

  return {
    contractPath: normalizeRepoPath(contractPath),
    evidenceFiles,
    checkResult,
    reviewerSummary: summarizeReviewRisks(checkResult, locale)
  };
}
