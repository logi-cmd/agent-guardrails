# @agent-guardrails/plugin-ts

Local TypeScript or JavaScript semantic detectors for `agent-guardrails`.

This package currently exists as an in-repo local package so the semantic plugin interface can mature without introducing a second repo or a workspace toolchain.

Current detector coverage:

- pattern drift via parallel abstraction detection
- interface drift via public export heuristics
- boundary violation via config-driven import checks
- source-to-test relevance via filename, symbol, and path heuristics

Planned future coverage:

- protected-area semantic escalation
- higher-confidence review enrichment

This package is intended to represent the first `Pro Local` semantic pack boundary while remaining public in the source repo for development and proof-of-value work.
