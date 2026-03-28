/**
 * Lightweight in-memory session store for the chat API.
 * Sessions are lost on process restart — this is intentional to keep the
 * runtime zero-dependency and the surface small.
 */

const sessions = new Map();

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

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
