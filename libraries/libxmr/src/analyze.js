import { MIN_POINTS } from "./constants.js";
import { normalizeSlice } from "./csv.js";
import { computeXmR } from "./stats.js";
import { detectSignals, hasAnySignal, stampProvenance } from "./signals.js";
import { classify } from "./classify.js";
import { round1, round2 } from "./format.js";

// The slice is the caller's. The library holds no default. An absent or
// blank `eventType` is a programming error at the seam, so the call throws
// before any row is read.
function assertSlice(eventType, fn) {
  const slice = normalizeSlice(eventType);
  if (slice === "") {
    throw new TypeError(
      `${fn} requires options.eventType: a slice name or "*"`,
    );
  }
  return slice;
}

// Apply the event-type slice and the optional route-decision partitions.
// The route filters are inert unless the caller passes them.
function selectRows(rows, { eventType, route, routesEligibleIncludes }) {
  let selected = rows;
  if (eventType !== "*") {
    selected = selected.filter((row) => row.eventType === eventType);
  }
  if (route !== undefined) {
    selected = selected.filter((row) => row.routeTaken === String(route));
  }
  if (routesEligibleIncludes !== undefined) {
    selected = selected.filter((row) =>
      row.routesEligible.includes(String(routesEligibleIncludes)),
    );
  }
  return selected;
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

// Analyze parsed Kata-metrics rows. Group rows by metric. Sort each group by
// date. Compute Wheeler/Vacanti statistics and signals for groups with at
// least MIN_POINTS observations. Stamp a classification on each group.
//
// Each metric record carries:
//   - status: 'insufficient_data' | 'predictable' | 'signals_present'
//   - classification: 'insufficient' | 'stable' | 'signals' | 'chaos' | 'degenerate-zero'
//   - stats: full-precision numeric stats (consumers round at display time)
//   - signals: keyed-by-rule signal records
//   - values, dates: ordered series that the chart renderer reads
// The slice is the caller's. The library holds no default. `"*"` means every
// row. A caller that reads a file and wants the slice resolved from it calls
// `analyzeSlice` (slice.js), which parses once, tallies, resolves, and then
// calls this function.
// When `priorReadAnchor` (a YYYY-MM-DD date) exact-matches a metric's slot
// date, each fired signal record gains a `provenance` value relative to that
// slot. A non-corresponding anchor (backfill, correction, beyond series end)
// and no anchor both leave records untouched.
/** Group parsed rows by metric, restricted to the required `eventType` slice (a value, or "*" for all rows). Partition by route-decision context on request. Compute XmR statistics and signals. Classify each metric's process behavior. Stamp per-signal provenance when the caller gives a corresponding `priorReadAnchor` date. */
export function analyze(
  rows,
  { eventType, priorReadAnchor, route, routesEligibleIncludes } = {},
) {
  const slice = assertSlice(eventType, "analyze");
  const groups = groupByMetric(
    selectRows(rows, { eventType: slice, route, routesEligibleIncludes }),
  );

  const metrics = [];
  for (const [name, group] of Object.entries(groups)) {
    const dates = group.map((r) => r.date);
    const values = group.map((r) => r.value);
    const unit = group[0].unit;
    const n = values.length;

    if (n < MIN_POINTS) {
      const metric = {
        metric: name,
        unit,
        n,
        from: dates[0],
        to: dates[n - 1],
        status: "insufficient_data",
        values,
        dates,
      };
      metric.classification = classify(metric);
      metrics.push(metric);
      continue;
    }

    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    if (priorReadAnchor) {
      const idx = dates.indexOf(priorReadAnchor);
      if (idx !== -1) stampProvenance(signals, idx + 1);
    }
    const lastMR = Math.abs(values[n - 1] - values[n - 2]);

    const metric = {
      metric: name,
      unit,
      n,
      from: dates[0],
      to: dates[n - 1],
      status: hasAnySignal(signals) ? "signals_present" : "predictable",
      stats,
      latest: { date: dates[n - 1], value: values[n - 1], mr: lastMR },
      signals,
      values,
      dates,
    };
    metric.classification = classify(metric);
    metrics.push(metric);
  }

  return { metrics };
}

/** List the distinct metrics among parsed rows in the required `eventType` slice (a value, or "*" for all rows), each with its unit, point count, and date range. */
export function listMetrics(rows, { eventType } = {}) {
  const slice = assertSlice(eventType, "listMetrics");
  const groups = groupByMetric(selectRows(rows, { eventType: slice }));
  return Object.entries(groups).map(([name, group]) => ({
    metric: name,
    unit: group[0].unit,
    n: group.length,
    from: group[0].date,
    to: group[group.length - 1].date,
  }));
}

// Round a stats object to display precision. Consumers that need exact
// values (e.g. the chart renderer) keep the raw stats. Consumers that
// emit values to humans or JSON call this function.
/** Round a stats object to display precision for human-facing output. */
export function roundStats(stats) {
  return {
    mu: round1(stats.mu),
    R: round1(stats.R),
    sigmaHat: round2(stats.sigmaHat),
    UPL: round1(stats.UPL),
    LPL: round1(stats.LPL),
    URL: round1(stats.URL),
    zoneUpper: round1(stats.zoneUpper),
    zoneLower: round1(stats.zoneLower),
  };
}
