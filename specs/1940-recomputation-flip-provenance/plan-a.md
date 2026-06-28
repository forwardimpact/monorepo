# Plan 1940 — libxmr per-signal recomputation-revealed provenance

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Add a pure `stampProvenance` to `libxmr/signals.js` and an optional
`priorReadAnchor` to `analyze`, which resolves the date to a slot by exact-match
and stamps every fired record only on the corresponding-anchor path (no-anchor
and non-corresponding paths leave records untouched, preserving golden
snapshots). Surface the option on the CLI, extend `XMR_OPEN_RE` with a third
`prior=` capture, thread it through `scanMarkers` → refresh → `renderBlock` →
`analyze`, and annotate per-rule provenance in `formatSignals`. Document the
field at the three signal-record sites. The libxmr core (steps 1–4) is
independent of the libwiki surfacing (steps 5–7); docs (step 8) follow both.

Libraries used: libxmr (analyze, detectSignals, signals records), libwiki
(block-renderer, marker-scanner, refresh), libmock (createMockFs, in tests).

## Step 1 — Add `stampProvenance` to libxmr signals

Add a pure exported function that adds `provenance` to every fired record.

- Modified: `libraries/libxmr/src/signals.js`, `libraries/libxmr/src/index.js`

```js
// signals.js — append
/** Stamp each fired signal record with anchor-relative provenance.
 *  recomputation-revealed when every participating slot <= anchorSlot,
 *  else new-point. Mutates and returns the same keyed-by-rule structure. */
export function stampProvenance(signals, anchorSlot) {
  for (const rule of ["xRule1", "xRule2", "xRule3", "mrRule1"]) {
    for (const sig of signals[rule]) {
      sig.provenance =
        Math.max(...sig.slots) <= anchorSlot
          ? "recomputation-revealed"
          : "new-point";
    }
  }
  return signals;
}
```

Export `stampProvenance` from `index.js`.

Verify: `bun test libraries/libxmr/test/signals.test.js` passes; the function's
own behavior is asserted in Step 3.

## Step 2 — Resolve the anchor and stamp in `analyze`

`analyze` accepts `priorReadAnchor`; resolve by exact date match against the
sorted group; stamp only when a slot date equals the anchor.

- Modified: `libraries/libxmr/src/analyze.js`
- Add `priorReadAnchor` to the options destructure:
  `{ eventType = DEFAULT_SHIFT_TYPE, priorReadAnchor } = {}`.
- After `const signals = detectSignals(...)` in the `n >= MIN_POINTS` branch,
  resolve and stamp:

```js
if (priorReadAnchor) {
  const idx = dates.indexOf(priorReadAnchor); // exact-match; -1 if non-corresponding
  if (idx !== -1) stampProvenance(signals, idx + 1); // 1-indexed anchorSlot
}
```

Import `stampProvenance` from `./signals.js`. The insufficient-data branch has
no `signals`, so it is untouched.

Verify: `bun test libraries/libxmr` passes; golden `analyze-json` snapshot
unchanged (no `--prior-read` in cases.json).

## Step 3 — Unit tests for the predicate (criteria 1, 2, 3)

Reproduce the #1692 shape: a favorable zero-tail tightening limits over a
pre-anchor cluster, so an adverse signal is wholly pre-anchor
(`recomputation-revealed`) while a favorable X-Rule 2 zero-run includes
post-anchor slots (`new-point`).

- Created: `libraries/libxmr/test/provenance.test.js`
- Test A (criteria 1+2): a single CSV whose `analyze(csv, { priorReadAnchor })`
  yields both `recomputation-revealed` (on an X-Rule 1 / mR-Rule 1 record with
  `max(slots) <= anchorSlot`) and `new-point` (on the X-Rule 2 zero-run that
  crosses the anchor) in one metric's report.
- Test B (criterion 3 — no anchor): `analyze(csv)` produces records with no
  `provenance` key (`assert.ok(!("provenance" in rec))`).
- Test C (criterion 3 — non-corresponding anchor): a `priorReadAnchor` date not
  present in the series yields no `provenance` key, identical to Test B's
  report.

Verify: `bun test libraries/libxmr` passes — this runs the golden harness, whose
`analyze`, `chart`, and `summarize` snapshots (none invoke `--prior-read`) stay
byte-identical, satisfying criterion 3's snapshot leg for all three commands.

## Step 4 — CLI `--prior-read` option

Surface the anchor on the `analyze` command.

- Modified: `libraries/libxmr/bin/fit-xmr.js`,
  `libraries/libxmr/src/commands/analyze.js`
- In `fit-xmr.js`, add to the `analyze` command `options`:
  `"prior-read": { type: "string", description: "Prior-read anchor date (YYYY-MM-DD) for per-signal provenance" }`.
- In `runAnalyzeCommand`, pass it through:
  `analyze(text, { eventType, priorReadAnchor: values["prior-read"] })`.
  `toJsonMetric` already passes `m.signals` through verbatim, so provenance
  appears in JSON output with no further change.

Verify: `bun test libraries/libxmr` passes; existing golden snapshots unchanged.

