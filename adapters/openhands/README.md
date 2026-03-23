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
3. Start with `agent-guardrails plan --task "<task>"` and let the runtime fill the common contract defaults.
4. Update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`, then finish with the `agent-guardrails check ... --review` command the runtime recommends.

Example:

```bash
agent-guardrails plan --task "Add refund status transitions"
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
