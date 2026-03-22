# Codex Adapter

Codex already uses `AGENTS.md` as a repository instruction surface, so the core `agent-guardrails` setup is enough for Codex to work well.

## What to use

- `AGENTS.md` for repo instructions
- `docs/PROJECT_STATE.md` for short-term project memory
- `.agent-guardrails/task-contract.json` for per-task scope

## Recommended flow

1. Initialize the repo with `agent-guardrails`.
2. Ask Codex to read `AGENTS.md` and project state first.
3. Run `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --intended-files "src/file.js,tests/file.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"`.
4. Implement within the task contract and keep `.agent-guardrails/evidence/current-task.md` updated with the task name, commands run, notable results, and residual risk or `none`.
5. Run `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`.

Example:

```bash
agent-guardrails plan --task "Add refund status transitions" --allow-paths "src/,tests/" --intended-files "src/orders/refund.js,tests/refund.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"
agent-guardrails check --base-ref origin/main --commands-run "npm test" --review
```

Use `agent-guardrails check --json` when Codex is being orchestrated by automation or CI, not as the default local workflow.

## Automation recipe

For GitHub Actions or another orchestrator, report the commands through `AGENT_GUARDRAILS_COMMANDS_RUN` and collect JSON output:

```yaml
- name: Run guardrails
  env:
    AGENT_GUARDRAILS_COMMANDS_RUN: npm test
  run: agent-guardrails check --base-ref origin/${{ github.event.repository.default_branch }} --json > agent-guardrails-report.json
```

Codex does not need a separate adapter file today because `AGENTS.md` is already the primary repo-level instruction file.
