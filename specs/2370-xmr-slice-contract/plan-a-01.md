# Plan 2370-a Part 01: The library, slice resolution, the marker token, one writer rule

The first merge. It changes `libraries/libxmr`, `libraries/libwiki`, and the
`gemba` bin with its goldens. The two library READMEs ship inside the npm
packages, so they change here. No instruction file changes here.

Depends on: nothing to author. Route: `staff-engineer`. Pull request title:
`feat(libxmr)!: the read slice comes from the caller or the file (#2370)`.
It merges only once part 02 is panel-clean, and `release-engineer` merges
part 02 next in the same session (plan-a.md § Execution). The merge comment
names part 02 as the next merge and part 03 as `release-engineer`'s.

`libxmr` takes a major bump at the cut (part 03). This part leaves every
`version` field as it is and records the break in the CHANGELOGs.

## Step 1: The constants and the parser

Normalise the `event_type` cell once, give the schema range one home, and
remove the built-in slice.

Modified: `libraries/libxmr/src/constants.js`, `libraries/libxmr/src/csv.js`

- `constants.js`: delete `EVENT_TYPE_COLUMN`, `DEFAULT_SHIFT_TYPE`, and the
  three comment lines above it. Add after `LEGACY_HEADER`:

  ```js
  // A row holds the seven legacy columns or the eight current ones. The range
  // derives from the two headers, so the column count has one home.
  export const MIN_FIELDS = LEGACY_HEADER.split(",").length;
  export const MAX_FIELDS = HEADER.split(",").length;
  // The reserved off-workflow value. `record` writes it when the caller names
  // no slice and no host workflow exists. It is not a workflow filename, and
  // no workflow file may take the name.
  export const INTERACTIVE_EVENT_TYPE = "interactive";
  ```

- `csv.js`:
  - Drop the `DEFAULT_SHIFT_TYPE` import; import the two range constants.
  - Add beside `parseLine`:

    ```js
    /** The one normalisation of a slice value: the trimmed string, or "" for no value. */
    export function normalizeSlice(value) {
      return typeof value === "string" ? value.trim() : "";
    }
    ```

  - `parseLine(line)`: strip one trailing `\r` before the split
    (`const text = line.endsWith("\r") ? line.slice(0, -1) : line;`) and read
    `eventType: normalizeSlice(fields[6])`. `raw.fields` holds the split of
    the stripped text. The JSDoc says the cell is normalised here and every
    later reader sees the normalised value.
  - `validateRow`: add a first check before the date check:

    ```js
    const count = row.raw.fields.length;
    if (count < MIN_FIELDS || count > MAX_FIELDS) {
      errors.push({
        line: lineNumber,
        field: "row",
        message: `field count ${count} is outside the schema range ${MIN_FIELDS} to ${MAX_FIELDS}`,
      });
    }
    ```

    The `missing event_type` check reads `row.eventType === ""`.
  - Delete `listMetrics` and its JSDoc (step 2 re-homes it; step 6 moves its
    import and tests).

Verify:
`rg -n 'DEFAULT_SHIFT_TYPE|EVENT_TYPE_COLUMN|listMetrics' libraries/libxmr/src/csv.js libraries/libxmr/src/constants.js`
returns no match.

## Step 2: `analyze` and `listMetrics` take rows and a required slice

Make the slice the caller's at the library seam.

Modified: `libraries/libxmr/src/analyze.js`

- Drop the `parseCSV` and `DEFAULT_SHIFT_TYPE` imports (`MIN_POINTS` stays) and
  import `normalizeSlice` from `./csv.js`. Add:

  ```js
  function assertSlice(eventType, fn) {
    const slice = normalizeSlice(eventType);
    if (slice === "") {
      throw new TypeError(
        `${fn} requires options.eventType: a slice name or "*"`,
      );
    }
    return slice;
  }

  function groupByMetric(rows) {
    const groups = Object.create(null); // keyed by a CSV cell, as tallySlices is
    for (const row of rows) {
      if (!groups[row.metric]) groups[row.metric] = [];
      groups[row.metric].push(row);
    }
    for (const group of Object.values(groups)) {
      group.sort((a, b) => a.date.localeCompare(b.date));
    }
    return groups;
  }
  ```

- `analyze(rows, { eventType, priorReadAnchor, route, routesEligibleIncludes } = {})`:
  `const slice = assertSlice(eventType, "analyze")`, then
  `selectRows(rows, { eventType: slice, route, routesEligibleIncludes })`, then
  `groupByMetric` in place of its own grouping loop. Rewrite the comment block:
  the slice is the caller's, the library holds no default, and `"*"` means every
  row.
- Add `listMetrics(rows, { eventType } = {})`: `assertSlice`, then
  `selectRows(rows, { eventType: slice })`, then `groupByMetric`, then the
  inventory `csv.js` held (`metric`, `unit`, `n`, `from`, `to`).

Verify: `rg -n 'DEFAULT_SHIFT_TYPE|parseCSV' libraries/libxmr/src/analyze.js`
returns no match.

## Step 3: The slice module

Resolve the slice in library core behind one composed entry point per read
shape.

Created: `libraries/libxmr/src/slice.js`

