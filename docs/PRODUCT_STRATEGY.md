# Product Strategy

Last updated: 2026-03-22

## Product truth

`agent-guardrails` should not position itself as a generic AI coding helper.

It should position itself as:

> A production-safety layer for AI coding workflows.

That positioning matters because the surrounding market is already crowded with:

- AI editors and agent platforms
- AI PR review tools
- static-analysis and code-quality products

`agent-guardrails` should not try to win on "who writes code faster."
It should win on:

- whether AI-generated changes are safe to merge
- whether AI-generated changes stay reviewable
- whether AI-generated changes remain maintainable over time

The real user pain is not syntax mistakes. It is AI-generated changes that are too broad, weakly validated, misaligned with repo patterns, or risky to merge.

## Product today

Today the product is already useful as a repo-local workflow governor:

- `init` seeds repo memory, prompts, and workflow files
- `plan` creates a bounded task contract
- `check` enforces scope, validation, risk, and review-oriented findings
- adapters make the workflow usable across Codex, Claude Code, Cursor, OpenHands, and OpenClaw

What it reliably reduces today:

- out-of-scope edits
- missing test accompaniment at a file-shape level
- missing command reporting
- missing evidence
- risky path edits without declared risk or review notes
- undeclared change-type mismatches at a file-shape level

What it does not yet reliably catch:

- protected-area semantic escalation
- behavior changes that need stronger symbol-aware test mapping than the current heuristic
- config or schema changes whose risk is not obvious from path alone

The current semantic milestone changes that meaningfully:

- a TypeScript or JavaScript semantic plugin package exists in this repository
- pattern drift has a first narrow semantic example
- interface drift now has a first narrow semantic example
- module boundary analysis now has a first config-driven semantic example
- source-to-test relevance now has a first validation-quality semantic example
- the result is still intentionally narrow and not marketed as full semantic coverage

## Product goal

The durable goal is not "perfect code generation."

The durable goal is:

- AI-generated changes are small by default
- AI-generated changes stay aligned with repo patterns
- behavior-changing work is validated credibly
- high-risk surfaces are escalated automatically
- human reviewers can decide faster and with lower distrust
- follow-up changes stay maintainable instead of fragmenting into AI-shaped patchwork

Operationally, the product is successful when AI-written code can enter a normal PR flow with materially lower review cost and rollback risk.

The best-fit early user is:

- a heavy AI-coding individual developer
- a freelancer or agency
- a small AI-heavy engineering team

## Product architecture

Keep the public product shape stable:

- `init`
- `plan`
- `check`

Evolve the internals into:

- task contract
- repo policy
- detector pipeline
- finding aggregator
- review formatter

The next durable move is not more top-level commands. It is deeper enforcement behind `check`.

## Enforcement model

### Layer 1: Generic baseline

This remains the default and should stay open-source.

It covers:

- path scope
- intended files
- change breadth
- required commands
- evidence
- protected paths
- review output

### Layer 2: Semantic analyzers

This is the shortest path toward real production confidence.

Highest-value semantic checks, in order:

1. Public interface diff detection
2. Module boundary and dependency direction checks
3. Protected-area semantic escalation
4. Source-to-test impact checks
5. Duplicate abstraction and pattern drift detection

Recommended packaging:

- zero-dependency core remains the default
- language-aware analyzers ship as optional plugins

Suggested first plugins:

- `@agent-guardrails/plugin-ts`
- `@agent-guardrails/plugin-python`

The first implementation step is deliberately narrow:

- ship `@agent-guardrails/plugin-ts` as the first local semantic package
- prove one warning-level detector for pattern drift
- prove one hybrid-severity detector for interface drift
- prove one config-driven detector for boundary violation
- prove one heuristic detector for source-to-test relevance
- use benchmarks, demos, and documented pilots to validate signal before expanding further

## Quality strategy

The product should be judged as a quality-control system, not just a workflow helper.

### Core acceptance criteria

