# Interface Drift Demo

This example shows the second semantic proof point for `agent-guardrails`.

It demonstrates a task that passes the OSS baseline:

- the change stays inside `src/` and `tests/`
- the required command is reported
- an evidence note exists
- the task contract is narrow and reviewable

The semantic plugin still blocks the change because the task is declared `implementation-only`, but the changed file silently adds a public export.

## What this demo proves

- the OSS merge gate and the semantic layer can stay separate
- `check` remains the only public enforcement command
- `@agent-guardrails/plugin-ts` can escalate contract-breaking interface drift into a real error
- the corrected implementation clears the semantic failure by keeping the helper internal

## Run the demo

From this folder:

```bash
npm run demo:all
```

The demo runs two loops:

1. `demo:fail` adds a new exported helper inside an implementation-only task and fails with `interface-drift-implementation-only`.
2. `demo:pass` keeps the helper internal and passes without the interface-drift finding.

Expected result:

- the first scenario fails even though the OSS baseline is otherwise satisfied
- the second scenario passes once the public export is removed
