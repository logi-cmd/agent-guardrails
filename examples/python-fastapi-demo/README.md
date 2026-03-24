# Python FastAPI Demo

This example repo shows that the `python-fastapi` preset is not just a preset name.
It can already drive the same bounded task, evidence, reviewer summary, deploy-readiness, and post-deploy maintenance flow that the OSS runtime uses elsewhere.

## What this demo proves

- the Python/FastAPI preset can shape a bounded task contract
- `check --review` can block a production-shaped Python change when observability or rollback coverage is incomplete
- the same runtime can mark a Python change as deploy-ready once validation, observability, and rollback notes are explicit

## Layout

- `AGENTS.md` documents the repo-local working rules
- `.agent-guardrails/config.json` holds the Python/FastAPI preset and repo policy
- `app/api/` holds the example FastAPI-style endpoint module
- `tests/` holds the matching pytest-style test file
- `scenarios/` defines the failing and passing runs
- `scripts/run-demo.mjs` writes a temporary contract and runs the review flow

## Run the demo

From this folder:

```bash
npm install
npm run demo:all
```

The demo runs two scenarios:

1. `demo:fail` declares a production-shaped Python task but omits explicit observability and rollback coverage from the evidence note, so deploy-readiness stays blocked.
2. `demo:pass` uses the same bounded Python task but includes explicit validation, observability, and rollback notes, so the runtime can return `Safe to deploy`.

Expected result:

- the fail scenario is still `ok`, but its deploy-readiness is blocked and the output includes operator next actions
- the pass scenario is `ok` and returns a reviewer-facing deploy-readiness surface plus post-deploy maintenance guidance

## Why this matters

This demo is intentionally baseline-only.
It does not claim Python semantic parity with TypeScript / JavaScript.
It proves that Python/FastAPI already belongs in the same repo-aware runtime path and can produce a production-shaped OSS review surface today.