```js
import { parseCSV, normalizeSlice } from "./csv.js";
import { analyze, listMetrics } from "./analyze.js";

/** A read could not resolve its slice. Carries the explicit value and the tally; no remedy text. */
export class SliceResolutionError extends Error {
  constructor(message, { explicit, tally }) {
    super(message);
    this.name = "SliceResolutionError";
    this.explicit = explicit;
    this.tally = tally;
  }
}

/** Count rows per normalised event_type value, the rows whose value is empty (kept apart), and the total. */
export function tallySlices(rows) {
  const counts = Object.create(null);
  let empty = 0;
  for (const row of rows) {
    if (row.eventType === "") empty++;
    else counts[row.eventType] = (counts[row.eventType] || 0) + 1;
  }
  return { counts, empty, total: rows.length };
}

const rowCount = (n) => `${n} ${n === 1 ? "row" : "rows"}`;

/** Render a tally as `a (3 rows), b (1 row)` with `; empty: n rows` when rows carry no value. */
export function formatTally({ counts, empty }) {
  const text = Object.keys(counts)
    .sort()
    .map((v) => `${v} (${rowCount(counts[v])})`)
    .join(", ");
  return empty > 0 ? `${text}${text ? "; " : ""}empty: ${rowCount(empty)}` : text;
}

/** Apply the spec's slice-resolution table. Returns the slice to read, or throws SliceResolutionError. */
export function resolveReadSlice(explicit, tally) {
  const choice = normalizeSlice(explicit);
  if (choice === "*") return "*";
  if (choice !== "") {
    if (tally.counts[choice] !== undefined || tally.total === 0) return choice;
    throw new SliceResolutionError(
      `no rows with event_type "${choice}"; present: ${formatTally(tally)}`,
      { explicit: choice, tally },
    );
  }
  if (tally.total === 0) return "*";
  const values = Object.keys(tally.counts);
  if (values.length === 1) return values[0];
  if (values.length === 0) {
    throw new SliceResolutionError(
      `every row has an empty event_type (${rowCount(tally.empty)})`,
      { explicit: null, tally },
    );
  }
  throw new SliceResolutionError(
    `several event_type values: ${formatTally(tally)}`,
    { explicit: null, tally },
  );
}

// Parse once, tally, resolve. Both composed reads start here.
function parseAndResolve(csvText, eventType) {
  const rows = parseCSV(csvText);
  const tally = tallySlices(rows);
  return { rows, tally, eventType: resolveReadSlice(eventType, tally) };
}

/** Parse once, tally, resolve, analyze. Returns the report with the resolved `eventType` and the `tally`. */
export function analyzeSlice(csvText, { eventType, priorReadAnchor, route, routesEligibleIncludes } = {}) {
  const r = parseAndResolve(csvText, eventType);
  const report = analyze(r.rows, { eventType: r.eventType, priorReadAnchor, route, routesEligibleIncludes });
  return { ...report, eventType: r.eventType, tally: r.tally };
}

/** Parse once, tally, resolve, list. Returns `{ metrics, eventType, tally }`. */
export function listSliceMetrics(csvText, { eventType } = {}) {
  const r = parseAndResolve(csvText, eventType);
  return { metrics: listMetrics(r.rows, { eventType: r.eventType }), eventType: r.eventType, tally: r.tally };
}
```

Modified: `libraries/libxmr/src/index.js`: drop `listMetrics` from the
`./csv.js` export list and export it from `./analyze.js`; export
`analyzeSlice`, `listSliceMetrics`, `formatTally`, and
`SliceResolutionError` from `./slice.js`; drop `EVENT_TYPE_COLUMN` and
`DEFAULT_SHIFT_TYPE` from the constants export. `normalizeSlice`,
`INTERACTIVE_EVENT_TYPE`, `MIN_FIELDS`, `MAX_FIELDS`, `tallySlices`, and
`resolveReadSlice` stay module-level exports with no package-root line; the
part 05 scripts read the headers and the range from the constants module by
path.

Verify:
`bun -e 'import("@forwardimpact/libxmr").then(m => console.log(typeof m.analyzeSlice, m.DEFAULT_SHIFT_TYPE))'`
prints `function undefined`.

## Step 4: The read commands and the read seam

Route every read command through the composed functions, one error
envelope, and one label.

Deleted: `libraries/libxmr/src/commands/slice.js`

Modified: `libraries/libxmr/src/format.js`, `libraries/libxmr/src/index.js`,
`libraries/libxmr/src/commands/guard.js`,
`libraries/libxmr/src/commands/analyze.js`,
`libraries/libxmr/src/commands/list.js`,
`libraries/libxmr/src/commands/chart.js`,
`libraries/libxmr/src/commands/summarize.js`

- `src/format.js`, beside `fmt1`, exported from `index.js` with it, so the
  commands and `libwiki`'s renderer print `*` the same way:

  ```js
  /** The human form of a slice for text output. */
  export function sliceLabel(eventType) {
    return eventType === "*" ? "* (all rows)" : eventType;
  }
  ```

