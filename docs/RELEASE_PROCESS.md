# Release Process

Last updated: 2026-04-09
Status: Canonical for OSS release operations

## Purpose

This document defines how OSS releases for `agent-guardrails` must be prepared, published, and documented.

This is the source of truth for:

- GitHub publishing flow
- npm publishing flow
- release notes
- documentation update requirements
- packaging hygiene

## Release ownership rules

### GitHub account

All GitHub release actions must use the `logi-cmd` user.

That includes:

- pushing `main`
- creating tags
- creating GitHub releases
- publishing release notes

### npm account

All npm publish actions must use the `logi-cmd` account.

Do not publish from any other npm user.

### Repository target

The canonical OSS repo is:

- `https://github.com/logi-cmd/agent-guardrails`

## Packaging rule

Do not publish non-essential documentation or internal planning material to npm.

The npm package should ship only what runtime users need:

- `bin`
- `lib`
- `native`
- `templates`
- `adapters`
- `README.md`
- `LICENSE`

This rule is currently enforced by `package.json > files`.

Before every release, verify that no extra docs or internal assets are being packed.

## Pre-release checklist

All of the following must be true before release:

### Product and code

- tests pass
- install smoke passes
- benchmark or proof-critical paths still run
- no known blocker-level regressions remain
- version is updated

### Documentation

- `CHANGELOG.md` is updated
- user-visible README changes are updated if behavior changed
- canonical docs are updated if product boundary or implementation changed
- release-facing docs do not contradict the current build

### Publishing hygiene

- git remote points to `logi-cmd/agent-guardrails`
- GitHub auth identity is `logi-cmd`
- npm auth identity is `logi-cmd`
- `npm pack --dry-run` contains only intended files

## Recommended release command sequence

Run from the OSS repo root.

### 1. Verify working tree

```bash
git status --short
```

### 2. Verify auth identity

```bash
gh auth status
npm whoami
```

Expected:

- GitHub authenticated as `logi-cmd`
- npm authenticated as `logi-cmd`

### 3. Run release validation

```bash
npm test
node ./tests/install-smoke.js
npm run smoke:rust-installed
npm run release:rust-readiness -- --require-rust-default --require-complete-native-matrix
npm pack --dry-run
```

If benchmark-sensitive behavior changed, also run:

```bash
npm run benchmark
```

### 4. Update version and changelog

Required updates:

- `package.json`
- `CHANGELOG.md`
- any user-visible release docs

### 5. Commit and push

```bash
git add .
git commit -m "release: vX.Y.Z"
git push origin main
```

### 6. Tag release

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 7. Publish to npm

```bash
npm publish
```

### 8. Publish GitHub release

Use the GitHub release UI or `gh release create`.

The release must include:

- version title
- release notes
- highlights
- upgrade/install note if relevant

## Release notes rule

Every release must publish release notes.

Release notes should include:

- what changed
- why it matters
- any breaking or behavior-sensitive changes
- upgrade guidance if needed

Release notes should not be a raw commit dump.

## Release notes structure

Use this structure:

### Title

`vX.Y.Z`

### Summary

One short paragraph:

- what this release improves
- who it is most relevant for

### Highlights

- 3 to 7 highest-signal changes

### Fixes

- important bug fixes

### Docs or workflow updates

- user-visible workflow changes

### Upgrade notes

- anything users need to do differently

## Documentation update rule

When a release changes behavior, at least these docs must be checked:

- `README.md`
- `CHANGELOG.md`
- `docs/WORKFLOWS.md`
- `docs/ROADMAP.md` if roadmap status changed
- public proof/benchmark docs if the implementation boundary changed

## Definition of release-ready

An OSS release is release-ready only when:

- the package is clean to pack and publish
- identity is confirmed as `logi-cmd` on GitHub and npm
- release notes are prepared
- required docs are updated
- the release can be understood by a user from the changelog and README alone
