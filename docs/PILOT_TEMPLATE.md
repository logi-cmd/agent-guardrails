# External Pilot Template

Last updated: 2026-03-24

Use this template for each real external pilot of the setup-first, MCP-first path.

If you want a ready-made record file instead of copying this template manually, use the matching file in `docs/pilots/`.

Pilot priority currently is:

- primary: `claude-code`
- secondary: `cursor`, `codex`
- supplementary: `openhands`, `openclaw`

All pilot entries should use:

- onboarding entry: `agent-guardrails setup --agent <name>`
- runtime loop:
  - `read_repo_guardrails`
  - `start_agent_native_loop`
  - implementation
  - `finish_agent_native_loop`

## Pilot record

### Agent

- `claude-code`
- `cursor`
- `codex`
- `openhands`
- `openclaw`

### Repo type

- Example: Node service, Next.js app, monorepo package, Python API

### User background

- Example: heavy vibe-coding user, staff engineer, indie hacker, reviewer-heavy team member

### First-run time

- Time from install to first successful chat:

### Did the user reach the first chat?

- Yes / No

### Where did the user stop or hesitate?

- install
- `setup`
- understanding the `setup` output
- MCP config paste
- first chat prompt
- reviewer summary

### Was manual explanation needed?

- Yes / No
- If yes, for which step?

### Did the user fall back to CLI?

- Yes / No
- If yes, which command?

### Did the agent stay on the canonical MCP flow?

- Yes / No / Unknown

### Was the reviewer summary trusted?

- Yes / No / Mixed
- Why?

### Strongest friction

- One sentence

### Most valuable feedback

- One sentence

### Recommended next change

- One sentence

### Entry tier

- Primary / Secondary / Supplementary

### Should this entry block the next release?

- Yes / No
- Why?

## Decision rule after the pilot

- If the user reached the first chat with only minor help, return to deeper runtime and risk-signal work.
- If MCP config paste was still the main blocker, keep reducing setup friction first.
- If the reviewer summary felt weak, improve the review surface before adding more detectors.
- If the user fell back to manual CLI, treat the entry path as not yet smooth enough.