- `guard.js` becomes the commands' read seam. Rename the export to
  `withReadGuard`, import `SliceResolutionError` from `../slice.js`, keep the
  `cannot parse CSV` branch, and add the second branch:

  ```js
  if (err instanceof SliceResolutionError) {
    return {
      ok: false,
      code: 2,
      error: `cannot resolve slice for "${csvPath}": ${err.message}. Pass --event-type <name> or --event-type '*'`,
    };
  }
  ```

  The header comment says the guard covers the two read-seam error classes. The
  commands import `sliceLabel` from `../format.js`.
- `analyze.js`, `summarize.js`: replace the `resolveSlice` call and
  `analyze(text, …)` with
  `withReadGuard(csvPath, () => analyzeSlice(text, { eventType: values["event-type"], … }))`.
  Set `report.eventTypeLabel = sliceLabel(report.eventType)`; `report.eventType`
  comes from the composed function.
- `chart.js`: same call with `{ eventType: values["event-type"] }`; the
  no-metrics and header lines use `sliceLabel(report.eventType)`.
- `list.js`:
  `withReadGuard(csvPath, () => listSliceMetrics(text, { eventType: values["event-type"] }))`;
  the JSON `event_type` and the text label come from the returned `eventType`.

Verify: `rg -n 'resolveSlice|withIntegrityGuard' libraries/libxmr/src` returns
no match.

## Step 5: `record` writes the reserved value

Give an off-workflow row its honest value instead of a refusal.

Modified: `libraries/libxmr/src/commands/record.js`

- Import `INTERACTIVE_EVENT_TYPE` from `../constants.js`, `normalizeSlice`
  from `../csv.js`, and `analyzeSlice` from `../slice.js` (in place of
  `analyze`).
- Replace the `eventType` resolution and its refusal with
  `const eventType = normalizeSlice(values["event-type"]) || workflowName(runtime.proc.env.GITHUB_WORKFLOW_REF) || INTERACTIVE_EVENT_TYPE;`
  and the comment: flag, else host workflow filename, else the reserved value.
- The `workflowName` comment's example becomes
  `owner/repo/.github/workflows/nightly-review.yml@refs/heads/main`.
- `printSummary`: `analyzeSlice(text, { eventType })`.

Verify, from the repository root with `GITHUB_WORKFLOW_REF` and
`GITHUB_RUN_ID` unset:

```sh
bun products/gemba/bin/gemba-xmr.js record --skill probe --metric widgets --value 5 --wiki-root /tmp/w2370
tail -1 /tmp/w2370/metrics/probe/$(date +%Y).csv          # ends ,interactive,local (S18)
rm -rf /tmp/w2370
GITHUB_WORKFLOW_REF="o/r/.github/workflows/agent-shift.yml@refs/heads/main" \
  bun products/gemba/bin/gemba-xmr.js record --skill probe --metric widgets --value 5 --unit count --wiki-root /tmp/w2370
bun products/gemba/bin/gemba-xmr.js list /tmp/w2370/metrics/probe/$(date +%Y).csv   # prints the widgets row, exit 0 (S1)
rm -rf /tmp/w2370
```

## Step 6: `libxmr` tests

Replace the tests of the removed behaviours and add the slice module's.

Modified: `libraries/libxmr/test/helpers.js`,
`libraries/libxmr/test/csv.test.js`, `libraries/libxmr/test/analyze.test.js`,
`libraries/libxmr/test/provenance.test.js`,
`libraries/libxmr/test/guard.test.js`, `libraries/libxmr/test/list.test.js`,
`libraries/libxmr/test/summarize.test.js`,
`libraries/libxmr/test/record.test.js`

Created: `libraries/libxmr/test/slice.test.js`,
`libraries/libxmr/test/format.test.js`

The shifted-row fixture the `validate` cases use:

```csv
date,metric,value,unit,run,note,event_type,host_run
2026-01-02,widgets,2,count,,note with a comma, which shifts everything,kata-shift,124
```