- The task is bounded before code is written.
- The change stays within declared scope.
- Validation was actually run and reported.
- Risky surfaces are explicitly escalated.
- Review output makes the change easier to judge.
- CI can reproduce the same result deterministically.

### KPIs

Recommended metrics:

- out-of-scope violation catch rate
- missing-validation catch rate
- high-risk change disclosure rate
- reviewer triage time
- PR bounce rate
- rollback or hotfix rate
- human override rate

### Release gates

Do not market stronger production claims until these exist:

- stable `init / plan / check / check --review / check --json`
- benchmark corpus in CI
- multiple failure-mode demos
- published catch-rate and false-positive metrics
- at least one real-repo pilot showing lower review burden

## Proof-of-value plan

The current bounded-scope demo is necessary but not sufficient.

The required demo set is:

1. Scope-only failure
2. Missing-tests failure
3. Protected-path failure
4. Pattern-drift failure
5. Interface-change failure
6. Boundary-violation failure
7. Source-to-test relevance failure
8. Review report on a risky change

Each demo should show:

- task request
- task contract
- simulated AI change
- failing output
- corrected change
- passing output
- what this protects in production

## Benchmarks

The project needs a standing evaluation loop.

Build three benchmark buckets:

1. Synthetic failure corpus
2. Golden clean corpus
3. Real-world replay corpus

Track:

- pass/fail
- finding categories and severity
- false positives
- missed detections
- review usefulness

## Commercialization

The viable C-end motion is prosumer developer tooling, not mass-market consumer SaaS.

Best-fit users:

- indie SaaS founders
- freelancers and agencies
- solo maintainers with heavy AI coding usage
- small AI-heavy teams

The paid value should focus on two things:

- less manual workflow overhead
- lower long-term maintenance cost

Recommended shape:

### Open-source core

Keep free:

- `init / plan / check`
- repo-local policy and contracts
- adapters
- JSON output
- baseline heuristics
- demos and templates
- benchmark harness and OSS benchmark scenarios

### Pro Local

Best first paid offer.

Suggested scope:

- semantic rule packs
- interface and boundary analysis
- pattern drift detection
- local IDE review
- BYO model key
- repo pattern learning
- higher-confidence reviewer summary enrichment

Suggested starting price range:

- `$12-$15/month`
- or `$99-$129/year`

### Pro Cloud

Later expansion.

Suggested scope:

- hosted PR review
- historical trend reports
- shared rule packs and sync
- included compute credits

Suggested starting price range:

- `$24-$29/month per developer`

## Positioning

Recommended positioning:

- The merge gate for AI-written code
- Production guardrails for Cursor, Copilot, Claude Code, and agent loops
- Catch scope drift, unsafe changes, and missing validation before AI code hits production

Recommended supporting value line:

- Smaller changes, clearer risks, lower maintenance cost for AI-written code

Do not position as:

- another AI coding assistant
- another PR review bot
- a generic static-analysis platform

Avoid claiming:

- guaranteed production-ready AI code
- fully automatic code quality

The honest claim today is:

> Helps teams constrain and validate AI-written changes before review and merge.

The stronger future claim, after benchmarks and pilots, is:

> Makes AI-generated changes substantially safer, smaller, and easier to review in production repos.

## Next 90 days

1. Expand `@agent-guardrails/plugin-ts` beyond the first four semantic examples into higher-confidence review and protected-area semantic escalation.
2. Tune boundary and source-to-test rules with more real-repo examples before broadening the claim.
3. Add repo policy concepts for richer protected-area, public-surface, and maintenance-continuity rules.
4. Define the first automation layer above the CLI:
   - skill-first workflow
   - MCP-first service boundary
   - agent-native orchestration goals
5. Implement the next semantic pack after TypeScript or JavaScript:
   - Python interface and boundary analysis
   - Python source-to-test relevance baseline
6. Run external real-repo pilots beyond the documented source-repo pilot and publish the outcomes.
