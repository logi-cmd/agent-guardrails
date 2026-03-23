# Troubleshooting

## `agent-guardrails` is not found after install

If the global binary is not available in your shell yet, use `npx` first:

```bash
npx agent-guardrails help
```

This is the quickest cross-platform fallback on Windows, Linux, and macOS.

## `npm pack --dry-run` fails on Windows with a cache permission error

If you see an `EPERM` error under the default npm cache path, point npm at a repo-local cache and run the command again.

PowerShell:

```powershell
$env:npm_config_cache="$PWD\\.npm-cache"
npm pack --dry-run
```

This is the same approach used by the maintainer CI and install smoke script.

POSIX shells usually do not need this workaround, but if you want the same repo-local behavior you can run:

```bash
npm_config_cache="$PWD/.npm-cache" npm pack --dry-run
```

## `check` fails outside a git repository

`agent-guardrails check` inspects the working tree by default. If you run it outside a git repo, it will fail on purpose instead of pretending everything is fine.

Use one of these options:

- run it inside a git repository
- pass `--base-ref origin/main`
- in automation, prefer `check --json --base-ref origin/<default-branch>`

## `check` reports missing evidence files

If the task contract declares an evidence path, the file must exist before `check` passes.

The default docs-first path is:

```text
.agent-guardrails/evidence/current-task.md
```

Keep it short. It only needs:

- task name
- commands run
- notable results
- residual risk or `none`

## `check` reports missing `commands-run`

If the task contract declares `requiredCommands`, `check` expects those commands to be reported.

Local example:

```bash
agent-guardrails check --base-ref origin/main --commands-run "npm test,npm run lint"
```

Automation example:

```yaml
env:
  AGENT_GUARDRAILS_COMMANDS_RUN: npm test,npm run lint
```

Then run:

```bash
agent-guardrails check --base-ref origin/main --json
```

## My default branch is not `main`

Use the branch that matches your repository instead of copying `origin/main` literally.

Examples:

```bash
agent-guardrails check --base-ref origin/master --review
agent-guardrails check --base-ref origin/develop --json
```