| File                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helpers.js`         | Export `MIXED_CSV` (legacy header; `dispatch_only` rows with values 1 and 2 under `kata-dispatch`, `shift_only` rows with values 100 and 101 under `kata-shift`) and `SINGLE_CSV` (legacy header; two `shift_only` rows under `kata-shift`). The guard, list, and analyze command cases below import them in place of their local two-row fixtures.                                                                                                                                                                      |
| `csv.test.js`        | Move the `listMetrics` describe and its import to `analyze.test.js`. Delete the `listMetrics(MERGE_CONFLICT, "*")` case (the `parseCSV` case beside it proves the throw; `slice.test.js` covers the composed reads). Add to `parseLine`: a line ending `\r` yields `hostRun` without it, and ` x ` trims to `x`. Add `normalizeSlice`: a padded string trims, and a non-string is `""`. Add to `validateCSV`: the fixture above yields an error on line 2 whose message holds `7 to 8` and `9` (S9); a legacy-header file with one seven-field and one eight-field row is valid; a six-field row reports both the missing `event_type` and the field count. |
| `analyze.test.js`    | Every `analyze(csvText, …)` becomes `analyze(parseCSV(csvText), …)`; a call that passed no `eventType` gains `eventType: "*"`, and a call that passed one keeps it. The "analyze event_type slices" describe (line 145) drops its inline `mixed` fixture for `MIXED_CSV`: the explicit case asserts `shift_only` has `[100, 101]`, the `"*"` case asserts two metrics with two points each, and the no-rows case keeps `kata-coaching`. Replace "default slice is kata-shift" with "throws TypeError without a slice" (S6) and add the same for `listMetrics`. Add the moved `listMetrics` cases on rows. The "analyze command slice names" block runs over `MIXED_CSV`: its no-flag text and JSON cases become the exit-2 ambiguous envelope, the `"*"` case stays, and a `SINGLE_CSV` case proves the inferred value appears in the text label and the JSON `event_type`. |
| `provenance.test.js` | Call sites take rows and `eventType: "*"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `guard.test.js`      | Keep the conflict-marker block. Add a describe over the same four commands with `MIXED_CSV` and no flag: `ok` false, `code` 2, the message starts `cannot resolve slice for`, holds `kata-dispatch (2 rows), kata-shift (2 rows)`, and ends with the flag remedy; stdout stays empty (S2). Add one case with `--event-type nope` on that fixture (S3).                                                                                                                                                                      |
| `format.test.js`     | New file. `sliceLabel`: `*` renders `* (all rows)`, a name renders itself.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `list.test.js`       | The local fixture becomes `MIXED_CSV`, which keeps the `dispatch_only` and `shift_only` names its cases assert. "defaults to the kata-shift slice and names it" becomes "resolves the sole slice and names it" over `SINGLE_CSV`, and "json output carries the slice" (line 51) moves to `SINGLE_CSV` too. Add: a file whose rows all carry an empty value fails and the message names the row count (S4); a legacy-header file whose rows carry `x` and `x\r` lists one metric with `n` equal to the row count (S5); `--event-type '*'` on `MIXED_CSV` lists both metrics and exits 0 (S3).      |
| `summarize.test.js`  | `mixedCSV()` (lines 229-238) becomes `twentyRowCSV(slices)`, with `slices` defaulting to its two names, so the explicit-slice and chart cases keep their twenty-row fixture and the inference cases call `twentyRowCSV(["kata-shift"])` (a one-slice fixture is not mixed, so the name says what stays constant). "summarize defaults to the kata-shift slice and names it" (240) and "chart names the slice above the chart body" (274) become sole-slice inference cases over that single-slice fixture, and the JSON case asserts `event_type` equals the inferred value.                                                                                                                 |
| `record.test.js`     | Replace "returns code 2 when neither --event-type nor $GITHUB_WORKFLOW_REF is set" with "writes the reserved value when neither is set": `ok` true, the row's seventh field is `interactive` and the eighth `local` (S18). Add: `--event-type "  "` is no choice.                                                                                                                                                                                                                                                                                                                                 |
| `slice.test.js`      | `tallySlices`: counts, the separate empty count, the total, and that ` a ` and `a\r` tally as one value after `parseCSV`. `resolveReadSlice`, one case each: no choice on a header-only tally returns `*`; no choice on one value returns it; no choice on two values throws and the message lists both with counts; no choice on an only-empty tally throws and names the empty count; `*` returns `*` on any tally; a present name returns it; an absent name on a non-empty tally throws and lists the values present and the empty count; an absent name on a header-only tally returns the name; `""` and `"  "` count as no choice. `formatTally`: the singular, the plural, and the empty suffix. `analyzeSlice`: returns `metrics`, the resolved `eventType`, and the `tally`; forwards `priorReadAnchor` (a signal gains provenance), `route`, and `routesEligibleIncludes` (the partitioned counts match `analyze` on the same rows); a conflict-marker CSV throws `CSVIntegrityError`. `listSliceMetrics`: returns `metrics`, `eventType`, and `tally`, and infers the sole slice. `SliceResolutionError`: carries `explicit` and `tally`, and its message holds no flag or token text. |

Verify: from `libraries/libxmr`, `bun run test` passes, and
`rg -n 'kata-shift' libraries/libxmr/src` returns no match (S6).

## Step 7: The marker grammar and the scanner

Let a marker name its slice and carry its tokens under one grammar.

Modified: `libraries/libwiki/src/constants.js`,
`libraries/libwiki/src/marker-scanner.js`,
`libraries/libwiki/src/audit/rule-builders.js`,
`libraries/libwiki/src/audit/rules.js`

