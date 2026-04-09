/**
 * Lightweight in-memory session store for the chat API.
 * Active sessions are held in memory; completed sessions can be persisted
 * to disk so data survives process restarts.
 */

import fs from "node:fs";
import path from "node:path";
import { ensureDirectory } from "../utils.js";

const sessions = new Map();

const SESSIONS_DIR_RELATIVE = path.join(".agent-guardrails", "sessions");
const MAX_PERSISTED_SESSIONS = 20;

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const PURGE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

function createSessionId() {
  return `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Get or create a session.
 * @param {string} [id] - existing session id
 * @param {object} [init] - initial state for new sessions
 * @returns {{ id: string, data: object }}
 */
export function getSession(id, init = {}) {
  if (id) {
    const existing = sessions.get(id);
    if (existing && Date.now() - existing.createdAt < SESSION_TTL_MS) {
      return { id, data: existing.data };
    }

    // expired — remove
    sessions.delete(id);
  }

  const newId = createSessionId();
  const session = {
    data: {
      repoRoot: init.repoRoot || null,
      locale: init.locale || null,
      lastContractPath: null,
      messageCount: 0,
      ...init
    },
    createdAt: Date.now(),
    lastAccessedAt: Date.now()
  };

  sessions.set(newId, session);
  return { id: newId, data: session.data };
}

/**
 * Update session data.  Only provided keys are merged.
 */
export function updateSession(id, patch) {
  const session = sessions.get(id);
  if (!session) {
    return null;
  }

  Object.assign(session.data, patch);
  session.lastAccessedAt = Date.now();
  session.data.messageCount = (session.data.messageCount || 0) + 1;
  return session.data;
}

/**
 * Delete a session.
 */
export function deleteSession(id) {
  return sessions.delete(id);
}

/**
 * Purge expired sessions.  Call periodically if desired.
 */
export function purgeExpired() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

/**
 * Number of active sessions (for health check).
 */
export function activeSessionCount() {
  return sessions.size;
}

// --- Persistent session storage ---

function sessionsDir(repoRoot) {
  return path.join(repoRoot, SESSIONS_DIR_RELATIVE);
}

function sessionFilePath(repoRoot, sessionId) {
  return path.join(sessionsDir(repoRoot), `${sessionId}.json`);
}

function enforcePersistedSessionLimit(repoRoot) {
  const dir = sessionsDir(repoRoot);
  if (!fs.existsSync(dir)) return;

  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const fullPath = path.join(dir, f);
      try {
        const stat = fs.statSync(fullPath);
        return { name: f, mtime: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.mtime - b.mtime);

  while (files.length > MAX_PERSISTED_SESSIONS) {
    const oldest = files.shift();
    try { fs.unlinkSync(path.join(dir, oldest.name)); } catch { /* ignore */ }
  }
}

export function persistSession(repoRoot, sessionId, data) {
  const filePath = sessionFilePath(repoRoot, sessionId);
  ensureDirectory(path.dirname(filePath));
  const payload = { id: sessionId, createdAt: Date.now(), ...data };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  enforcePersistedSessionLimit(repoRoot);
}

export function loadPersistedSession(repoRoot, sessionId) {
  const filePath = sessionFilePath(repoRoot, sessionId);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

export function listPersistedSessions(repoRoot) {
  const dir = sessionsDir(repoRoot);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        return { id: data.id ?? f.replace(".json", ""), createdAt: data.createdAt, task: data.task ?? null };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

// Periodic session cleanup — prevents memory leak in long-running daemon
if (process.env.NODE_ENV !== "test") {
  const purgeTimer = setInterval(purgeExpired, PURGE_INTERVAL_MS);
  purgeTimer.unref?.();
}
