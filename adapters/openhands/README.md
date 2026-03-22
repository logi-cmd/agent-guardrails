# OpenHands Adapter

OpenHands supports repository guidance through `.agents/skills`, so this adapter seeds a repo-level skill that tells OpenHands to use the `agent-guardrails` workflow.

## Seeded file

- `.agents/skills/agent-guardrails.md`

## Recommended flow

```bash
agent-guardrails init . --preset node-service --adapter openhands
```

Then:

1. Start OpenHands in the repo.
2. Let it load the repo skill and `AGENTS.md`.
3. Run `agent-guardrails plan --task "<task>" --allow-paths "src/,tests/" --intended-files "src/file.js,tests/file.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"`.
4. Update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`, then finish with `agent-guardrails check --base-ref origin/main --commands-run "npm test" --review`.

Example:

```bash
agent-guardrails plan --task "Add refund status transitions" --allow-paths "src/,tests/" --intended-files "src/orders/refund.js,tests/refund.test.js" --allowed-change-types "implementation-only" --required-commands "npm test" --evidence ".agent-guardrails/evidence/current-task.md"
agent-guardrails check --base-ref origin/main --commands-run "npm test" --review
```

Use `agent-guardrails check --json` for automation or CI orchestration, not as the main local workflow.

## Automation recipe

```yaml
- name: Run guardrails
  env:
    AGENT_GUARDRAILS_COMMANDS_RUN: npm test
  run: agent-guardrails check --base-ref origin/${{ github.event.repository.default_branch }} --json > agent-guardrails-report.json
```