- `constants.js`: move `ISO_DATE_RE` here from `audit/rule-builders.js` (one
  home inside the package; `rules.js` imports it from `../constants.js` in place
  of its line 40 import, and `rule-builders.js` drops the literal and the
  export). Replace `XMR_OPEN_RE` and its comment with:

  ```js
  // Storyboard XmR marker: `<!-- xmr:<metric>:<csv> [key=value]... [free text] -->`.
  // Tokens are the `key=value` words that directly follow the CSV path, in any
  // order. The first word without `=` begins free text (typically "Do not
  // edit. Auto-generated."). A value may be empty, so a bare `key=` reaches
  // the scanner as an unusable value. Capture groups: 1 metric, 2 csvPath,
  // 3 the token run. One home so the scanner (marker-scanner.js) and the
  // audit's balance check (audit/rules.js) cannot drift on the syntax.
  export const XMR_OPEN_RE =
    /^<!--\s*xmr:([^:\s]+):(\S+)((?:\s+[^\s=>]+=[^\s>]*)*)(?:\s+[^>]*?)?\s*-->\s*$/;
  // The keys the renderer honours, each with the block field it sets, the
  // check its value must pass, and the placeholder a notice shows for it. One
  // map, so a key added here gets all three in the same edit, and the
  // renderer's known-token notice derives from it. The reasons are the one
  // vocabulary the scanner writes and the renderer reads.
  export const XMR_TOKENS = Object.freeze({
    event_type: { field: "eventType", placeholder: "<slice>", valid: (value) => value !== "" },
    prior: { field: "priorReadAnchor", placeholder: "<YYYY-MM-DD>", valid: (value) => ISO_DATE_RE.test(value) },
  });
  export const XMR_TOKEN_REASONS = Object.freeze({
    unknown: "unknown",
    repeated: "repeated",
    unusable: "unusable",
  });
  ```

- `marker-scanner.js`: import `XMR_TOKENS` and `XMR_TOKEN_REASONS` from
  `./constants.js`, and add:

  ```js
  // `run` is group 3 of XMR_OPEN_RE: every word holds a non-empty key, then
  // `=`, then a possibly empty value (which may itself hold `=`). A known key
  // is `seen` once judged, usable or not, so its second occurrence is
  // `repeated`; an unknown key is reported each time it appears.
  function parseXmrTokens(run) {
    const out = { eventType: null, priorReadAnchor: null, tokenErrors: [] };
    const seen = new Set();
    for (const token of run.split(/\s+/).filter(Boolean)) {
      const at = token.indexOf("="); // never -1 or 0 under the regex
      const key = token.slice(0, at);
      const value = token.slice(at + 1);
      // hasOwn, so a prototype name such as `constructor=x` is unknown, not a hit.
      if (!Object.hasOwn(XMR_TOKENS, key)) {
        out.tokenErrors.push({ key, value, reason: XMR_TOKEN_REASONS.unknown });
        continue;
      }
      const { field, valid } = XMR_TOKENS[key];
      if (seen.has(key)) {
        out.tokenErrors.push({ key, value, reason: XMR_TOKEN_REASONS.repeated });
      } else if (!valid(value)) {
        out.tokenErrors.push({ key, value, reason: XMR_TOKEN_REASONS.unusable });
      } else {
        out[field] = value;
      }
      seen.add(key);
    }
    return out;
  }
  ```

  `tryOpen` spreads `parseXmrTokens(xmrMatch[3])` into the xmr open record, and
  `closePair` copies `eventType`, `priorReadAnchor`, and `tokenErrors` onto the
  pair. The JSDoc on `scanMarkers` names the three fields.

Verify: from `libraries/libwiki`, `bun run test` passes the existing `prior=`
case unchanged, and `rg -n 'ISO_DATE_RE = ' libraries/libwiki/src` matches in
`constants.js` only.

## Step 8: The block renderer and the refresh

Render every XmR failure as a notice inside the block.

Modified: `libraries/libwiki/src/block-renderer.js`,
`libraries/libwiki/src/commands/refresh.js`

