# Plan 1700 — Encoded-credential coverage in the libeval trace redactor

Spec: [`spec.md`](./spec.md). Design: [`design-a.md`](./design-a.md).

## Approach

Extend the env-allowlist layer in `libraries/libeval/src/redaction.js` so each
allowlisted secret is also matched in its standard-base64 form at any byte
offset, by precomputing three offset-invariant "core" substrings per secret
(encode-the-known-value) and scanning for them with the existing `includes`
pass. The pattern-layer half is already on `main` (#1559). All work is in one
source file plus its two test files; no new module, no new call site.

Libraries used: none (Node `Buffer` is built-in).

## Step 1 — Add the `encodedNeedles` helper

Intent: compute, from a secret value alone, the three offset-invariant
standard-base64 core substrings.

Files: modified — `libraries/libeval/src/redaction.js`.

Add a module-private constant and helper near `snapshotEnv`:

```js
/**
 * Minimum secret byte length for encoded-form matching. At 9 bytes the
 * shortest offset core is exactly 8 chars; below 9 it drops under 8 — too
 * short to be a sound needle against ordinary base64 trace content (margin of
 * safety, criterion 5). All DEFAULT_ENV_ALLOWLIST values (tokens, keys,
 * passwords) far exceed it.
 */
const MIN_ENCODED_SECRET_BYTES = 9;

// Leading base64 chars contaminated by the k filler bytes, per alignment.
const ENCODED_LEAD_STRIP = [0, 2, 3];

/**
 * The three offset-invariant standard-base64 core substrings of `secret`,
 * one per byte alignment (k = 0/1/2). Each core is the interior run that is
 * identical regardless of the bytes surrounding `secret` at that alignment;
 * base64 maps disjoint 3-byte groups to 4 chars independently, so only the
 * partial groups at each edge are neighbour-dependent and are stripped.
 * Padding-free, so one needle matches padded and unpadded haystack content.
 * Returns [] when `secret` is below MIN_ENCODED_SECRET_BYTES.
 * @param {string} secret
 * @returns {string[]}
 */
function encodedNeedles(secret) {
  if (Buffer.byteLength(secret, "utf8") < MIN_ENCODED_SECRET_BYTES) return [];
  const needles = [];
  for (let k = 0; k < 3; k++) {
    const enc = Buffer.from("\0".repeat(k) + secret, "utf8")
      .toString("base64")
      .replace(/=+$/, "");
    needles.push(enc.slice(ENCODED_LEAD_STRIP[k], enc.length - 4));
  }
  return needles;
}
```

Verify: `bun test libraries/libeval/test/redaction-matching.test.js` (new
assertions added in Step 4 exercise it).

## Step 2 — Carry needles in the env snapshot

Intent: precompute needles once at construction, alongside the raw secret.

Files: modified — `libraries/libeval/src/redaction.js`.

Change `snapshotEnv` so each entry is `{ secret, needles }` instead of a bare
string:

```js
function snapshotEnv(env, allowlist) {
  const snap = {};
  for (const name of allowlist) {
    const v = env[name];
    if (typeof v === "string" && v.length > 0) {
      snap[name] = { secret: v, needles: encodedNeedles(v) };
    }
  }
  return Object.freeze(snap);
}
```

Verify: the `redaction-opt-out.test.js` `DEFAULT_ENV_ALLOWLIST` /
`createRedactor` smoke tests still pass: `bun test
libraries/libeval/test/redaction-opt-out.test.js`.

## Step 3 — Match needles in `#redactString`

Intent: after the raw `includes` pass, replace each encoded needle with the same
`[REDACTED:env:NAME]` placeholder; pattern pass runs last, unchanged.

Files: modified — `libraries/libeval/src/redaction.js`.

Rewrite the env loop of `#redactString` to read the new snapshot shape and scan
needles. Raw match runs first, then each of the three needles. Order among the
needles is irrelevant to the outcome: once a needle's region is replaced by the
`[REDACTED:env:NAME]` placeholder (which shares no base64 run with any needle),
the bytes are gone and a later needle cannot re-match them. The floor guarantees
every needle is ≥ 8 chars, so no empty-needle guard is needed:

```js
for (const [name, { secret, needles }] of Object.entries(this.envSnapshot)) {
  if (out.includes(secret)) {
    out = out.split(secret).join(ENV_PLACEHOLDER(name));
  }
  for (const needle of needles) {
    if (out.includes(needle)) {
      out = out.split(needle).join(ENV_PLACEHOLDER(name));
    }
  }
}
```

The JSDoc-internal `Redactor` constructor `@param` for `envSnapshot` updates to
`{ secret, needles }` entries.

Verify: full suite — `bun test libraries/libeval/test/redaction-matching.test.js
libraries/libeval/test/redaction-opt-out.test.js`.

## Step 4 — Tests for criteria 1, 2, 4, 5

Intent: assert encoded coverage at every offset for the whole allowlist, the
reconstructed leak shape, and benign-content pass-through. Criterion 3 (raw and
opt-out behavior unchanged) is covered by leaving the existing suites untouched
except for additions — the Step 2/3/5 verifications run them unmodified.

Files: modified — `libraries/libeval/test/redaction-matching.test.js`.

Add a `describe("Redactor — env-allowlist encoded forms (criterion 2)")` block:

- **Criterion 2 (offset sweep).** Iterate `DEFAULT_ENV_ALLOWLIST`. For each
  name, build a synthetic credential-length value (e.g. `${name}-` + 32 random
  url-safe chars). Feed (a) the bare standard base64 of the value and (b) the
  base64 of `pre + value + post` for `pre.length % 3 ∈ {0,1,2}` (three
  alignments), in both padded and unpadded form. Assert the value is not
  recoverable and `[REDACTED:env:NAME]` appears. Use the construction `env: {
  [name]: value }`.
- **Criterion 1 (extraheader via env layer).** Set `GITHUB_TOKEN` to a synthetic
  token, feed `AUTHORIZATION: basic ${base64("x-access-token:" + token)}`,
  assert the token's encoding is gone. The `x-access-token:` prefix is 15 bytes
  (0 mod 3), so the token begins on a group boundary and is matched by the k=0
  needle; add a variant with a username of length 1 mod 3 and 2 mod 3 (e.g.
  `user:` and `me:`) so the k=1 and k=2 needles are exercised here too.
- **Criterion 4 (leak shape).** Reconstruct a `gh auth status` / `git config`
  diagnostic event carrying `AUTHORIZATION: basic <b64>` with a synthetic
  installation token in `GITHUB_TOKEN`; assert no token survives.
- **Criterion 5 (no false positive).** Feed representative benign base64 (a
  file-blob string, tool output) with `env: {}` and assert it round-trips
  unchanged; also feed it with a populated allowlist whose secrets do not
  appear, asserting no change.
- **Arbitrary-value guard.** Assert a hard-coded literal matching only run
  `27288359408`'s bytes is *not* present in the test (the loop derives needles
  from synthetic values), satisfying the spec's anti-fixture requirement.

