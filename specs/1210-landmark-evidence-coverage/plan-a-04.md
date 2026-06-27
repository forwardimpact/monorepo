# Plan 1210-a Part 04: Landmark surfaces

Land the confidence-floor module, attach coverage to readiness +
timeline view payloads, render the coverage ratio adjacent to the
readiness verdict, add per-provenance breakdown to the coverage
formatter, and gate three commands on the floor with observably distinct
copy. Interpolate the floor value into the `fit-landmark --help` output
for criterion 4(a) discoverability.

Libraries used: libcli (existing `documentation` slot).

## Step 4.1 — Confidence-floor module

Created: `products/landmark/src/lib/confidence-floor.js`

```js
/**
 * Coverage confidence floor for Landmark commands.
 *
 * Single source of truth for the floor value. Imported by readiness +
 * timeline + coverage formatters, the CLI documentation interpolation,
 * and the criterion-1 ratio-target test.
 */

export const COVERAGE_CONFIDENCE_FLOOR = 0.3;

/** @param {number} ratio */
export function isBelowFloor(ratio) {
  return ratio < COVERAGE_CONFIDENCE_FLOOR;
}

/** Format the floor for display, e.g. "30%". */
export function floorPercentText() {
  return `${Math.round(COVERAGE_CONFIDENCE_FLOOR * 100)}%`;
}
```

Verify: `bun test products/landmark/test/lib/confidence-floor.test.js`
(added in Step 4.9) passes; the file's only export with a side effect is
the constant.

## Step 4.2 — Readiness command attaches coverage

Modified: `products/landmark/src/commands/readiness.js`

Two edits:

1. Import the coverage helpers used by the coverage command:

   ```js
   import { getArtifacts, getUnscoredArtifacts } from "@forwardimpact/map/activity/queries/artifacts";
   import { computeCoverageRatio } from "../lib/evidence-helpers.js";
   ```

2. After `summary` is built, fetch artifact counts and attach a `coverage` block
   to the view (or `null` when the persona has no artifacts at all):

   ```js
   const allArtifacts = (await q.getArtifacts(supabase, { email: options.email })) ?? [];
   let coverage = null;
   if (allArtifacts.length > 0) {
     const unscored = await q.getUnscoredArtifacts(supabase, { email: options.email });
     coverage = computeCoverageRatio(allArtifacts, unscored);
   }

   return {
     view: {
       email: options.email,
       currentLevel: currentLevel.id,
       targetLevel: targetLevel.id,
       checklist: items,
       skippedSkills,
       summary,
       coverage,
     },
     meta: { format },
   };
   ```

3. Update the `queries` default plus the test stub plumbing to include
   `getArtifacts` and `getUnscoredArtifacts`:

   ```js
   const q = queries ?? { getPerson, getEvidence, getArtifacts, getUnscoredArtifacts };
   ```

Notes:

- Existing tests pass stub queries via `createMockQueries`; Step 4.8
  updates the stubs to include the two new query functions.
- **Zero-artifact short-circuit.** When `allArtifacts.length === 0`,
  attach `coverage: null` (not a zero-ratio object) so the formatter
  treats the persona as "no signal" rather than "below floor." A new
  hire with zero artifacts then sees the existing checklist (which
  doubles as a roadmap of markers to hit) instead of the misleading
  "Add artifact-interpreted evidence … to lift the floor" hint. The
  formatter's below-floor branch (Step 4.3) tests
  `view.coverage && view.coverage.total > 0 && isBelowFloor(...)`.
- **Early-return precedence.** `runReadinessCommand`'s existing
  early-returns (`PERSON_NOT_FOUND` at line 32,
  `NO_HIGHER_LEVEL`/`NO_MARKERS_AT_TARGET` paths) fire **before** the
  coverage attach. When any of those returns fires, the
  `meta.emptyState` path supersedes the view-formatter path and the
  coverage line is not rendered. Criterion 3's "coverage adjacent to
  verdict" reads as scoped to the verdict-bearing path — when there
  is no verdict (no markers at target, no higher level, person not
  found), the existing empty-state UX is preserved unchanged.

Verify: `git diff products/landmark/src/commands/readiness.js` shows
exactly those edits.

## Step 4.3 — Readiness formatter renders coverage + below-floor branch

Modified: `products/landmark/src/formatters/readiness.js`