- `block-renderer.js`: delete `BlockRenderError`. Import `analyzeSlice`,
  `SliceResolutionError`, `formatTally`, `renderChart`, and `MIN_POINTS` from
  `@forwardimpact/libxmr`, and `XMR_TOKENS` and `XMR_TOKEN_REASONS` from
  `./constants.js`. At module level:

  ```js
  const KNOWN_TOKENS = `Known tokens: ${Object.entries(XMR_TOKENS)
    .map(([key, { placeholder }]) => `\`${key}=${placeholder}\``)
    .join(", ")}.`;
  const SLICE_HINT = `Set \`event_type=${XMR_TOKENS.event_type.placeholder}\` on the marker, or \`event_type=*\` for all rows.`;
  const TOKEN_CAUSE = Object.freeze({
    [XMR_TOKEN_REASONS.unknown]: (e) => `Unknown marker token \`${e.key}=${e.value}\`.`,
    [XMR_TOKEN_REASONS.repeated]: (e) => `Repeated marker token \`${e.key}\`.`,
    [XMR_TOKEN_REASONS.unusable]: (e) => `Unusable value for \`${e.key}=${e.value}\`.`,
  });
  // The scanner is the only producer of tokenErrors and writes exactly these
  // three reasons, so the lookup needs no fallback.
  const tokenCause = (e) => TOKEN_CAUSE[e.reason](e);
  const notice = (cause, detail) => [
    `> **XmR block not rendered.** ${cause}`,
    `> ${detail}`,
  ];
  ```

  `renderBlock({ metric, csvPath, projectRoot, fs, eventType, priorReadAnchor, tokenErrors = [] })`,
  in order:

  | Case                                       | Cause line                                                      | Detail line                                   |
  | ------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------- |
  | `tokenErrors` non-empty                    | `tokenErrors.map(tokenCause).join(" ")`                         | `KNOWN_TOKENS`                                |
  | the CSV read throws                        | `` Could not read `<csvPath>`. ``                               | `The marker names a file this wiki cannot read.` |
  | `analyzeSlice` throws `SliceResolutionError` | `` Slice not resolved: <the error's message>. ``               | `SLICE_HINT`                                  |
  | any other error from `analyzeSlice`        | propagates (a `CSVIntegrityError` still fails the refresh)      |                                               |
  | the metric is absent from the report       | `` No rows for metric `<metric>` in slice `<sliceLabel(eventType)>`. `` | `Values present: <formatTally(tally)>.`, or `The file holds no rows.` when `tally.total` is zero |

  `sliceLabel` comes from `@forwardimpact/libxmr` (step 4), so the renderer and
  the commands print `*` the same way.

  The chart and Signals lines are unchanged. The JSDoc states the contract:
  every render failure except a corrupt CSV returns notice lines.
- `refresh.js`: drop the `BlockRenderError` import and the `try`/`catch` in
  the block loop. `renderForBlock` passes `eventType` and `tokenErrors` to
  `renderBlock`. A rendered xmr block always splices.

Verify:
`rg -n 'BlockRenderError|metric-not-found|csv-not-found' libraries/libwiki/src`
returns no match.

## Step 9: `product-mix` takes the slice from its caller

Remove the pinned literal and let a `record` failure fail the command.

Modified: `libraries/libwiki/src/commands/product-mix.js`,
`libraries/libwiki/src/cli-definition.js`

- `cli-definition.js`, `product-mix` options: add

  ```js
  "event-type": {
    type: "string",
    description: "Forwarded to `gemba-xmr record --event-type` (default: record's own rule)",
  },
  ```

- `product-mix.js`: delete the `"--event-type", "kata-shift"` pair. After the
  `--wiki-root` forward add
  `if (options["event-type"]) recordArgs.push("--event-type", options["event-type"]);`.
  Replace the warn-and-succeed branch with

  ```js
  if (recordResult.exitCode !== 0) {
    // The child's stderr passes through as it is; the gemba-wiki envelope adds
    // its own prefix, so the operator reads both bins' names.
    const message = (recordResult.stderr || "").trim();
    return { ok: false, code: recordResult.exitCode, error: message || "gemba-xmr record failed" };
  }
  ```

  The JSDoc says the row's slice is the caller's, else `record`'s own rule.

Verify: `rg -n 'kata-shift' libraries/libwiki/src` returns no match (S6). Then
the live checks, which spawn `npx gemba-xmr` and so need `node` on PATH: on a
window with at least one labeled merged PR and a scratch wiki root,
`GITHUB_WORKFLOW_REF=o/r/.github/workflows/agent-shift.yml@refs/heads/main bun products/gemba/bin/gemba-wiki.js product-mix --wiki-root /tmp/w2370`
appends a row whose seventh field is `agent-shift`, the same command with the
variable unset appends `interactive` (S8), and `--event-type probe` appends
`probe` (S7). Remove `/tmp/w2370`.

## Step 10: `libwiki` tests and the README

Replace the removed behaviours' tests and document the grammar.

Modified: `libraries/libwiki/test/marker-scanner.test.js`,
`libraries/libwiki/test/block-renderer.test.js`,
`libraries/libwiki/test/cli-refresh.integration.test.js`,
`libraries/libwiki/test/cli-product-mix.test.js`,
`libraries/libwiki/test/audit-engine.test.js`, `libraries/libwiki/README.md`

| File                              | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `marker-scanner.test.js`          | Add: `event_type=x` parses; `prior=` and `event_type=` in either order parse both; an unknown key lands in `tokenErrors` with reason `unknown`; `prior=20260604` and a bare `event_type=` are `unusable`; a second `event_type=` is `repeated`; `constructor=x` is `unknown`; a `k=v` word after free text is not a token; a token run followed by the notice text keeps the notice; a `>` inside a value makes the line fail `XMR_OPEN_RE`, so the scanner reports no block and the audit's balance rule reports the unpaired close (the one shape the grammar cannot notice).                                                      |
| `block-renderer.test.js`          | Line 4 imports `renderBlock` only; line 5 imports `analyzeSlice, renderChart, CSVIntegrityError` from `@forwardimpact/libxmr`. Line 37's `analyze(makeCSV(…))` becomes `analyzeSlice(makeCSV(…), { eventType: "*" })`. Fixtures gain a second slice where a case needs one. Replace "throws BlockRenderError for a missing metric" with: a metric absent from the slice renders the notice with the tally. Add: a marker slice over a two-slice file renders the chart lines that `renderChart` prints for that slice (S10); no slice over a one-slice file renders the chart (S11); no slice over a two-slice file renders the notice that names both values and the token (S12); a missing file, an all-empty file, an unknown token, an unusable `prior`, and two token errors at once (both causes on the line) each render a notice (S13); a conflict-marker CSV still throws `CSVIntegrityError`. |
| `cli-refresh.integration.test.js` | "missing CSV — block unchanged, exit 0" becomes "missing CSV — block carries a notice, exit 0". Add a board with one marker of each S13 kind, one sliced marker over a two-slice file (its block holds the chart lines of that slice, S10 at the refresh), one token-less marker over the same file (its block holds the notice with both values and the token, S12 at the refresh), and one healthy marker: every block body is written and the JSON `spliced` is true.                                                                                                                                                                                                                                                                                                                                                                                                |
| `cli-product-mix.test.js`         | Add: `--event-type probe` forwards `--event-type probe` to `record` (S7); with no flag, `recordArgs` holds no `--event-type`; an `npx` response with `exitCode: 2` and `stderr: "gemba-xmr: error: x\n"` returns `{ ok: false, code: 2, error: "gemba-xmr: error: x" }`.                                                                                                                                                                                                                                                                                                                                                          |
| `audit-engine.test.js`            | Beside the dangling-open case (line 336), add a case in the same describe: a board with a balanced pair whose open marker carries `event_type=x prior=2026-01-01 Do not edit.` yields no `storyboard.markers-balanced.xmr` finding.                                                                                                                                                                                                                                                                                                                                                                                             |
| `README.md`                       | Line 123 becomes `` `refresh` re-renders `<!-- xmr:metric:csv-path [event_type=<slice>] [prior=<YYYY-MM-DD>] -->` and `` (S16), and the paragraph states the token rule, that a marker with no `event_type` follows the read rule against its file, and that every render failure is a notice inside the block. `## Programmatic API`: add a `renderBlock({ metric, csvPath, projectRoot, fs, eventType, priorReadAnchor, tokenErrors })` bullet with that contract. Add `npx gemba-wiki product-mix --event-type <slice>` under the CLI list.                                                                                 |

