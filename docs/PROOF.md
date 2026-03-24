# What this catches that normal AI coding workflows miss

`agent-guardrails` is not trying to be the fastest way to generate code from a blank prompt.

It is trying to make AI-written changes easier to trust when the code already lives in a real repo.

Use generation tools to get something started.
Use `agent-guardrails` when the code is already in a real repo and needs to be trusted, reviewed, and maintained.

## 1. Scope catch

The simplest proof lives in the bounded-scope demo:

- [examples/bounded-scope-demo](../examples/bounded-scope-demo)

What it shows:

- the task contract narrows the change before implementation
- the finish-time check catches out-of-scope changes instead of leaving reviewers to notice later
- required commands and evidence are part of the workflow, not optional cleanup

Run it:

```bash
node ./examples/bounded-scope-demo/scripts/run-demo.mjs all
```

Why it matters:

- many normal AI coding workflows still generate first and sort out scope later
- this proof shows the repo can reject that pattern before merge

## 2. Semantic catch

The public semantic demos show cases where a narrow diff can still be wrong for the repo:

- the pattern drift demo
- [examples/pattern-drift-demo](../examples/pattern-drift-demo)
- [examples/interface-drift-demo](../examples/interface-drift-demo)
- [examples/boundary-violation-demo](../examples/boundary-violation-demo)
- [examples/source-test-relevance-demo](../examples/source-test-relevance-demo)

What they prove:

- the OSS baseline can still look green while a semantic layer finds higher-signal drift
- repo consistency is not the same thing as passing basic scope checks
- the value is earlier repo-shaped judgment, not just more comments after the fact

Run them:

```bash
npm run demo:pattern-drift
npm run demo:interface-drift
npm run demo:boundary-violation
npm run demo:source-test-relevance
```

## 3. Reviewer summary value

The runtime does not stop at pass/fail.

It produces a reviewer-facing finish output that tells the human:

- what changed
- whether the scope held
- what validation ran
- what risk remains

That matters because the hard part is not only generating a diff.
The hard part is producing a bounded, reviewable, maintainable result inside a real repo.

This is where `agent-guardrails` should feel different from a one-shot generation tool:

- lower review anxiety
- lower merge anxiety
- lower maintenance drift after the change ships

## 4. Current support boundary

The support story should stay honest:

- **Deepest support today:** JavaScript / TypeScript
- **Baseline runtime support today:** Next.js, Python/FastAPI, monorepos
- **Still expanding:** deeper Python semantic support and broader framework-aware analysis

What that means:

- JavaScript / TypeScript currently has the strongest public semantic proof points
- Python already works through the same setup, contract, validation, evidence, and reviewer loop
- Python is the next language to deepen because it expands the product's real user pool more than adding only more TS/JS depth

This project should not claim equal depth across every language.
It should show a strong path in one ecosystem, a usable baseline in another, and a credible expansion path after that.

## 5. Python baseline proof

The first Python/FastAPI proof lives here:

- [examples/python-fastapi-demo](../examples/python-fastapi-demo)

What it proves today:

- the `python-fastapi` preset works through the same setup, contract, validation, evidence, and reviewer loop
- deploy-readiness judgment and post-deploy maintenance output are not TS/JS-only ideas
- a Python repo can already show observability notes, rollback guidance, and operator next actions through the OSS runtime

What it does **not** claim:

- it is not Python semantic parity with the TS/JS path
- it does not mean Python-specific semantic detectors have shipped
- it is not a `plugin-python` milestone

Why it still matters:

- Python users can now try a real, production-shaped baseline path instead of only seeing `python-fastapi` listed as a preset
- the product can honestly say Python/FastAPI baseline proof is available today while deeper semantic support is still being built

Run it:

```bash
npm run demo:python-fastapi
```

## Quick trial path

If you want to see the product in under three steps:

1. install it
2. run `setup`
3. try the bounded-scope sandbox

```bash
npm install -g agent-guardrails
agent-guardrails setup --agent claude-code
```

Then follow the setup output and use the sandbox:

- [examples/bounded-scope-demo](../examples/bounded-scope-demo)

If you only have a rough idea, start there anyway:

- `I only have a rough idea. Please read the repo rules, find the smallest safe change, and finish with a reviewer summary.`