Verify: `bun test libraries/libeval/test/redaction-matching.test.js`.

## Step 5 — Contract documentation (criterion 6)

Intent: the `Redactor` class JSDoc states encoded coverage and its boundary so
the next reader does not re-assume raw-only coverage.

Files: modified — `libraries/libeval/src/redaction.js`.

Extend the `Redactor` class-level JSDoc (and the file header comment) to state:
the env layer matches each allowlisted secret both raw and in its **standard
base64** form at any byte offset; the boundary is **standard base64 only**
(not URL-safe base64, hex, or percent-encoding) and the **trace-write sink
only** (the wiki-commit sink is never passed through the redactor).

Verify: `bun run --cwd libraries/libeval format` (or repo `biome format`)
reports clean; the `redaction-opt-out.test.js` contract tests pass.

## Risks

- **Needle false negative from a wrong edge-strip count.** The `[0,2,3]` lead
  strip and trailing-4 strip are pinned by construction; the Step 4 offset sweep
  (padded + unpadded × three alignments × full allowlist) is the regression that
  catches any drift. A single off-by-one in either count surfaces as a failed
  assertion in that sweep.
- **Snapshot shape change ripples.** `snapshotEnv` now returns
  `{ secret, needles }` entries; the only reader is `#redactString` (Step 3) and
  the only constructor-time consumer is `Redactor`. `createNoopRedactor` passes
  `Object.freeze({})` and is unaffected. Grep confirms no other reader of
  `envSnapshot` entries.
- **Multibyte secrets.** `Buffer.byteLength`/`Buffer.from(..., "utf8")` are used
  so the floor and encoding are byte-correct for non-ASCII secret values.

## Execution recommendation

Single engineering agent, sequential — Steps 1–3 are one tightly coupled source
change, Step 4 is its regression, Step 5 is documentation on the same file.
Implement and verify as one unit; the steps are not independently
parallelizable.

— Staff Engineer 🛠️
