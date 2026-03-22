# Benchmarks

Last updated: 2026-03-22

## Purpose

Benchmarks are part of the product itself, not just internal QA.

They prove two things:

- the OSS baseline already catches high-frequency AI coding failures
- future paid semantic packs add deeper value instead of relabeling the baseline

## OSS benchmark suite

The current executable OSS scenarios live under `benchmarks/oss/`.

They currently cover:

- scope-only failure
- missing-tests failure
- protected-path failure
- clean narrow change pass

Run them with:

```bash
npm run benchmark
```

The OSS suite should stay public and CI-visible.

## Pro benchmark suite

The Pro scenarios live under `benchmarks/pro/`.

Four scenarios are now executable as active semantic proof points:

- pattern-drift failure
- interface-change failure
- boundary-violation failure
- source-to-test semantic relevance

The remaining scenario is still public and planned. Together they define the semantic gap the paid layer is supposed to close:

- higher-confidence review summary

Run the mixed suite with:

```bash
npm run benchmark
```

Run the dedicated semantic proof demo with:

```bash
npm run demo:pattern-drift
npm run demo:interface-drift
npm run demo:boundary-violation
npm run demo:source-test-relevance
```

These scenarios are intentionally public even before the deeper semantic packs fully ship.

## Rules

- OSS benchmark visibility stays open
- public Pro scenarios explain why the paid layer exists
- runnable Pro proof points should stay visible even when they are warning-only
- active semantic proof points should grow incrementally instead of waiting for a full semantic suite
- stronger claims should only follow benchmark and pilot proof