```js
import { COVERAGE_CONFIDENCE_FLOOR, isBelowFloor, floorPercentText } from "../lib/confidence-floor.js";

function isBelowFloorWithSignal(coverage) {
  return coverage && coverage.total > 0 && isBelowFloor(coverage.ratio);
}

export function toText(view) {
  const lines = [
    renderHeader(`Readiness: ${view.email} (${view.currentLevel} → ${view.targetLevel})`),
    "",
  ];

  if (isBelowFloorWithSignal(view.coverage)) {
    const pct = (view.coverage.ratio * 100).toFixed(1);
    lines.push(
      `    Coverage below floor (${pct}% < ${floorPercentText()}) — verdict suppressed.`,
    );
    lines.push(
      `    Evidence coverage: ${view.coverage.scored}/${view.coverage.total} artifacts interpreted (${pct}%).`,
    );
    lines.push(
      "    Add artifact-interpreted evidence, run Guide's evaluate-evidence skill, or hand-attest markers via WriteEvidence to lift the floor.",
    );
    lines.push("");
    return lines.join("\n");
  }

  for (const section of view.checklist) {
    // (unchanged section rendering)
  }

  lines.push(`    ${view.summary.evidenced}/${view.summary.total} markers evidenced.`);
  if (view.coverage && view.coverage.total > 0) {
    const pct = (view.coverage.ratio * 100).toFixed(1);
    lines.push(`    Evidence coverage: ${view.coverage.scored}/${view.coverage.total} artifacts interpreted (${pct}%).`);
  }
  // ...rest unchanged (missing markers list, skipped skills, etc.)
}
```

The below-floor branch keeps the coverage ratio line (criterion 3's
"adjacent to the verdict" reads as "adjacent to the suppression line"
in the suppressed case — the suppression message *is* the verdict
state) and drops the per-skill checklist + the `Missing:` line so the
suppression is complete (no markers leaking through as a partial
verdict).

Update `toMarkdown` mirror-style (parallel below-floor branch + parallel
coverage line one line below the summary; no intervening blank line or
section header). `toJson` needs no change — the `view` already carries
`coverage`.

Notes:

- Criterion 3 mechanically requires the coverage line to sit "no more
  than two text lines" from the `X/Y markers evidenced` line. The
  rendered output has zero intervening lines (same indent block); this
  comfortably meets the bound.
- Criterion 4 below-floor branch wraps the verdict — the per-skill
  checklist is omitted and a single action-hint line names what would
  change. Design § Surface changes specifies the wrapping shape.

Verify: golden snapshots under `products/landmark/test/golden/` need
regeneration where the readiness output participates (the criterion-3
verification's stdout-shape test in Step 4.8 covers the snapshot delta).

## Step 4.4 — Timeline command attaches coverage

Modified: `products/landmark/src/commands/timeline.js`

Mirror Step 4.2's coverage-fetch + attach pattern: import
`getArtifacts` / `getUnscoredArtifacts` and `computeCoverageRatio`;
attach `coverage` to the view, or `null` when the persona has no
artifacts. Threading is straightforward — the existing command already
takes a `supabase` collaborator.

Verify: `git diff products/landmark/src/commands/timeline.js` shows the
coverage-attach edit and the queries default update.

## Step 4.5 — Timeline formatter below-floor banner

Modified: `products/landmark/src/formatters/timeline.js`

```js
import { COVERAGE_CONFIDENCE_FLOOR, isBelowFloor, floorPercentText } from "../lib/confidence-floor.js";

export function toText(view) {
  const lines = [renderHeader(`Growth timeline for ${view.email}`), ""];

  if (view.coverage && view.coverage.total > 0 && isBelowFloor(view.coverage.ratio)) {
    const pct = (view.coverage.ratio * 100).toFixed(1);
    lines.push(
      `    Coverage below floor (${pct}% < ${floorPercentText()}) — timeline reflects measurement floor, not absence of growth.`,
    );
    lines.push(
      "    Add artifact-interpreted evidence, run Guide's evaluate-evidence skill, or hand-attest markers via WriteEvidence to lift the floor.",
    );
    lines.push("");
  }

  // ...existing per-entry rendering unchanged
}
```

Same `view.coverage.total > 0` guard as readiness — a persona with
zero artifacts is not "below floor," it's "no signal."

Note: when `evidenceRows.length === 0` (persona has artifacts but no
evidence rows yet), the existing command short-circuits to
`view: null` + `NO_ARTIFACTS_FOR_PERSON`-equivalent `NO_EVIDENCE`
empty state at `commands/timeline.js:32-37` and the formatter never
runs; this is **intentional and preserved** — the existing
empty-state UX is the "no signal" path. The below-floor banner fires
for personas with ≥1 evidence row whose coverage measures below floor
(spec criterion 4's "round-robin producer alone" persona, with
`evidenceRows.length > 0`). Plan does not change the empty-state
short-circuit.

Mirror in `toMarkdown`; `toJson` unchanged (view carries `coverage`).

Notes:

- Timeline keeps the per-quarter table rendering above-floor *and*
  below-floor; design § Surface changes calls for a banner not a wrap.
  This preserves the data shape downstream readers depend on while
  framing it correctly.

## Step 4.6 — Coverage command + formatter per-provenance breakdown

Modified: `products/landmark/src/commands/coverage.js` and
`products/landmark/src/formatters/coverage.js`

Command edit: fetch evidence rows for the persona and group by
`provenance`:

```js
import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
// ...
const evidenceRows = await q.getEvidence(supabase, { email: options.email });
const byProvenance = groupEvidenceByProvenance(evidenceRows);
return {
  view: {
    email: options.email,
    name: person.name,
    coverage: ratio,
    byType: allByType,
    uncoveredByType,
    byProvenance,
  },
  meta: { format },
};
```

Add `groupEvidenceByProvenance` to
`products/landmark/src/lib/evidence-helpers.js`:

```js
import { PROVENANCE_CLASSES } from "@forwardimpact/map/activity/provenance";

export function groupEvidenceByProvenance(evidenceRows) {
  const counts = Object.fromEntries(PROVENANCE_CLASSES.map((c) => [c, 0]));
  counts.unknown = 0;
  for (const row of evidenceRows) {
    const p = row.provenance ?? "human_attested"; // DB default
    if (p in counts) counts[p]++;
    else counts.unknown++;
  }
  return counts;
}
```

The `unknown` bucket surfaces rows whose value is outside
`PROVENANCE_CLASSES` (legacy NULL post-migration before the producer
re-tagged it, or a value an out-of-band writer skipped the guard for)
rather than silently dropping them from the visible total. The coverage
formatter (below) renders `unknown` only when its count is non-zero so
the canonical four-row display stays clean in the steady state.

**Row count vs. coverage numerator.** The per-provenance breakdown
counts evidence *rows* — a single artifact may produce multiple rows
across distinct skills under Part 03's per-`(artifact, skill)` ceiling
(Rule 2). The coverage ratio's numerator counts *artifacts* (artifacts
joined to ≥1 evidence row); the two quantities therefore can disagree
in absolute value (rows ≥ scored artifacts). The formatter heading
`By provenance (evidence rows)` discloses the row-counting semantic so
a reader does not interpret `synthetic_placeholder=12,
artifact_interpreted=8` as numerator components of a `4/10 (40%)`
ratio. Computing artifact-bucketed provenance counts is design-shape
work (which provenance class wins when an artifact has rows from
multiple producers?); the row-count semantic is honest within the
spec's criterion 5 contract ("breaks down the numerator by provenance
class" — the breakdown surfaces the same row population the ratio is
derived from, just counted differently).

