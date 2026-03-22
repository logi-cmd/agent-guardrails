# Pattern Drift Demo

This example shows the first semantic proof point for `agent-guardrails`.

It demonstrates a task that looks valid at the OSS merge-gate level:

- the change stays inside `src/` and `tests/`
- the required command is reported
- an evidence note exists
- the task contract is narrow and reviewable

The semantic plugin still raises a `pattern-drift-parallel-abstraction` finding when the change introduces a parallel abstraction instead of reusing the repo's existing pattern.

## What this demo proves

- the repo already contains an existing feature pattern under `src/orders/refund-service.ts`
- the OSS baseline is still the main merge gate
- the first local TypeScript or JavaScript semantic pack can add a higher-signal consistency finding without changing the public CLI
- the corrected implementation clears the semantic finding by reusing the existing `service` pattern

## Layout

- `AGENTS.md` and `docs/PROJECT_STATE.md` provide repo memory
- `.agent-guardrails/config.json` configures a repo-local baseline plus `@agent-guardrails/plugin-ts`
- `src/orders/refund-service.ts` is the existing abstraction to reuse
- `tests/refund-service.test.ts` is the baseline test file
- `scenarios/` contains the failing and passing manifests
- `scripts/run-demo.mjs` stages the local plugin package, writes a temporary task contract, and runs both scenarios

## Run the demo

From this folder:

```bash
npm run demo:all
```

The demo runs two loops:

1. `demo:fail` keeps the task bounded and validation-complete, but introduces `src/orders/refund-helper.ts`, which triggers a semantic pattern-drift warning.
2. `demo:pass` reuses `src/orders/refund-service.ts` and removes the parallel helper abstraction, which clears the finding.

Expected result:

- the first scenario reports `pattern-drift-parallel-abstraction`
- the second scenario reports no pattern-drift finding

For this first milestone, the detector is intentionally `warning` severity. The demo treats that warning as the proof signal rather than a hard merge-blocking error.

Example evidence note used by the demo:

```md
# Task Evidence

- Task: Add refund support to the orders module.
- Commands run: npm test
- Notable results: The semantic demo either introduces or removes a parallel abstraction under src/orders/.
- Residual risk: none
```
