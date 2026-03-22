# Release Checklist

Use this list before publishing a new version of `agent-guardrails`.

## Versioning

- update `package.json`
- add a new entry to `CHANGELOG.md`
- confirm the release date is correct

## Validation

- confirm the strong OSS release gate is satisfied:
  - boundary-violation proof is active
  - source-to-test relevance proof is active
  - a real repo pilot is documented
- run `npm test`
- run `node ./examples/bounded-scope-demo/scripts/run-demo.mjs all`
- run `node ./examples/pattern-drift-demo/scripts/run-demo.mjs all`
- run `node ./examples/interface-drift-demo/scripts/run-demo.mjs all`
- run `node ./examples/boundary-violation-demo/scripts/run-demo.mjs all`
- run `node ./examples/source-test-relevance-demo/scripts/run-demo.mjs all`
- run `npm run benchmark`
- run `node ./bin/agent-guardrails.js help`
- run `npm pack --dry-run` with a repo-local npm cache
- run `node ./tests/install-smoke.js`

## Publish

- publish to npm
- create a GitHub release
- paste the release highlights from `CHANGELOG.md`

## After publish

- verify the package page on npm
- verify the GitHub release links work
- verify the README install instructions still match the published package
