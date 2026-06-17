import { DEFAULT_SHIFT_TYPE, MIN_POINTS } from "./constants.js";
import { parseCSV } from "./csv.js";
import { computeXmR } from "./stats.js";
import { detectSignals, hasAnySignal, stampProvenance } from "./signals.js";
import { classify } from "./classify.js";
import { round1, round2 } from "./format.js";

// Analyze a Kata-metrics CSV. Groups rows by metric, sorts each group by
// date, computes Wheeler/Vacanti statistics and signals for groups with
// at least MIN_POINTS observations, and stamps a classification on each.
//
// Each metric record carries:
//   - status: 'insufficient_data' | 'predictable' | 'signals_present'
//   - classification: 'insufficient' | 'stable' | 'signals' | 'chaos' | 'degenerate-zero'
//   - stats: full-precision numeric stats (consumers round at display time)
//   - signals: keyed-by-rule signal records
//   - values, dates: ordered series for chart rendering
// The eventType default lives here (not in the command layer) so
// single-argument callers — e.g. libwiki's block renderer — inherit the
// shift-work slice without a code change. Pass "*" to disable filtering.
// When `priorReadAnchor` (a YYYY-MM-DD date) exact-matches a metric's slot
// date, each fired signal record gains a `provenance` value relative to that
// slot. A non-corresponding anchor (backfill, correction, beyond series end)
// and no anchor both leave records untouched.
/** Group rows by metric (restricted to one event_type, default kata-shift; "*" for all rows), optionally partition by route-decision context, compute XmR statistics and signals, and classify each metric's process behavior; with a corresponding `priorReadAnchor` date, stamp per-signal provenance. */
export function analyze(
  csvText,
  {
    eventType = DEFAULT_SHIFT_TYPE,
    priorReadAnchor,
    route,
    routesEligibleIncludes,
  } = {},
) {
  let rows = parseCSV(csvText);
  if (eventType !== "*") {
    rows = rows.filter((row) => row.eventType === eventType);
  }
  // Route partition is inert unless a filter is passed, so a plain analyze
  // returns the same series it always has.
  if (route !== undefined) {
    rows = rows.filter((row) => row.routeTaken === String(route));
  }
  if (routesEligibleIncludes !== undefined) {
    rows = rows.filter((row) =>
      row.routesEligible.includes(String(routesEligibleIncludes)),
    );
  }

  const groups = {};
  for (const row of rows) {
    if (!groups[row.metric]) groups[row.metric] = [];
    groups[row.metric].push(row);
  }

  const metrics = [];
  for (const [name, group] of Object.entries(groups)) {
    group.sort((a, b) => a.date.localeCompare(b.date));
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

// Round a stats object to display precision. Consumers that need exact
// values (e.g. the chart renderer) keep the raw stats; consumers that
// emit values to humans or JSON call this.
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
