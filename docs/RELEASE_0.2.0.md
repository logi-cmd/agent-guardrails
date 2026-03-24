# agent-guardrails v0.2.0

`agent-guardrails` is a production-safety runtime for AI coding workflows.

This release expands the OSS runtime from a reviewer-friendly merge gate into a clearer production-readiness surface, while shipping the first Python/FastAPI proof path.

The goal of this release is to make three things more obvious:

1. the OSS runtime can now say more than "pass/fail"
2. Python users now have a real baseline proof path instead of only a preset name
3. deployment orchestration is still intentionally later than deploy-readiness judgment

## What changed

- Stabilized the shared OSS reviewer surface so CLI, MCP, and agent-native outputs now converge on:
  - `verdict`
  - `deployReadiness`
  - `postDeployMaintenance`
- Tightened deploy-readiness logic so true deploy blockers stay separate from "watch this after deploy" warnings
- Added a runnable Python/FastAPI sandbox demo:
  - `examples/python-fastapi-demo`
- Added the first Python/FastAPI OSS benchmark scenario:
  - `python-fastapi-deploy-ready-pass`
- Updated the README and proof docs so the support boundary is clearer:
  - deepest support today remains JavaScript / TypeScript
  - Python/FastAPI now has a baseline runtime + production-readiness proof path
  - deeper Python semantic support is still planned, not shipped

## Why it matters

This release is not about claiming full Python semantic parity.

It is about making the product feel more credible in two important ways:

- the OSS runtime can now express deploy-readiness and post-deploy maintenance judgment directly
- Python users can now see a real proof path instead of assuming the product is only for TS/JS repos

That makes `agent-guardrails` easier to understand as a real-repo runtime, not just a setup-first onboarding layer.

## Current product boundary

OSS now owns:

- trust verdicts
- deploy-readiness judgment
- post-deploy maintenance summaries
- Python/FastAPI baseline proof

Still intentionally not in this release:

- `plugin-python`
- Python semantic parity with TS/JS
- provider-specific deployment orchestration
- new deploy-specific top-level CLI commands

## Install

```bash
npm install -g agent-guardrails
```

## Quick start

```bash
agent-guardrails setup --agent claude-code
```

If you want to see the new Python baseline proof directly:

```bash
npm run demo:python-fastapi
```

## Release status

Release notes prepared. Publish after `main` is pushed and the `v0.2.0` tag is created.
