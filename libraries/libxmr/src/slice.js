import { parseCSV, normalizeSlice } from "./csv.js";
import { analyze, listMetrics } from "./analyze.js";

/** A read could not resolve its slice. Carries the explicit value and the tally; no remedy text. */
export class SliceResolutionError extends Error {
  /** Create a SliceResolutionError with the explicit value the caller gave (or null) and the file's tally. */
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
  return empty > 0
    ? `${text}${text ? "; " : ""}empty: ${rowCount(empty)}`
    : text;
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
export function analyzeSlice(
  csvText,
  { eventType, priorReadAnchor, route, routesEligibleIncludes } = {},
) {
  const { rows, tally, eventType: slice } = parseAndResolve(csvText, eventType);
  const report = analyze(rows, {
    eventType: slice,
    priorReadAnchor,
    route,
    routesEligibleIncludes,
  });
  return { ...report, eventType: slice, tally };
}

/** Parse once, tally, resolve, list. Returns `{ metrics, eventType, tally }`. */
export function listSliceMetrics(csvText, { eventType } = {}) {
  const { rows, tally, eventType: slice } = parseAndResolve(csvText, eventType);
  return {
    metrics: listMetrics(rows, { eventType: slice }),
    eventType: slice,
    tally,
  };
}