Verify: from `libraries/libwiki`, `bun run test` passes, and
`rg -n '<!-- xmr:[^:]+:' libraries/libwiki/README.md` lists only lines that
carry `event_type=`.

## Step 11: The `gemba` help, goldens, and the `libxmr` README

Teach the vocabulary in every published example, recapture the goldens from
the branch's source, and give the `gemba-xmr` goldens a gate.

Modified: `scripts/capture-cli-golden.mjs`, `products/gemba/bin/gemba-xmr.js`,
`products/gemba/test/golden.test.js`,
`products/gemba/test/golden/gemba-xmr/help.stdout`,
`products/gemba/test/golden/gemba-xmr/validate-invalid.stdout`,
`products/gemba/test/golden/gemba-xmr/cases.json`,
`products/gemba/test/golden/gemba-wiki/product-mix-help.stdout.txt`,
`libraries/libxmr/README.md`

Created: `products/gemba/test/golden/gemba-xmr/mixed.csv`,
`products/gemba/test/golden/gemba-xmr/list-mixed-no-flag.stdout`,
`products/gemba/test/golden/gemba-xmr/list-mixed-no-flag.stderr`,
`products/gemba/test/golden/gemba-xmr/list-mixed-all.stdout`,
`products/gemba/test/golden/gemba-xmr/list-mixed-all.stderr`,
`products/gemba/test/golden-xmr.integration.test.js`

- `gemba-xmr.js`: hoist one option object above `createCli`:

  ```js
  const readEventTypeOpt = {
    "event-type": {
      type: "string",
      description:
        "Slice to read: an event_type value, or '*' for all rows. Without it, the file's sole value is read; a file with several values needs the flag",
    },
  };
  ```

  and spread `...readEventTypeOpt` into the `analyze`, `chart`, `list`, and
  `summarize` option tables in place of their four literals. The `record`
  description becomes
  `Stream the row belongs to (default: the host workflow's filename from $GITHUB_WORKFLOW_REF, else the reserved value interactive)`.
  The examples list becomes:

  ```js
  examples: [
    "gemba-xmr analyze wiki/metrics/code-review/2026.csv --event-type nightly-review",
    "gemba-xmr analyze wiki/metrics/code-review/2026.csv --event-type nightly-review --metric findings_count",
    "gemba-xmr analyze wiki/metrics/code-review/2026.csv --event-type '*' --format json",
    "gemba-xmr chart wiki/metrics/code-review/2026.csv --event-type nightly-review --metric findings_count",
    "gemba-xmr chart wiki/metrics/code-review/2026.csv --event-type nightly-review --metric findings_count --ascii",
    "gemba-xmr list wiki/metrics/code-review/2026.csv --event-type '*'",
    "gemba-xmr validate wiki/metrics/code-review/2026.csv",
    "gemba-xmr summarize wiki/metrics/code-review/2026.csv --event-type nightly-review",
    "gemba-xmr summarize wiki/metrics/code-review/2026.csv --event-type nightly-review --format json",
    "gemba-xmr record --skill code-review --metric findings_count --value 3",
    "gemba-xmr record --skill code-review --metric findings_count --value 3 --event-type nightly-review",
  ],
  ```

- `mixed.csv`: the eight-column header, two `stable_metric` rows under
  `nightly-review` and two `other_metric` rows under `weekly-audit`.
