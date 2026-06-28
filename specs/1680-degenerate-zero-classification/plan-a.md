# Plan 1680 — libxmr classification taxonomy admits degenerate-zero

Implements [design-a.md](design-a.md) for [spec.md](spec.md).

## Approach

Add the `degenerate-zero` branch to `classify.js` after the no-signal
determination and before the `stable` return, gating on an all-zero series; the
guard is only reachable on the `n >= MIN_POINTS` no-signal path, so boundaries
and `status` stay fixed. Then extend the four documentation surfaces that
enumerate the existing values. Code first (so tests prove the verdict), docs
second.

Libraries used: libxmr (classify).

## Step 1: Add the degenerate-zero branch to classify

Intent: classify an all-zero series at or above the window as `degenerate-zero`.

Files modified: `libraries/libxmr/src/classify.js`,
`libraries/libxmr/src/analyze.js`.

Change: in `classify.js`, extend the header comment with the new value and add
the branch as the last test before `stable`. The series is read directly from
`metric.values` (present on the metric record) so there is no `analyze` *logic*
change and no float-derived predicate. In `analyze.js`, update only the
metric-record doc comment (lines 13–14) whose `classification` line enumerates
the four values:

```js
//   - classification: 'insufficient' | 'stable' | 'signals' | 'chaos' | 'degenerate-zero'
```

```js
//   stable          — predictable; no rules fire and the series varies.
//   degenerate-zero — predictable but every observation equals zero: no
//                     variation around zero, so predictability is trivial and
//                     the series carries no process signal.
/** Classify a metric into a process-behavior category: insufficient, chaos, signals, stable, or degenerate-zero. */
export function classify(metric) {
  if (metric.status === "insufficient_data") return "insufficient";
  const s = metric.signals;
  if (!s) return "stable";
  if (s.mrRule1?.length > 0) return "chaos";
  if (s.xRule1?.length > 0 || s.xRule2?.length > 0 || s.xRule3?.length > 0) {
    return "signals";
  }
  if (metric.values?.length > 0 && metric.values.every((v) => v === 0)) {
    return "degenerate-zero";
  }
  return "stable";
}
```

Verification: `bun test libraries/libxmr/test/classify.test.js` passes after
Step 2.

## Step 2: Add classify unit tests

Intent: lock the new branch and the unchanged stable/insufficient boundaries.

Files modified: `libraries/libxmr/test/classify.test.js`.

Change: add three cases inside the existing `describe("classify", …)` block,
reusing the `empty` signals fixture.

- All-zero series with no signals → `degenerate-zero`:
  `classify({ signals: empty, values: [0, 0, 0] })` is `"degenerate-zero"`.
- Positive-variation series with no signals stays `stable`:
  `classify({ signals: empty, values: [10, 11, 10, 11] })` is `"stable"`
  (distinguishes the two predictable shapes — success criterion 2).
- A signal on an all-zero `values` array still wins over the new branch:
  `classify({ signals: { ...empty, xRule1: [{ slots: [3] }] }, values: [0, 0, 0] })`
  is `"signals"` (branch ordering — signals are tested first).

Verification: `bun test libraries/libxmr/test/classify.test.js` passes.

## Step 3: Add analyze integration tests for the end-to-end verdict

Intent: prove `analyze` stamps `degenerate-zero`/`predictable` for an all-zero
series at the window, keeps `stable` for substantive predictable, and keeps the
sub-window all-zero series at `insufficient` (success criteria 1–3).

Files modified: `libraries/libxmr/test/analyze.test.js`.

Change: add three cases using the file's `makeCSV` helper.

- 15 all-zero rows → `status: "predictable"`,
  `classification: "degenerate-zero"`.
- An explicit contrast assertion in one test: an all-zero series is
  `degenerate-zero` while a positive stable series is `stable`, both
  `predictable`.
- 14 all-zero rows (one below `MIN_POINTS`) → `status: "insufficient_data"`,
  `classification: "insufficient"`.

Verification: `bun test libraries/libxmr/test/analyze.test.js` passes.

## Step 4: Document the value in the libxmr README

Intent: README gains a § Classifications table (none today — success criterion
4).

Files modified: `libraries/libxmr/README.md`.

Change: add a `## Classifications` section (after § Example output) with a
five-row table mirroring the guide's: `stable`, `signals`, `chaos`,
`insufficient`, and `degenerate-zero` (every observation equals zero;
predictable but no process signal — a predictability target is not substantively
met by it).

Verification: `rg -c degenerate-zero libraries/libxmr/README.md` returns ≥ 1.

## Step 5: Document the value in the xmr-analysis guide

Intent: both enumeration sites and the adjacent guidance prose stay accurate for
five values (success criterion 4).

Files modified:
`websites/fit/docs/libraries/predictable-team/xmr-analysis/index.md`.

Changes:

- `classification` JSON-field bullet (~line 114): add `degenerate-zero` to the
  enumerated values.
- § Classifications table (~line 153): add a `degenerate-zero` row — "Every
  observation is zero. Predictable, but the series carries no process signal" /
  "Nothing to react to; a predictability target is not substantively met."
- "Read `classification` first…" prose (~line 116): note that `degenerate-zero`
  is also quiet but means a flat-zero series with no information, distinct from
  `stable`.
- "Do not react to individual data points when the classification is `stable`…"
  prose (~line 199): extend to cover `degenerate-zero` as the other quiet
  verdict.

Verification: `rg -c degenerate-zero <guide>` returns ≥ 2; review confirms both
guidance passages account for the new value.

## Step 6: Document the value in the fit-xmr skill report shape

Intent: published skill § Report Shape roll-up names five values
(success criterion 4).

Files modified: `.claude/skills/fit-xmr/SKILL.md`.

Change: in § Report Shape, extend the `classification` roll-up sentence
(~line 154) to add `degenerate-zero` (every observation zero — predictable but
no process signal).

Note: this writes under `.claude/`. If a direct Edit is blocked, apply via
`echo … | bunx fit-selfedit .claude/skills/fit-xmr/SKILL.md` per CLAUDE.md.

Verification: `rg -c degenerate-zero .claude/skills/fit-xmr/SKILL.md` returns ≥
1.

## Step 7: Full verification

Intent: confirm no golden snapshot or libwiki integration regression
(success criterion 5).

Verification: `bun test libraries/libxmr libraries/libwiki` passes, including
`libraries/libxmr/test/golden/fit-xmr/` snapshots for `chart`, `summarize`, and
`analyze`.

## Risks

| Risk | Note |
| --- | --- |
| `.claude/` write gating | Step 6 may need `fit-selfedit`; the plan flags it inline. |
| Golden snapshot drift | Fixtures use a non-zero stable series, so the new branch is unreachable for them; Step 7 confirms. |

## Execution

Single engineering agent, sequential. Step 1 must precede Steps 2–3 (tests
depend on the branch). Steps 4–6 are independent of each other and of the code
but follow the code so docs match shipped behavior. Step 7 is last.

— Staff Engineer 🛠️
