// Wheeler/Vacanti detection rules for an individuals (X) chart with its
// companion moving range (mR) chart.
//
//   X-Rule 1 — point outside natural process limits
//   X-Rule 2 — 8 consecutive points on same side of μ
//   X-Rule 3 — 3 of any 4 consecutive points strictly beyond ±1.5σ̂ on
//              the same side
//   mR-Rule 1 — point above URL
//
// No additional rules. Western Electric's full set, the Nelson rules, and
// trend tests are deliberately omitted.

import { fmt1 } from "./format.js";

const X_RULE_2_RUN = 8;
const X_RULE_3_WINDOW = 4;
const X_RULE_3_HITS = 3;

// Detect every rule on the X chart and Rule 1 on the mR chart.
//
// Returns:
//   {
//     xRule1: [{ slots, description }, ...],
//     xRule2: [{ slots, description }, ...],
//     xRule3: [{ slots, description }, ...],
//     mrRule1: [{ slots, description }, ...],
//   }
//
// Slots are 1-indexed (slot 1 = first observation). When a Rule 2 or Rule 3
// pattern fires, ALL participating slots are listed in the `slots` array —
// the visual gestalt of the run carries the diagnostic information, so
// flagging only the trigger would hide the pattern.
/** Detect all Wheeler signal rules on the X chart and Rule 1 on the mR chart. */
export function detectSignals(values, mrs, stats) {
  return {
    xRule1: detectXRule1(values, stats),
    xRule2: detectXRule2(values, stats),
    xRule3: detectXRule3(values, stats),
    mrRule1: detectMRRule1(mrs, stats),
  };
}

// X-Rule 1: each slot strictly beyond UPL or LPL.
function detectXRule1(values, { UPL, LPL }) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v > UPL) {
      out.push({
        slots: [i + 1],
        description: `x=${fmt1(v)} > UPL=${fmt1(UPL)}`,
      });
    } else if (v < LPL) {
      out.push({
        slots: [i + 1],
        description: `x=${fmt1(v)} < LPL=${fmt1(LPL)}`,
      });
    }
  }
  return out;
}

// Build one-indexed slots array for a completed run and describe it.
function emitRule2Run(runStart, runEnd, runSide, mu) {
  const len = runEnd - runStart;
  if (runSide === 0 || runStart < 0 || len < X_RULE_2_RUN) return null;
  const slots = [];
  for (let k = runStart; k < runEnd; k++) slots.push(k + 1);
  const direction = runSide > 0 ? "above" : "below";
  return {
    slots,
    description: `${len} consecutive ${direction} μ=${fmt1(mu)}`,
  };
}

// X-Rule 2: runs of 8+ consecutive points strictly on the same side of μ.
// Points equal to μ break the run (neither above nor below).
function detectXRule2(values, { mu }) {
  const out = [];
  let runStart = -1;
  let runSide = 0;
  for (let i = 0; i <= values.length; i++) {
    const side = i < values.length ? Math.sign(values[i] - mu) : 0;
    if (side !== runSide || i === values.length) {
      const signal = emitRule2Run(runStart, i, runSide, mu);
      if (signal) out.push(signal);
      runStart = side === 0 ? -1 : i;
      runSide = side;
    }
  }
  return out;
}

// X-Rule 3: in any window of 4 consecutive points, 3 or more strictly beyond
// the same outer-zone boundary (±1.5σ̂). Overlapping firing windows on the
// same side are coalesced into one signal — a single special-cause stretch
// should produce one diagnostic, not three.
function detectXRule3(values, { zoneUpper, zoneLower, mu }) {
  if (values.length < X_RULE_3_WINDOW) return [];

  const upperRuns = collectRule3Runs(
    values,
    X_RULE_3_WINDOW,
    X_RULE_3_HITS,
    (v) => v > zoneUpper,
  );
  const lowerRuns = collectRule3Runs(
    values,
    X_RULE_3_WINDOW,
    X_RULE_3_HITS,
    (v) => v < zoneLower,
  );

  return [
    ...upperRuns.map((slots) =>
      describeRule3(slots, "upper", { zoneUpper, mu }),
    ),
    ...lowerRuns.map((slots) =>
      describeRule3(slots, "lower", { zoneLower, mu }),
    ),
  ];
}

