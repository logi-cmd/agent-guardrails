# OpenClaw Adapter

This is the smallest useful OpenClaw slice for `agent-guardrails`.

It does not add a custom binary integration. Instead, it gives OpenClaw users a ready-to-use instruction template and a clear workflow for using the repo-local guardrails already in this project.

## What it gives you

- A repo-local instruction template in [OPENCLAW.md](./OPENCLAW.md)
- A simple adoption flow that uses `init`, `plan`, and `check`
- A documented path to task contracts and base-ref checks

## Recommended flow

1. Initialize the repo with `agent-guardrails`, ideally with `--adapter openclaw`.
2. Use the OpenClaw instruction template to keep tasks bounded.
3. Run `agent-guardrails plan --task "<task>"` to write a task contract for the current task. Add narrower flags only when the task is especially small or risky.
4. Update `.agent-guardrails/evidence/current-task.md` with the task name, commands run, notable results, and residual risk or `none`, then run `check --base-ref origin/main --commands-run "npm test" --review` before finishing.

Example:

```bash
node ./bin/agent-guardrails.js init . --preset node-service --adapter openclaw
node ./bin/agent-guardrails.js plan --task "Add refund status transitions"
node ./bin/agent-guardrails.js check --base-ref origin/main --commands-run "npm test" --review
```

Use `agent-guardrails check --json` when OpenClaw is being orchestrated by automation or CI, not as the default local loop.

## Automation recipe

```yaml
- name: Run guardrails
  env:
    AGENT_GUARDRAILS_COMMANDS_RUN: npm test
  run: agent-guardrails check --base-ref origin/${{ github.event.repository.default_branch }} --json > agent-guardrails-report.json
```

## Best fit

OpenClaw works best here when it is used as the task-execution layer and `agent-guardrails` is the repo policy layer. That keeps the setup lightweight while still enforcing scope, test expectations, and CI-friendly diffs.
