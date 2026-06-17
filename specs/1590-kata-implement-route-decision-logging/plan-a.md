# Plan A — kata-implement route-decision context

Spec: [spec.md](./spec.md) · Design: [design-a.md](./design-a.md).

## Approach

Add a single source-of-truth route registry to `libxmr`, extend the
recorder, validator, and analyze reader to consume it, document the
convention in a new `kata-implement` reference, and guard doc/code drift
with a `.coaligned` invariant. Route context is a parsed sub-grammar inside
the existing `note` field; the global CSV header is untouched, so existing
rows stay byte-identical. Validation is gated on a metric allowlist and a
`CONVENTION_START` date set strictly after every existing route-bearing row
(the file carries non-grammar `implementations_shipped` rows through
2026-06-17), so the whole pre-convention file (slots 40–66) stays valid and
only rows the shipped surface writes are checked. Steps are ordered so the
registry (Step 1) lands before its consumers; Steps 2–5 are independent
given Step 1.

Libraries used: libxmr (csv, analyze, record command, constants),
libcoaligned (invariant rule host).

## Step 1 — Route registry (single source of truth)

Intent: declare the closed route set, the route-bearing metrics, the
convention-start date, and the parse/format helpers in one module.

Files: `libraries/libxmr/src/routes.js` (created),
`libraries/libxmr/src/index.js` (modified, re-export).

```js
// routes.js
export const ROUTES = {
  1: "design self-pick",
  2: "plan-draft",
  3: "plan-approved-no-impl",
  4: "fix fallback",
};
export const ROUTE_NONE = "none"; // fired no implementation route
export const ROUTE_BEARING_METRICS = ["implementations_shipped"];
// Convention applies to rows the shipped recording surface writes, which
// are strictly after every existing route-bearing row (latest is
// 2026-06-17). A concrete date is committed now — NOT a placeholder — so
// validation cannot be silently disabled; Step 6 asserts it is a valid ISO
// date strictly greater than the latest existing CSV row's date.
export const CONVENTION_START = "2026-06-18"; // ISO yyyy-mm-dd

// route_taken is required; routes_eligible is optional so the on-disk
// `route_taken=none (…)` form (no eligible clause) parses to {none, []}.
const ROUTE_RE = /route_taken=(\d+|none)/;
const ELIGIBLE_RE = /routes_eligible=\[([0-9,\s]*)\]/;

/** Parse route context from a note; absent route → empty fields. */
export function parseRouteContext(note) {
  const text = note ?? "";
  const rm = ROUTE_RE.exec(text);
  if (!rm) return { routeTaken: "", routesEligible: [] };
  const em = ELIGIBLE_RE.exec(text);
  const routesEligible = em
    ? em[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  return { routeTaken: rm[1], routesEligible };
}

/** Format the note prefix from typed values. */
export function formatRouteContext({ routeTaken, routesEligible = [] }) {
  return `route_taken=${routeTaken}; routes_eligible=[${routesEligible.join(",")}]`;
}

export function isKnownRoute(id) {
  // ROUTE_NONE short-circuits; any non-numeric, non-"none" id is false
  // because Number("foo") is NaN and ROUTES has no NaN key.
  return id === ROUTE_NONE || Object.hasOwn(ROUTES, Number(id));
}
```