// Walk every 4-window; when one fires, take the union of its hit slots with
// any prior firing window that overlaps it on the same side. Returns an
// array of consolidated, sorted slot lists — one per maximal contiguous
// firing region.
function collectRule3Runs(values, windowSize, threshold, isHit) {
  const runs = [];
  for (let i = 0; i + windowSize <= values.length; i++) {
    const hits = [];
    for (let j = 0; j < windowSize; j++) {
      if (isHit(values[i + j])) hits.push(i + j + 1);
    }
    if (hits.length < threshold) continue;
    const last = runs[runs.length - 1];
    if (last && hits.some((s) => last.includes(s))) {
      runs[runs.length - 1] = [...new Set([...last, ...hits])].sort(
        (a, b) => a - b,
      );
    } else {
      runs.push(hits);
    }
  }
  return runs;
}

function describeRule3(slots, side, { zoneUpper, zoneLower, mu }) {
  const boundary = side === "upper" ? zoneUpper : zoneLower;
  const label = side === "upper" ? "+1.5σ̂" : "-1.5σ̂";
  const direction = side === "upper" ? "above" : "below";
  return {
    slots,
    description: `${slots.length} ${direction} ${label}=${fmt1(boundary)} (μ=${fmt1(mu)})`,
  };
}

// mR-Rule 1: each slot strictly above URL. mR is undefined at t=1, so the
// first mR value corresponds to slot 2.
function detectMRRule1(mrs, { URL }) {
  const out = [];
  for (let i = 0; i < mrs.length; i++) {
    if (mrs[i] > URL) {
      out.push({
        slots: [i + 2],
        description: `mR=${fmt1(mrs[i])} > URL=${fmt1(URL)}`,
      });
    }
  }
  return out;
}

// Build a per-slot signal mask (1-indexed) covering every participating slot
// across all four rules. Used by the chart renderer to choose between `·`
// and `●` glyphs.
/** Build a boolean array (1-indexed) marking slots that participate in any X-chart signal. */
export function buildSignalMask(signals, n) {
  const mask = new Array(n + 1).fill(false);
  for (const rule of [signals.xRule1, signals.xRule2, signals.xRule3]) {
    for (const sig of rule) {
      for (const slot of sig.slots) mask[slot] = true;
    }
  }
  return mask;
}

// Same idea, but for the mR chart (only mR-Rule 1 participates).
/** Build a boolean array (1-indexed) marking slots that participate in mR Rule 1 signals. */
export function buildMRSignalMask(signals, n) {
  const mask = new Array(n + 1).fill(false);
  for (const sig of signals.mrRule1) {
    for (const slot of sig.slots) mask[slot] = true;
  }
  return mask;
}

// Stamp each fired signal record with anchor-relative provenance. A record is
// `recomputation-revealed` when every participating slot was present at the
// prior read (max slot <= anchorSlot), and `new-point` when at least one
// participating slot postdates the anchor. mR-Rule 1 records carry the later
// of the two points (slot i+2), so the same comparison holds across all four
// rules. The value records data membership, not signal novelty: a signal that
// also fired at the prior read carries `recomputation-revealed`.
/** Add a `provenance` value to every fired signal record relative to a 1-indexed anchor slot. */
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

// Does any rule fire at all? Used by the analyze orchestrator and the
// classifier to avoid recomputing the same boolean.
/** Return true if any detection rule (X or mR) fired at least once. */
export function hasAnySignal(signals) {
  return (
    signals.xRule1.length > 0 ||
    signals.xRule2.length > 0 ||
    signals.xRule3.length > 0 ||
    signals.mrRule1.length > 0
  );
}

// Does any X-chart rule fire? Distinct from `hasAnySignal` because mR Rule
// 1 alone routes to a different classification (`chaos`) than X-chart
// signals (`signals`).
/** Return true if any X-chart rule (Rule 1, 2, or 3) fired, excluding mR Rule 1. */
export function anyXSignals(signals) {
  return (
    signals.xRule1.length > 0 ||
    signals.xRule2.length > 0 ||
    signals.xRule3.length > 0
  );
}
