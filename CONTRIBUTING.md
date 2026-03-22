# Contributing

Thanks for helping improve `agent-guardrails`.

## Development setup

- Node.js `>=18`
- npm `>=9`
- No runtime dependencies are required for local development

Clone the repo and run:

```bash
npm install
```

## Local validation

Run these before opening a PR:

```bash
npm test
node ./examples/bounded-scope-demo/scripts/run-demo.mjs all
node ./bin/agent-guardrails.js help
```

For pack validation, use a repo-local npm cache so Windows permissions do not block the check.

PowerShell:

```powershell
$env:npm_config_cache="$PWD\\.npm-cache"
npm pack --dry-run
```

POSIX shells:

```bash
NPM_CONFIG_CACHE="$(pwd)/.npm-cache" npm pack --dry-run
```

For install smoke:

```bash
node ./tests/install-smoke.js
```

## Updating presets and adapters

When changing presets:

- update the matching file under `templates/presets/`
- confirm `plan` and `check` still behave correctly for the preset
- add or update tests if the preset changes heuristics

When changing adapters:

- update the seeded template under `templates/adapters/` if one exists
- update the human-facing docs under `adapters/`
- keep the local docs-first workflow and automation guidance aligned

## Maintainer notes

- The maintainer CI for this repo lives in `.github/workflows/guardrails.yml`.
- The seeded workflow for initialized user repos lives in `templates/base/workflows/agent-guardrails.yml`.
- Keep them distinct: maintainer CI validates this package, while the seeded workflow is an example end-user integration.

## Project memory discipline

- Update `docs/PROJECT_STATE.md` after meaningful progress.
- If the next concrete task changes, update `project-hub/NEXT_ACTIONS.md`.
- If the project focus or next step changes materially, update `project-hub/ACTIVE_PROJECTS.md`.