## Step 5 — Extend the marker grammar and scanner

Add a third capture for an optional `prior=YYYY-MM-DD` token, ordered before the
existing trailing-text group so the "Do not edit" notice is still tolerated.

- Modified: `libraries/libwiki/src/constants.js`,
  `libraries/libwiki/src/marker-scanner.js`

- `XMR_OPEN_RE` becomes (third group optional, anchored before trailing text):

```js
export const XMR_OPEN_RE =
  /^<!--\s*xmr:([^:\s]+):(\S+)(?:\s+prior=(\d{4}-\d{2}-\d{2}))?(?:\s+[^>]*?)?\s*-->\s*$/;
```

- In `marker-scanner.js#tryOpen`, capture group 3 as `priorReadAnchor`
  (`xmrMatch[3] || null`); carry it on the returned open object and in
  `closePair`'s xmr branch.

Verify: `bun test libraries/libwiki/test/marker-scanner.test.js` and
`audit-rules.test.js` pass (the audit reads only capture groups 1–2, which the
new group-3 leaves unshifted, so an extra group is backward-compatible).

## Step 6 — Thread the anchor through refresh and renderBlock

- Modified: `libraries/libwiki/src/commands/refresh.js`,
  `libraries/libwiki/src/block-renderer.js`
- In `refresh.js#renderForBlock`, pass `priorReadAnchor: block.priorReadAnchor`
  into the `renderBlock` call.
- In `block-renderer.js`, add `priorReadAnchor` to `renderBlock`'s options and
  pass it to `analyze`: `analyze(csvText, { priorReadAnchor })`.
- Rework `formatSignals` to annotate each fired rule with its records'
  provenance when present:

```js
function formatSignals(signals) {
  if (!signals) return "—";
  const fired = [];
  for (const rule of ["xRule1", "xRule2", "xRule3", "mrRule1"]) {
    const recs = signals[rule];
    if (!recs?.length) continue;
    const tags = [...new Set(recs.map((r) => r.provenance).filter(Boolean))];
    fired.push(tags.length ? `${rule} (${tags.join(", ")})` : rule);
  }
  return fired.length > 0 ? fired.join(", ") : "—";
}
```

When no anchor is supplied, `provenance` is absent and the line renders exactly
as today (`rule` with no parenthetical).

Verify: `bun test libraries/libwiki/test/block-renderer.test.js` passes
(existing no-anchor tests still match the bare-rule output).

## Step 7 — Storyboard refresh surfacing test (criterion 4)

Add a test that regenerating a block whose every adverse signal is
recomputation-revealed renders a Signals line distinguishing those from
new-point signals.

- Modified: `libraries/libwiki/test/block-renderer.test.js` (and/or
  `cli-refresh.integration.test.js`)
- Seed a #1692-shape CSV via `createMockFs`; call
  `renderBlock({ ..., priorReadAnchor: <pre-tail date> })`; assert the
  `**Signals:**` line contains `recomputation-revealed` for the adverse rule and
  `new-point` for the favorable X-Rule 2 run.
- Add a marker-scanner assertion (or extend Step 5's test) that a
  `prior=YYYY-MM-DD` token is parsed onto the block as `priorReadAnchor`.

Verify: `bun test libraries/libwiki` passes.

## Step 8 — Documentation (criterion 5)

Document the `provenance` field at all three signal-record sites.

- Modified: `libraries/libxmr/README.md` (gains a new signal-record section — it
  carries none today), `.claude/skills/fit-xmr/SKILL.md` (§ Report Shape),
  `websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md` (the
  `**signals**` JSON-field bullet — "keyed by rule … `slots` and a
  `description`" — and the "Read `classification` first … If it says `signals`,
  look at the `signals` object" reading guidance; anchor on that prose, not line
  numbers, since spec 1680's doc pass may shift them)

- State: each fired record may carry `provenance` (`recomputation-revealed` |
  `new-point`) when a prior-read anchor was supplied; define the predicate
  (anchor-relative data membership); note the storyboard cell surfaces it. Keep
  the guide's "If it says `signals`, look at the `signals` object…" prose
  accurate with provenance present.

Verify: `rg -c recomputation-revealed` returns ≥ 1 for
`libraries/libxmr/README.md` and `.claude/skills/fit-xmr/SKILL.md`, and ≥ 2 for
the xmr-analysis guide.

## Risks

- **`(\S+)` csvPath greediness** — csvPath has no spaces in practice, but the
  new `prior=` group must follow `\s+` so the csvPath capture stops at the
  space; confirm with a scanner test where the marker carries both a csvPath and
  a `prior=` token (Step 5/7).
- **`.claude/` write gating** — Step 8 edits `.claude/skills/fit-xmr/SKILL.md`;
  if direct writes are blocked, use `echo … | bunx fit-selfedit <path>` per
  CONTRIBUTING § self-edit.

## Execution

Single engineering agent, sequential. Steps 1–4 (libxmr) then 5–7 (libwiki) then
8 (docs); 8 may be routed to `technical-writer` but is small enough to keep
inline. Each step is independently verifiable by its named `bun test` target.

— Staff Engineer 🛠️
