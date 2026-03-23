# OpenClaw Pilot Record

Entry tier: Supplementary

## Pilot record

- Agent: `openclaw`
- Repo type: `bounded-scope-demo` OSS sandbox repo
- User background: `Unknown`
- Time from install to first successful chat: `Unknown`
- Did the user reach the first chat? `Yes`
- Where did the user stop or hesitate? `None`
- Was manual explanation needed? `No`
- Did the user fall back to CLI? `No`
- Did the agent stay on the canonical MCP flow? `Yes`
- Was the reviewer summary trusted? `Yes`
- Strongest friction: `OpenClaw still needs the MCP snippet pasted into the workspace settings before the first chat can happen`
- Most valuable feedback: `The bounded-scope sandbox can be prepared with the same setup-first runtime and repo-local helper files, and the first chat can complete with scoped changes and passing tests`
- Recommended next change: `Compare OpenClaw friction against Cursor, Claude Code, and Codex, then decide whether to remove or automate the last MCP paste step`
- Should this entry block the next release? `No`

## Pilot status

- Setup completed on `bounded-scope-demo`
- Repo-local helper file written: `OPENCLAW.md`
- MCP snippet generated for the OpenClaw workspace settings
- Repo-local MCP config support is now available through `--write-repo-config` as `.openclaw/mcp.json`
- First chat completed successfully in OpenClaw

## First chat result

- Output: `完成啦～✅`
- Modified files:
  - `src/app.js`
  - `tests/app.test.js`
- Change: added `bySeverity` statistics to `buildAuditSummary`
- Validation: all tests passed
- Reviewer summary: kept the change inside the demo scope and confirmed the output stayed low risk

## Fill-in order

1. Run `npx agent-guardrails setup --agent openclaw`
2. Paste the MCP snippet into the OpenClaw MCP configuration
3. Open OpenClaw and send the first chat prompt
4. Fill in the pilot record immediately after the first successful run

## Canonical flow check

- `read_repo_guardrails`
- `start_agent_native_loop`
- implementation
- `finish_agent_native_loop`
