# Boundary Violation Demo

This example shows the next semantic proof point for `agent-guardrails`.

It demonstrates a task that passes the OSS baseline:

- the change stays inside `src/` and `tests/`
- the required command is reported
- an evidence note exists
- the task contract is narrow and reviewable

The semantic plugin still blocks the change because the changed controller crosses a declared module boundary and imports directly from the data layer.

## What this demo proves

- the OSS merge gate and the semantic layer stay separate
- `check` remains the only public enforcement command
- `@agent-guardrails/plugin-ts` can turn a config-driven boundary rule into a real blocking finding
- the corrected implementation clears the failure by routing through the service layer again

## Run the demo

From this folder:

```bash
npm run demo:all
```

The demo runs two loops:

1. `demo:fail` imports the data layer directly from a controller and fails with `boundary-violation-forbidden-import`.
2. `demo:pass` restores the service-layer import and passes without the boundary finding.

Expected result:

- the first scenario fails even though the OSS baseline is otherwise satisfied
- the second scenario passes once the import path respects the declared module boundary
