# FAQ: Why buy this if I already have Claude / Cursor / Codex?

Last updated: 2026-04-03

## Short answer

Because those tools help generate code.

`agent-guardrails` helps you trust, review, and maintain that code inside a real repo.

---

## FAQ

### I already have Claude Code. Why would I pay for this?

If Claude Code is your generator, `agent-guardrails` is your trust layer.

Claude Code helps you get to a diff quickly.
`agent-guardrails` helps you answer whether that diff:

- stayed inside the intended scope
- ran the right validation
- introduced continuity or performance concerns
- is safe enough to merge without wasting reviewer time

### I can already add prompts, MCP tools, and hooks myself.

You can.

The issue is not whether a DIY stack is possible.
The issue is whether it stays:

- consistent across repos
- easy to maintain
- understandable to reviewers
- stable after 20, 50, or 100 AI-assisted edits

DIY works best for experimentation.
`agent-guardrails` is valuable when you want the safe path to be repeatable.

### Why not just use CodeRabbit or another PR review product?

Those products usually start after the diff already exists.

`agent-guardrails` tries to shape the work earlier:

- before implementation through task contracts
- during implementation through runtime-backed boundaries
- after implementation through reviewer-facing output

It is not only a PR comment layer.

### Isn't this just a wrapper around existing tools?

No.

The core value is not prompt wording.
The core value is runtime behavior:

- repo-aware boundaries
- repeatable review output
- continuity and maintenance signals
- agent-agnostic workflow control

That is much harder to replace than a nice prompt template.

### Why would a solo developer pay?

Because solo developers feel review and rollback pain directly.

They do not have a platform team to absorb mistakes.

They pay when the product helps them:

- merge faster with less anxiety
- spend less time checking AI output manually
- avoid slowly degrading their repo with rushed AI edits

### Why would a small team pay?

Because small teams often have mixed tools and inconsistent habits.

They need:

- one trust standard across different agents
- less reviewer overhead
- less drift across repeated AI sessions
- clearer handoff between developers

### So what exactly is the paid wedge?

Not "more code generation."

The paid wedge is:

- less manual workflow overhead
- higher-signal repo-aware judgment
- faster trust calibration
- less long-term maintenance drift

### Does the OSS version still matter?

Yes.

OSS should remain a real merge gate.

That is important for trust, adoption, and honest product positioning.

Paid tiers should make the workflow better, not make the baseline artificially weak.