Verification: `bun test libraries/libxmr/test/routes.test.js` (new — written
in Step 6, which is this step's standalone verification gate) covers parse
of a present prefix, an absent prefix, the bare `route_taken=none (…)` form
with no eligible clause, an empty eligible list, `isKnownRoute` accepting
`none` and `1`–`4` and rejecting `5`/`x`, and an assertion that
`CONVENTION_START` is a valid ISO date `> "2026-06-17"`.

## Step 2 — parseLine stamps route fields

Intent: every parsed row carries `routeTaken`/`routesEligible` so readers
partition without re-parsing.

Files: `libraries/libxmr/src/csv.js` (modified).

- Import `parseRouteContext` from `./routes.js`.
- In `parseLine`, after building the row object, spread
  `parseRouteContext(row.note)` onto it (the field is computed from the
  already-unquoted `note`, so quote stripping in the field loop runs first).

Verification: `bun test libraries/libxmr/test/csv.test.js` — a row with a
route prefix yields `routeTaken`/`routesEligible`; a plain note yields
empty values.

## Step 3 — Conditional, forward-only validation

Intent: reject a route-bearing row at/after `CONVENTION_START` whose route
is missing or outside the known set; leave every other row valid.

Files: `libraries/libxmr/src/csv.js` (modified, `validateRow`).

- Import `ROUTE_BEARING_METRICS`, `CONVENTION_START`, `parseRouteContext`,
  `isKnownRoute`.
- In `validateRow`, after the existing checks, add:

```js
if (
  ROUTE_BEARING_METRICS.includes(row.metric) &&
  row.date >= CONVENTION_START
) {
  const { routeTaken } = parseRouteContext(row.note);
  if (!routeTaken) {
    errors.push({ line: lineNumber, field: "route_taken",
      message: "missing route-decision context on a route-bearing row" });
  } else if (!isKnownRoute(routeTaken)) {
    errors.push({ line: lineNumber, field: "route_taken",
      message: `unknown route "${routeTaken}"` });
  }
}
```

Verification (SC3): `bun test libraries/libxmr/test/csv.test.js` — a
post-`CONVENTION_START` route-bearing row with empty/unknown route reports
`{line, field:"route_taken"}`; a pre-`CONVENTION_START` row without the
prefix is valid; a non-route-bearing metric (e.g. `specs_drafted`) is
valid. Plus: `fit-xmr validate wiki/metrics/kata-implement/2026.csv` exits
0 (SC4 — existing rows stay valid).

## Step 4 — Recorder flags

Intent: the recording surface writes the grammar from typed flags and
rejects bad input before writing.

Files: `libraries/libxmr/src/commands/record.js` (modified),
`libraries/libxmr/bin/fit-xmr.js` (modified, add `route` and
`routes-eligible` options to the `record` command).

- Add options `--route <id>` and `--routes-eligible <csv-list>` to the
  `record` command definition (string types).
- In `parseRecordOptions`/`runRecordCommand`: when
  `ROUTE_BEARING_METRICS.includes(metric)`, require `--route` and reject a
  route failing `isKnownRoute` (return `{ok:false, code:2, error}`). Prepend
  `formatRouteContext({routeTaken: values.route, routesEligible:
  (values["routes-eligible"]||"").split(",").filter(Boolean)}) + "; "` to
  `opts.note`.

Verification (SC1): `bun test libraries/libxmr/test/record.test.js` — a
recorded route-bearing row's note begins with
`route_taken=…; routes_eligible=[…];`; a missing/unknown route exits
non-zero; a non-route-bearing record is unaffected.

## Step 5 — analyze --route partition reader

Intent: name the canonical reader (SC2). `fit-xmr analyze --route N`
returns exactly the rows whose recorded route is N.

Files: `libraries/libxmr/src/analyze.js` (modified),
`libraries/libxmr/src/commands/analyze.js` (modified),
`libraries/libxmr/bin/fit-xmr.js` (modified, add `route` and
`routes-eligible-includes` options to `analyze`).

- `analyze(csvText, { eventType, route, routesEligibleIncludes })`: after
  the `eventType` filter and before grouping, filter parsed rows by
  `route` (exact `row.routeTaken`) and/or `routesEligibleIncludes`
  (`row.routesEligible.includes(id)`). **When both are `undefined` the
  filter is inert** — `analyze` returns the same series it does today, so a
  plain `fit-xmr analyze` produces the identical xRule2 verdict (SC4).
- `runAnalyzeCommand`: pass `values.route` and
  `values["routes-eligible-includes"]` through.

Verification (SC2): `bun test libraries/libxmr/test/analyze.test.js` — on a
fixture whose route rows all carry `event_type=kata-shift` (the default
slice), `--route 1` returns exactly the route-1 rows (count equals a grep of
`route_taken=1` under that slice), and `--routes-eligible-includes 3`
returns exactly the rows whose eligible set contains `3`. A no-filter
`analyze` call returns the unfiltered series unchanged.

## Step 6 — Tests

Files: `libraries/libxmr/test/routes.test.js` (created); additions to
`csv.test.js`, `record.test.js`, `analyze.test.js`.

Each new behaviour above gets a test; covers parse, validate (forward-only +
allowlist), record (prepend + rejection), and analyze partition.

Verification: `bun run test` green.

## Step 7 — Convention doc + SKILL pointer

Intent: document the four routes and the recording rule at one location a
fresh activation can read (SC5).

Files: `.claude/skills/kata-implement/references/route-decision.md`
(created), `.claude/skills/kata-implement/references/metrics.md` (modified,
link), `.claude/skills/kata-implement/SKILL.md` (modified, Memory § Metrics
bullet references `references/route-decision.md`).

`route-decision.md` documents: the four routes (id → label, matching
`ROUTES`), `route_taken=none`, and the recording rule (`npx fit-xmr record
--skill kata-implement --metric implementations_shipped --value <n> --route
<id> --routes-eligible <list>`). Genericity: names the published CLI and
`wiki/metrics/{skill}/`, no library paths.

Verification (SC5): a fresh read of SKILL.md + `route-decision.md` is
sufficient to record a compliant row; cross-checked in the panel review.

## Step 8 — Drift-guard invariant

Intent: a divergence between `route-decision.md` and `ROUTES` fails the
build, naming which side drifted (SC6).

Files: `.coaligned/invariants/route-registry.rules.mjs` (created).

- `build({root})`: import `ROUTES` from `libraries/libxmr/src/routes.js`;
  parse the route id→label table out of
  `.claude/skills/kata-implement/references/route-decision.md` (text scrape,
  same shape as `public-cli-set.rules.mjs`). Diff the two sets; emit a
  `subjects` entry per mismatched id with `{path, line, message}` naming the
  drifted side.
- `rules`: one rule, `severity:"fail"`, `message:(s)=>s.message`.

This rule guards only the **doc↔`ROUTES`** axis. The recording surface,
validator, and analyze reader consume `ROUTES`/`ROUTE_BEARING_METRICS` by
direct import, so their alignment is structural (a removed route id is a
build/test error at the import site) — no rule needed. Together the import
coupling plus this rule satisfy SC6 across all three consumers.

Verification (SC6): `bun run invariants` passes when aligned; add a route to
`ROUTES` without updating the doc (or vice versa) and `bun run invariants`
fails naming the divergence.

## Risks

- **`CONVENTION_START` must clear every existing route-bearing row.** The
  CSV already carries `implementations_shipped` rows through 2026-06-17,
  several without the grammar (e.g. the 2026-06-17 `W25-1810-impl` row and
  three 2026-06-11/12 storyboard rows). A merge-date value would validate
  those and break the build. The plan pins `2026-06-18` (strictly after the
  latest existing row); Step 6 asserts this invariant in a test so a future
  row backdated before it cannot silently slip the gate. Pilot rows 40–66
  all predate it: not validated, and excluded from SC7's count, whose
  follow-up query filters `date >= CONVENTION_START`.
- **`route_taken=none (…)` on-disk form** (pre-convention row 78) carries no
  `routes_eligible` clause. The two-regex parser (Step 1) parses it to
  `{none, []}` rather than failing, so an `analyze --route none` matches the
  same rows a `grep route_taken=none` finds — preserving SC2 grep-equality
  even on the legacy form. Covered by a Step 2 test on that exact note shape.
- **`routes_eligible` list quoting**: a multi-id list embeds a comma, so
  `csvField` quotes the whole `note`; `parseLine` strips the quotes before
  the route fields are computed. Single-id lists are unquoted. Both parse;
  covered by a Step 2 test using a quoted multi-id fixture row.

## Execution

Single engineering agent, sequential. Step 1 first (all others import it).
Steps 2–5 depend only on Step 1; Step 6 tests them; Steps 7–8 (docs +
invariant) are independent of 2–6 but depend on Step 1's `ROUTES`. The
`.claude/**` writes in Steps 7–8 follow self-improvement.md.

— Staff Engineer 🛠️