Formatter edit (`coverage.js` `toText`):

```js
import { COVERAGE_CONFIDENCE_FLOOR, isBelowFloor, floorPercentText } from "../lib/confidence-floor.js";
import { PROVENANCE_CLASSES } from "@forwardimpact/map/activity/provenance";

export function toText(view) {
  const lines = [
    renderHeader(`Evidence coverage for ${view.name} (${view.email})`),
    "",
  ];

  if (view.coverage.total > 0 && isBelowFloor(view.coverage.ratio)) {
    const pct = (view.coverage.ratio * 100).toFixed(1);
    lines.push(
      `    Coverage below floor (${pct}% < ${floorPercentText()}) — interpret the breakdown as a producer-skew diagnostic, not a confidence statement.`,
    );
    lines.push("");
  }

  const pct = (view.coverage.ratio * 100).toFixed(1);
  lines.push(`    ${view.coverage.scored}/${view.coverage.total} artifacts interpreted (${pct}%)`);
  lines.push("");

  lines.push("    By provenance (evidence rows):");
  for (const cls of PROVENANCE_CLASSES) {
    lines.push(`      ${padRight(cls, 24)}  ${view.byProvenance[cls] ?? 0}`);
  }
  if (view.byProvenance.unknown > 0) {
    lines.push(`      ${padRight("unknown", 24)}  ${view.byProvenance.unknown}`);
  }
  lines.push("");

  // existing per-type block unchanged
}
```

Mirror in `toMarkdown` (markdown table with one row per provenance
class). `toJson` unchanged — the view already carries `byProvenance`.

Notes:

- Per-type breakdown retained alongside per-provenance per spec §
  Risks "Criterion 5 introduces a new output element" + design § Key
  decisions row 7.
- Zero-count classes are shown explicitly (criterion 5 verification text).
- **Command-level short-circuit preserved.** `runCoverageCommand`
  short-circuits to `view: null` + `NO_ARTIFACTS_FOR_PERSON` when
  `allArtifacts.length === 0` (existing `coverage.js:46-54`); the
  formatter therefore never sees a zero-artifact view. The
  `total > 0` guard on the below-floor branch is defense-in-depth so
  the formatter is safe to call directly from tests or alternate
  callers that bypass the command-level guard.

