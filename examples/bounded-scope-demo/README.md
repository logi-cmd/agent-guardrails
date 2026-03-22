# Bounded Scope Demo

This example repo shows how `agent-guardrails` catches an out-of-scope change and then passes once the change is corrected.

## What this demo proves

- The repo has a tiny app shape under `src/`
- Guardrail files are seeded locally in the example repo
- `plan` writes a machine-readable task contract with allowed paths, required commands, and evidence files
- `check` enforces that task contract against the changed files and declared execution proof
- The same check passes after the out-of-scope change is removed

## Layout

- `AGENTS.md` and `docs/PROJECT_STATE.md` provide repo memory
- `.agent-guardrails/config.json` sets the repo-level guardrails
- `src/` holds the example application code
- `tests/` holds the example test file
- `scenarios/` holds the failing and passing change manifests
- `scripts/run-demo.mjs` writes a temporary task contract and runs both scenarios against the root `agent-guardrails` CLI

## Run the demo

From this folder:

```bash
npm install
npm run demo:all
```

The demo runs two plan-and-check loops:

1. `demo:fail` writes a task contract that only allows `src/` and `tests/`, requires `npm test`, expects an evidence file, then simulates an AI-style change that also touches `infra/brainstorm.md`.
2. `demo:pass` writes the same task contract, reports the required command, keeps the evidence file in place, removes the out-of-scope file from the change set, and leaves only `src/` plus `tests/` changes.

Expected result:

- The first check fails with `Changed files outside task contract paths`
- The second check passes with `All baseline guardrail checks passed`

The happy path also includes:

1. create or update `.agent-guardrails/evidence/current-task.md`
2. run the required command
3. pass that command to `check --commands-run ...`

Example evidence note used in the pass scenario:

```md
# Task Evidence

- Task: Add audit summary coverage to the app without changing deployment notes.
- Commands run: npm test
- Notable results: Scope stayed inside src/ and tests/ and the required command was reported to check.
- Residual risk: none
```

## Why this is useful

This example is intentionally small. The repo-level config is broad enough to allow `infra/`, but the task contract is narrower and also expects proof that the required command ran. That makes the value visible: `plan` declares the task scope, runtime expectations, and evidence, and `check` enforces them without needing a heavyweight policy system.
