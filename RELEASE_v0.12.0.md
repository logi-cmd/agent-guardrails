## v0.12.0 — Harness Engineering Audit Fixes

### Critical
- **Bash file-write interception**: Claude Code hooks now intercept `sed -i`, `tee`, `echo >`, `>>`, `mv`, `cp` via the Bash tool, closing the largest harness gap

### High
- **Circuit breaker**: Daemon worker stops retrying after 5 consecutive failures (60s cooldown)
- **State-hash dedup**: Daemon skips re-check when file set unchanged since last successful check
- **Structured errors**: Agent loop returns `{ error: true, code, message }` instead of `null`
- **Session purge**: `purgeExpired()` now runs every 10 minutes, preventing memory leaks

### Medium
- **Review buckets**: `continuity` and `performance` findings now appear in review output

### Files Changed (10)
- `templates/hooks/claude-code-pre-tool.cjs`: Add Bash tool file-write interception
- `templates/hooks/claude-code-post-tool.cjs`: Add Bash to tool filter
- `lib/chat/session.js`: Wire up purgeExpired() on 10min interval
- `lib/check/review.js`: Add continuity/performance buckets
- `lib/daemon/worker.js`: Add circuit breaker + state-hash dedup
- `lib/runtime/agent-loop.js`: Structured error objects
- `lib/mcp/server.js`: Handle structured errors
- `README.md` + `docs/PROJECT_STATE.md`: Updated with harness priorities

### NPM
```
npm install agent-guardrails@0.12.0
```

**Full Changelog**: https://github.com/logi-cmd/agent-guardrails/compare/v0.11.0...v0.12.0