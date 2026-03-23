# Cursor Adapter

Cursor supports repository rules in `.cursor/rules`, so this adapter seeds a project rule that reinforces the `agent-guardrails` workflow.

## Seeded file

- `.cursor/rules/agent-guardrails.mdc`

## Recommended flow

```bash
agent-guardrails init . --preset node-service --adapter cursor
```

Then:

1. Open the repo in Cursor.
2. Let Cursor load the project rule alongside `AGENTS.md`.
3. Run `agent-guardrails plan --task "<task>"`.
4. Update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`, then finish with `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`.

Example:

```bash
agent-guardrails plan --task "Add refund status transitions"
agent-guardrails check --base-ref origin/main --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for automation or CI integrations, not as the primary local interaction.

## Automation recipe

```yaml
- name: Run guardrails
  env:
    AGENT_GUARDRAILS_COMMANDS_RUN: npm test
  run: agent-guardrails check --base-ref origin/${{ github.event.repository.default_branch }} --json > agent-guardrails-report.json
```
