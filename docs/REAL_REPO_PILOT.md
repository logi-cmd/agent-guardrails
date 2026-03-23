# Real Repo Pilot

Last updated: 2026-03-22

## Pilot type

This was a documented pilot run against the `agent-guardrails` source repository before the first public OSS release.

It is not an external customer pilot. It is a real TypeScript or JavaScript repo pilot run against the actual `agent-guardrails` source repository, with its normal git history, tests, CI workflow, demos, and semantic plugin package.

## Why this pilot was run

The release bar for the OSS launch was intentionally stronger than "the CLI installs":

- boundary violation needed a runnable semantic proof
- source-to-test relevance needed a runnable semantic proof
- at least one real-repo pilot needed to show value beyond synthetic manifests

## Commands run

These commands were run from the repo root during the pilot pass:

```bash
npm test
npm run benchmark
node ./examples/boundary-violation-demo/scripts/run-demo.mjs all
node ./examples/source-test-relevance-demo/scripts/run-demo.mjs all
```

## What the pilot caught beyond the OSS baseline

### 1. Boundary violation

Pilot slice:

- changed controller file: `src/orders/controllers/refund-controller.ts`
- changed test file: `tests/refund-controller.test.ts`
- task contract stayed narrow and otherwise OSS-valid

Meaningful catch:

- the baseline merge gate accepted the task shape, command reporting, evidence, and bounded file set
- the semantic detector still raised `boundary-violation-forbidden-import`
- the issue was obvious in review output as a consistency concern instead of a vague architecture smell

Why this matters:

- this is exactly the kind of "AI changed the right files in the wrong way" problem that file-shape heuristics do not catch

### 2. Source-to-test relevance

Pilot slice:

- changed source file: `src/orders/refund-service.ts`
- changed test file: `tests/invoice-service.test.ts`
- task contract declared `expectedTestTargets: tests/refund-service.test.ts`

Meaningful catch:

- the OSS baseline could only see that a source file and a test file both changed
- the semantic detector raised `source-test-relevance-missed-expected-targets`
- the finding landed in the validation bucket, which made the reviewer action obvious: change the refund-focused test or fix the contract

Why this matters:

- this directly addresses a common AI-coding failure mode where the model adds or edits "some test" instead of the test that validates the touched behavior

## Noise and tuning notes

- no severe `check --json` instability showed up during the pilot
- no blocker-level false positive pattern was found in the current benchmark and demo set
- one important tuning decision came out of the pilot:
  - source-to-test relevance stays a `warning` by default
  - it only escalates to an `error` when the task contract declares expected test targets and the changed tests clearly miss them

## Reviewer value

The pilot confirmed that the review surface is part of the value, not just pass or fail:

- boundary drift showed up as a consistency concern with a concrete action
- weak test relevance showed up as a validation concern with a concrete action
- reviewers did not have to infer the hidden risk from a generic diff alone

## Outcome

This documented pilot satisfied the minimum OSS release gate for a real repo pilot:

- at least one meaningful semantic catch happened beyond baseline heuristics
- `check --json` stayed stable
- no critical trust-breaking false-positive pattern appeared

What this does **not** prove yet:

- broad external-repo generalization
- AST-level semantic confidence
- "production-ready AI code" as a blanket claim

The honest conclusion is:

> The OSS release is strong enough to publish as a production-safety baseline.  
> Stronger marketing claims should still wait for additional external pilots.
