# Claude Code Pilot Record

Entry tier: Primary

中文说明：
这份记录页就是第一条真实 pilot 的落点。先用 Claude Code 跑通一整条链路，然后把实际结果填进来。

## Pilot record

- Agent: `claude-code`
- Repo type: `bounded-scope-demo` OSS sandbox repo
- User background: `Unknown`
- Time from install to first successful chat: `Unknown`
- Did the user reach the first chat? `Yes`
- Where did the user stop or hesitate? `None`
- Was manual explanation needed? `No`
- Did the user fall back to CLI? `No`
- Did the agent stay on the canonical MCP flow? `Yes`
- Was the reviewer summary trusted? `Yes`
- Strongest friction: `The setup-to-chat path is now close to direct, but the user still has to launch Claude Code in their own terminal`
- Most valuable feedback: `The sandbox run completed end-to-end with scoped code changes, tests, evidence, and a reviewer summary`
- Recommended next change: `Run the same setup-first flow for Cursor and Codex, then compare friction against Claude Code`
- Should this entry block the next release? `No`

## Pilot status

- Setup completed on `bounded-scope-demo`
- Repo-local MCP config written: `.mcp.json`
- `CLAUDE.md` seeded
- First chat step completed successfully in a supported Claude Code environment
- Official Claude Code CLI help is available, and setup completed successfully against the sandbox repo
- Sandbox task completed with reviewer summary output

## Canonical flow check

- `read_repo_guardrails`
- `start_agent_native_loop`
- implementation
- `finish_agent_native_loop`

## Fill-in order

1. Run `npx agent-guardrails setup --agent claude-code`
2. Paste the MCP snippet or use `--write-repo-config` if the target is safe and repo-local
3. Open Claude Code and send the first chat prompt
4. Fill in the pilot record immediately after the first successful run

## Pilot blocker notes

- The official `@anthropic-ai/claude-code` package is installed and its help output is reachable.
- The sandbox repo setup completed successfully with `--write-repo-config`.
- The first chat was completed in a supported interactive Claude Code environment and produced a reviewer summary.