Verify: stdout against a seeded persona shows all four
`PROVENANCE_CLASSES` with their counts; below-floor banner above the
ratio line when ratio < 0.30.

## Step 4.6b — `fit-landmark evidence` renders provenance

Modified: `products/landmark/src/formatters/evidence.js`

Criterion 2's verification reads evidence rows via the consumer-facing
path. The JSON formatter (`toJson`) spreads the row, so `provenance`
already surfaces automatically. The text and markdown formatters omit
it today; add a one-line emit per row so the provenance is visible to
operators reading the default output:

```js
// in toText, after the rationale line:
if (row.provenance) lines.push(`        provenance: ${row.provenance}`);

// in toMarkdown, append to the bullet:
lines.push(`- ${status} ${row.marker_text ?? "(no marker)"} (${row.provenance ?? "human_attested"})`);
```

Verify: a seeded persona's `fit-landmark evidence --email <p>` text
output names a provenance class on each row; the JSON variant already
carries it via spread.

## Step 4.7 — `fit-landmark --help` interpolates the floor

Modified: `products/landmark/bin/fit-landmark.js`

```js
import { COVERAGE_CONFIDENCE_FLOOR, floorPercentText } from "../src/lib/confidence-floor.js";

// inside the documentation array, update the "Find Growth Areas and
// Build Evidence" entry's description:
{
  title: "Find Growth Areas and Build Evidence",
  url: "https://www.forwardimpact.team/docs/products/growth-areas/index.md",
  description: `Identify gaps and track progress toward the next level. Readiness, timeline, and coverage commands suppress verdicts and frame output as negative-evidence when coverage falls below ${floorPercentText()}.`,
},
```

Notes:

- The interpolation happens once at module load — `floorPercentText()`
  is a pure function — so `--help` output carries the same value as the
  formatters do at runtime, with no risk of drift.
- The `.claude/skills/fit-landmark/SKILL.md` `## Documentation` block
  does not include description text on each entry, only `(URL) —
  description` lines; the floor mention belongs in CLI `--help` (the
  CLI is the discoverability path for engineers reading `--help` per
  criterion 4(a)). No skill-side edit is required; the parity rule
  applies to titles + URLs, not description text.

Verify: `npx fit-landmark --help` (or
`node products/landmark/bin/fit-landmark.js --help`) includes the floor value in
the "Find Growth Areas and Build Evidence" entry's description.

## Step 4.8 — Command + formatter tests

Modified: `products/landmark/test/{readiness,timeline,coverage}.test.js`

Per file:

1. Update existing stubs to include the new query functions
   (`getArtifacts`, `getUnscoredArtifacts`, `getEvidence` for coverage).
2. Add an "attaches coverage to view" case asserting
   `result.view.coverage.scored/total/ratio` shape.
3. Add an "above floor renders ratio" case asserting the rendered text
   includes `Evidence coverage:` (readiness) or the per-provenance
   block (coverage).
4. Add a "below floor wraps verdict / banner" case: feed `{ scored: 1,
   total: 100, ratio: 0.01 }`; assert the readiness output omits the
   per-skill checklist and the `Missing:` line, includes the floor
   message, and includes the coverage line; assert the timeline output
   includes the banner above the per-quarter table; assert the
   coverage output includes the banner above the ratio.
5. Add a "zero artifacts renders checklist, not below-floor" case:
   stub `getArtifacts` to return `[]`; assert the readiness output
   renders the per-skill checklist (no below-floor wrap), and the
   `Evidence coverage:` line is absent (coverage is `null`); assert
   the timeline output does not include the below-floor banner.
6. Add a "per-provenance breakdown shown explicitly with zero classes"
   case for the coverage formatter; assert the `unknown` row is
   suppressed when its count is zero and rendered when non-zero.

Verify: `bun test products/landmark/test/readiness.test.js
products/landmark/test/timeline.test.js
products/landmark/test/coverage.test.js` — all cases pass.

## Step 4.9 — Confidence-floor test

Created: `products/landmark/test/lib/confidence-floor.test.js`

Three cases:

1. `COVERAGE_CONFIDENCE_FLOOR === 0.3`.
2. `isBelowFloor(0.29) === true`; `isBelowFloor(0.30) === false`;
   `isBelowFloor(0.31) === false`.
3. `floorPercentText() === "30%"`.

Verify: `bun test products/landmark/test/lib/confidence-floor.test.js` passes.

## Verification

```text
bun test products/landmark
node products/landmark/bin/fit-landmark.js --help | grep "Find Growth Areas"
```

All landmark tests pass; `--help` output renders the floor value in the
Find Growth Areas documentation entry.