- `cases.json`: give the `help` case the version transform the `gemba-wiki`
  cases carry (`{ "pattern": "\\d+\\.\\d+\\.\\d+", "replacement": "X.Y.Z" }`);
  `help.stdout` prints the package version, which the cut moves. Add
  `list mixed no flag` (`["list", "test/golden/gemba-xmr/mixed.csv"]`, exit 2,
  files `list-mixed-no-flag.*`) and `list mixed all`
  (`…, "--event-type", "*"`, exit 0, files `list-mixed-all.*`).
- `scripts/capture-cli-golden.mjs`: `runCase(execPath, c, { cwd } = {})`
  passes `cwd` to `spawnSync` and throws `result.error` when the spawn itself
  failed (a missing `node`), so a replay names the cause instead of a byte
  diff; `capture` and `verify` pass no `cwd`.
- Recapture both golden families from `products/gemba`:

  ```sh
  node ../../scripts/capture-cli-golden.mjs --bin gemba-xmr --exec bin/gemba-xmr.js
  node ../../scripts/capture-cli-golden.mjs --bin gemba-wiki --exec bin/gemba-wiki.js
  ```

  The script spawns `node <exec>`; without `--exec` it would spawn the installed
  gear binary. Inspect the diff: `help.stdout` carries the new examples and
  `X.Y.Z`; `validate-invalid.stdout` reports six errors (the field count joins
  each line; today's golden holds four); `product-mix-help.stdout.txt` carries
  the new option; the two `list-mixed-*` pairs are new; every other existing
  golden is byte-identical.
- `golden-xmr.integration.test.js`, mirroring
  `products/jidoka/test/golden.integration.test.js`: import `runCase` from
  `scripts/capture-cli-golden.mjs`, read `test/golden/gemba-xmr/cases.json`,
  run each case with `runCase(BIN, c, { cwd: GEMBA_DIR })` where `BIN` is the
  absolute path of `bin/gemba-xmr.js` and `GEMBA_DIR` the package root (as
  `golden-functional.integration.test.js` resolves them; the cases carry
  package-relative CSV paths and the root test runner starts at the
  repository root), and assert `stdout`, `stderr`, and the exit code equal
  the committed files. One `test` per case name. A header comment maps the
  three golden files (the in-process `gemba-wiki` help test, the real-bin
  `gemba-wiki` functional test, this real-bin `gemba-xmr` replay) and says
  the replay spawns `node`. It is an integration file.
- `products/gemba/test/golden.test.js`: its header comment at line 14 says
  `--verify` replays these cases in the release-merge gate; replace that
  sentence with a pointer to the two real-bin replay files, which are the
  gate.
- `libxmr/README.md`: the CSV sample rows end `nightly-review`; the
  `event_type` paragraph (lines 39-45) states the rule from the spec's
  § Slice resolution and the reserved value, and its sentence "It rejects
  the row when neither resolves" goes; the read commands name the slice they
  report; the import example adds `analyzeSlice`; the `--prior-read` example
  gains `--event-type nightly-review`.

Then run `node scripts/test-gate.mjs` once and commit the printed count into
`scripts/test-gate.floor.json`, as its header requires when a change moves
the test population (this part adds the replay cases and reshapes the
`libxmr` and `libwiki` suites).

Verify: from the repository root with `node` on PATH, `bun run test` passes,
which now replays every `gemba-xmr` case from the root cwd, and
`rg -n -e kata-shift -e kata-dispatch -e 'rejects the row' libraries/libxmr/README.md libraries/libwiki/README.md products/gemba/bin`
returns no match (S14, this part's share).

## Step 12: The CHANGELOGs

Record the break where the release cut reads it.

Modified: `libraries/libxmr/CHANGELOG.md`, `libraries/libwiki/CHANGELOG.md`,
`products/gemba/CHANGELOG.md`

Under each `## Unreleased`, above the existing entries:

- `libxmr`: `### The read slice comes from the caller or the file (breaking)`:
  `analyze` and `listMetrics` take parsed rows and a required `eventType`;
  `analyzeSlice` and `listSliceMetrics` compose parse, tally, resolve, and
  compute; `SliceResolutionError` and the exit-2 envelope; `DEFAULT_SHIFT_TYPE`
  and `EVENT_TYPE_COLUMN` removed; `record` writes `interactive` off-workflow;
  `validate` rejects a field count outside 7 to 8; the parser normalises the
  `event_type` cell. **Migration:** pass `eventType`, or call the composed
  functions.
- `libwiki`: `### Storyboard markers name their slice (breaking)`:
  `renderBlock` takes `eventType` and `tokenErrors`, returns notice lines for
  every render failure, and no longer throws for a missing file or metric;
  the `event_type=` marker token and the token grammar;
  `product-mix --event-type`, and a `record` failure now fails the command.
- `gemba`: `### gemba-xmr and gemba-wiki resolve their slice (breaking)`,
  written for the `npx` user: a flag-free read of a file with several
  `event_type` values exits 2 and lists them; `record` outside a workflow
  writes `interactive` instead of refusing; `validate` rejects a field count
  outside 7 to 8; `gemba-wiki refresh` renders every XmR failure as a notice
  inside the block and honours `event_type=` on the marker;
  `gemba-wiki product-mix` takes `--event-type` and fails when `record`
  fails. Then the help examples, the two new goldens, and the replay test.

Verify: `bun run check` passes.
