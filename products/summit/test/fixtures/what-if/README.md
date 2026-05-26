# `what-if` formatter fixtures

Captured byte-for-byte output of the three `what-if` formatters (text, JSON,
markdown) for the five non-move scenarios listed in `rows.mjs`. The
`what-if-formatters.test.js` byte-identity test reads these files and
asserts equality against the post-change formatter output, so any
unintentional drift in the non-move output path fails CI loudly.

## Regenerating

```sh
node products/summit/test/fixtures/what-if/regenerate.mjs
```

The script runs the five rows in `rows.mjs` against `FIXTURE_ROSTER` (defined
in `products/summit/test/fixtures.js`) and writes 15 files (5 rows × 3
formats). It runs under `node` (not `bun`) to match the production handler's
JSON serialization exactly.

## When to regenerate

Only when the upstream contract or the fixture roster **intentionally**
changes — never silently after a refactor. The byte-identity test exists
precisely so that an accidental change to the non-move output path is caught
before merge.

Concretely:

- A new non-move scenario is added (extend `rows.mjs` and regenerate).
- `FIXTURE_ROSTER` in `products/summit/test/fixtures.js` is intentionally
  edited and the new bytes should become the baseline.
- A formatter behaviour change is deliberate (e.g. spec change to the text
  layout) and the new bytes should become the baseline.

A regeneration commit should land in the same PR as the change that motivates
it, with the diff to these fixtures reviewable as evidence of the new
expected output.

## Byte-identity invariant

The 15 fixture files committed alongside this README capture the pre-refactor
output of the legacy `whatIfToText` / `whatIfToJson` / `whatIfToMarkdown`
parameter shape (`{ scenario, coverageDiff, riskDiff, data? }`). After the
formatters migrate to the new `{ report, data? }` shape, the post-refactor
regeneration (via the updated `regenerate.mjs`) must produce the exact same
bytes for every fixture file. If the diff is non-empty after regenerating,
the refactor has changed the non-move output path and the test will fail.
