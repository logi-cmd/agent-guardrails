# Source Test Relevance Demo

This example shows the next semantic proof point for `agent-guardrails`.

It demonstrates a task that passes the OSS baseline:

- the change stays inside `src/` and `tests/`
- the required command is reported
- an evidence note exists
- a test file changed alongside the source file

The semantic plugin still blocks the fail scenario because the changed test file does not plausibly validate the changed refund behavior surface, even though the baseline only sees "source plus test".

## What this demo proves

- the OSS merge gate and semantic validation can stay separate
- `check` remains the only public enforcement command
- `@agent-guardrails/plugin-ts` can tell the difference between "a test changed" and "the right test changed"
- the corrected implementation clears the failure by updating the refund-focused test instead of an unrelated invoice test

## Run the demo

From this folder:

```bash
npm run demo:all
```

The demo runs two loops:

1. `demo:fail` changes `refund-service.ts` but only updates `invoice-service.test.ts`, which fails with `source-test-relevance-missed-expected-targets`.
2. `demo:pass` updates `refund-service.test.ts` instead and clears the semantic finding.

Expected result:

- the first scenario fails even though a test file changed
- the second scenario passes once the changed test matches the declared refund validation target
