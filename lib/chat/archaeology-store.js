/**
 * File-based persistence for code archaeology notes.
 * Data survives process restarts and accumulates across sessions.
 * Storage location: .agent-guardrails/archaeology.json
 */

import fs from "node:fs";
import path from "node:path";
import { ensureDirectory } from "../utils.js";

const ARCHAELOGY_RELATIVE = path.join(".agent-guardrails", "archaeology.json");
const MAX_NOTES = 100;

function archaeologyPath(repoRoot) {
  return path.join(repoRoot, ARCHAELOGY_RELATIVE);
}

/**
 * Read the archaeology store from disk.
 * Returns a fresh structure when the file does not exist or is corrupted.
 */
function readStore(repoRoot) {
  const filePath = archaeologyPath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return { version: 1, notes: [], lastUpdated: null };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return {
      version: data.version ?? 1,
      notes: Array.isArray(data.notes) ? data.notes : [],
      lastUpdated: data.lastUpdated ?? null
    };
  } catch {
    // Corrupted JSON — log warning and start fresh
    console.warn(`[agent-guardrails] archaeology store corrupted, resetting: ${filePath}`);
    return { version: 1, notes: [], lastUpdated: null };
  }
}

/**
 * Write the archaeology store to disk.
 */
function writeStore(repoRoot, store) {
  const filePath = archaeologyPath(repoRoot);
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

/**
 * Load all archaeology notes for a repo.
 * @param {string} repoRoot
 * @returns {{ notes: Array, noteCount: number, lastUpdated: string|null }}
 */
export function loadArchaeology(repoRoot) {
  const store = readStore(repoRoot);
  return {
    notes: store.notes,
    noteCount: store.notes.length,
    lastUpdated: store.lastUpdated
  };
}

/**
 * Append a single archaeology note and persist to disk.
 * Enforces FIFO limit of 100 notes.
 * @param {string} repoRoot
 * @param {object} note
 * @returns {{ notes: Array, noteCount: number }}
 */
export function appendArchaeologyNote(repoRoot, note) {
  const store = readStore(repoRoot);

  const enriched = {
    id: note.id ?? `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: note.timestamp ?? new Date().toISOString(),
    ...note
  };

  store.notes.push(enriched);
  store.lastUpdated = enriched.timestamp;

  // FIFO — remove oldest when over limit
  while (store.notes.length > MAX_NOTES) {
    store.notes.shift();
  }

  writeStore(repoRoot, store);
  return { notes: store.notes, noteCount: store.notes.length };
}

/**
 * Clear all archaeology notes for a repo.
 * @param {string} repoRoot
 */
export function clearArchaeology(repoRoot) {
  writeStore(repoRoot, { version: 1, notes: [], lastUpdated: null });
}
