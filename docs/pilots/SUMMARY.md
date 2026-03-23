# Pilot Summary

Use this after the pilot runs you intend to rely on have real results recorded. The current run set includes completed sandbox chats for Claude Code, Codex, and OpenClaw, plus setup-only validation for Cursor and OpenHands.

## Coverage

- `claude-code`
- `cursor`
- `codex`
- `openhands`
- `openclaw`

## Summary by entry

### Claude Code

- Outcome: Completed sandbox chat with scoped changes, tests, evidence, and a reviewer summary.
- Main friction: Still requires opening Claude Code in a supported interactive environment.
- Did the user reach first chat? Yes
- Did the user trust the reviewer summary? Yes
- Should this entry block release? No

### Cursor

- Outcome: Setup-only validation completed on the sandbox repo.
- Main friction: Still requires the user to paste the MCP snippet and launch a supported interactive Cursor session.
- Did the user reach first chat? No
- Did the user trust the reviewer summary? Unknown
- Should this entry block release? No

### Codex

- Outcome: Completed sandbox chat with scoped changes, tests, evidence, and a reviewer summary.
- Main friction: Requires a manual paste into `~/.codex/config.toml` before the first chat can happen.
- Did the user reach first chat? Yes
- Did the user trust the reviewer summary? Yes
- Should this entry block release? No

### OpenHands

- Outcome: Setup-only validation completed on the sandbox repo.
- Main friction: Still requires the user to paste the MCP snippet into the OpenHands workspace settings and launch a supported interactive session.
- Did the user reach first chat? No
- Did the user trust the reviewer summary? Unknown
- Should this entry block release? No

### OpenClaw

- Outcome: Completed sandbox chat with scoped changes, tests, evidence, and a reviewer summary.
- Main friction: Still requires the user to paste the MCP snippet into the OpenClaw workspace settings before the first chat can happen.
- Did the user reach first chat? Yes
- Did the user trust the reviewer summary? Yes
- Should this entry block release? No

## Cross-entry findings

- Entries closest to "configure once, then chat": Claude Code, Codex, OpenClaw
- Entries still blocked by MCP config paste: Cursor, OpenHands, Codex
- Entries that fell back to CLI: None
- Reviewer summary trust notes: The completed sandbox chats returned reviewer summaries that were trusted and stayed inside the sandbox scope.
- Main recommendation: Keep setup-first as the product entry, keep the sandbox pilot docs ready, and only spend more friction work where the remaining MCP paste step is still a blocker.

## Release gate

- Ready for a post-pilot minor after one polish pass: Yes
- Why: The main value proposition is validated by three completed sandbox chats, and the remaining friction is now clearly isolated to the manual MCP paste step for some entries rather than the runtime itself.
