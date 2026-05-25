// Render the canonical Wheeler/Vacanti X+mR chart as 14 lines of monospace
// text. Pure function — no I/O, no state, no side effects.
//
// The 14 lines are: 7 X-chart rows, 1 blank separator, 6 mR-chart rows
// (the last of which is the shared time axis serving both charts).
//
// Spec: SCRATCHPAD-4.md §6, §7, §8, §9, §11.

import { buildSignalMask, buildMRSignalMask } from "./signals.js";
import { fmt1 } from "./format.js";

const UNICODE = {
  vertical: "│",
  upperEnd: "┬",
  cross: "┼",
  lowerEnd: "┴",
  point: "·",
  signal: "●",
  sigma: "σ",
  mu: "μ",
};

const ASCII = {
  vertical: "|",
  upperEnd: "+",
  cross: "+",
  lowerEnd: "+",
  point: "o",
  signal: "*",
  sigma: "s",
  mu: "X-bar",
};

const DEFAULT_SLOT_WIDTH = 3;

/** Render a Wheeler/Vacanti X+mR control chart as monospace text lines. */
export function renderChart(values, stats, signals, options = {}) {
  const slotWidth = options.slotWidth ?? DEFAULT_SLOT_WIDTH;
  const ascii = options.ascii ?? false;
  const glyphs = ascii ? ASCII : UNICODE;
  const n = values.length;

  if (n === 0) {
    throw new Error("renderChart requires at least one value");
  }

  // Edge case: single observation. mR is undefined, no limits, no zones.
  if (n === 1) {
    return renderSinglePoint(values[0], glyphs, slotWidth);
  }

  // Edge case: zero observed variation. R = 0 collapses every limit to μ;
  // emit a measurement-resolution warning and a flat chart.
  if (stats.R === 0) {
    return renderFlat(values, stats, glyphs, slotWidth, ascii);
  }

  return renderFull(values, stats, signals, glyphs, slotWidth, ascii);
}

function renderFull(values, stats, signals, glyphs, slotWidth, ascii) {
  const n = values.length;
  const xMask = buildSignalMask(signals, n);
  const mrMask = buildMRSignalMask(signals, n);

  const xLabels = makeXLabels(stats, ascii);
  const mrLabels = makeMRLabels(stats, ascii);
  const labelWidth = jointLabelWidth([...xLabels, ...mrLabels]);

  const plotWidth = n * slotWidth;

  const xRows = renderXChart({
    values,
    stats,
    mask: xMask,
    labels: xLabels,
    labelWidth,
    plotWidth,
    slotWidth,
    glyphs,
  });
  const mrRows = renderMRChart({
    stats,
    mask: mrMask,
    labels: mrLabels,
    labelWidth,
    plotWidth,
    slotWidth,
    glyphs,
    n,
  });

  return [...xRows, "", ...mrRows].join("\n");
}

// Bucket each point into one of seven X-chart rows by strict comparison.
// Spec §11 dictates the boundary cases:
//   - v > UPL / v < LPL → breach (Rule 1 is strict inequality)
//   - v exactly on UPL or LPL → adjacent inner-zone row (NOT outer zone,
//     NOT a breach)
//   - v exactly on ±1.5σ̂ → inner zone (Rule 3 is strict)
//   - v exactly on μ → centerline glyph
// Classify a single value into one of seven X-chart rows.
function classifyXValue(v, { UPL, LPL, mu, zoneUpper, zoneLower }) {
  if (v > UPL) return "breachUpper";
  if (v < LPL) return "breachLower";
  if (v === UPL) return "innerUpper";
  if (v === LPL) return "innerLower";
  if (v > zoneUpper) return "outerUpper";
  if (v > mu) return "innerUpper";
  if (v === mu) return "onMu";
  if (v >= zoneLower) return "innerLower";
  return "outerLower";
}

function bucketXValues(values, stats) {
  const buckets = {
    breachUpper: [],
    outerUpper: [],
    innerUpper: [],
    onMu: [],
    innerLower: [],
    outerLower: [],
    breachLower: [],
  };
  for (let i = 0; i < values.length; i++) {
    buckets[classifyXValue(values[i], stats)].push(i + 1);
  }
  return buckets;
}

// X chart — 7 rows: UPL marker, outer-upper, inner-upper, μ centerline,
// inner-lower, outer-lower, LPL marker. The UPL, μ, and LPL rows show
// only their label + data marks; the running chart skips full-width
// fill on those rows because the ruler labels already tell the reader
// where each level sits.
function renderXChart({
  values,
  stats,
  mask,
  labels,
  labelWidth,
  plotWidth,
  slotWidth,
  glyphs,
}) {
  const buckets = bucketXValues(values, stats);

  return [
    limitRow(
      labels[0],
      labelWidth,
      buckets.breachUpper,
      plotWidth,
      slotWidth,
      glyphs.upperEnd,
      glyphs,
    ),
    zoneRow(
      labels[1],
      labelWidth,
      buckets.outerUpper,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    zoneRow(
      labels[2],
      labelWidth,
      buckets.innerUpper,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    centerlineRow(
      labels[3],
      labelWidth,
      buckets.onMu,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    zoneRow(
      labels[4],
      labelWidth,
      buckets.innerLower,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    zoneRow(
      labels[5],
      labelWidth,
      buckets.outerLower,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    limitRow(
      labels[6],
      labelWidth,
      buckets.breachLower,
      plotWidth,
      slotWidth,
      glyphs.lowerEnd,
      glyphs,
    ),
  ];
}

// mR chart — 6 rows: URL line, above-R, R centerline, below-R, zero
// baseline, shared time axis. Slot 1 is empty in zone rows (mR undefined
// at t=1); the axis still labels slot 1.
function renderMRChart({
  stats,
  mask,
  labels,
  labelWidth,
  plotWidth,
  slotWidth,
  glyphs,
  n,
}) {
  const { URL, R, mrs } = stats;

  const buckets = { breach: [], above: [], onR: [], below: [], onZero: [] };
  for (let i = 0; i < mrs.length; i++) {
    const v = mrs[i];
    const slot = i + 2; // mR[0] corresponds to slot 2
    if (v > URL) buckets.breach.push(slot);
    else if (v > R) buckets.above.push(slot);
    else if (v === R) buckets.onR.push(slot);
    else if (v > 0) buckets.below.push(slot);
    else buckets.onZero.push(slot);
  }

  return [
    limitRow(
      labels[0],
      labelWidth,
      buckets.breach,
      plotWidth,
      slotWidth,
      glyphs.upperEnd,
      glyphs,
    ),
    zoneRow(
      labels[1],
      labelWidth,
      buckets.above,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    centerlineRow(
      labels[2],
      labelWidth,
      buckets.onR,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    zoneRow(
      labels[3],
      labelWidth,
      buckets.below,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    baselineRow(
      labels[4],
      labelWidth,
      buckets.onZero,
      mask,
      plotWidth,
      slotWidth,
      glyphs,
    ),
    axisRow(labelWidth, n, slotWidth),
  ];
}

// A limit row — label + ruler-edge glyph + blank plot, breach slots marked
// with `●`. The edge glyph caps the vertical ruler (upper or lower).
function limitRow(
  label,
  labelWidth,
  slots,
  plotWidth,
  slotWidth,
  edge,
  glyphs,
) {
  const plot = Array(plotWidth).fill(" ");
  for (const slot of slots) {
    const col = slotWidth * slot - 1;
    plot[col] = glyphs.signal;
  }
  return `${rightAlign(label, labelWidth)} ${edge}${plot.join("")}`;
}

// A zone row — vertical edge, spaces in plot, `·` (or `●` for signals) at
// each participating slot's right-aligned column.
function zoneRow(label, labelWidth, slots, mask, plotWidth, slotWidth, glyphs) {
  const plot = Array(plotWidth).fill(" ");
  for (const slot of slots) {
    const col = slotWidth * slot - 1;
    plot[col] = mask[slot] ? glyphs.signal : glyphs.point;
  }
  return `${rightAlign(label, labelWidth)} ${glyphs.vertical}${plot.join("")}`;
}

// A centerline row — `┼` edge (vertical ruler with centre cross), blank
// plot, on-centerline slots marked with the point (or signal) glyph.
function centerlineRow(
  label,
  labelWidth,
  slots,
  mask,
  plotWidth,
  slotWidth,
  glyphs,
) {
  const plot = Array(plotWidth).fill(" ");
  for (const slot of slots) {
    const col = slotWidth * slot - 1;
    plot[col] = mask[slot] ? glyphs.signal : glyphs.point;
  }
  return `${rightAlign(label, labelWidth)} ${glyphs.cross}${plot.join("")}`;
}

// The mR zero baseline — `┴` lower-end edge, blank plot, zero-mR slots
// marked with the point (or signal) glyph.
function baselineRow(
  label,
  labelWidth,
  slots,
  mask,
  plotWidth,
  slotWidth,
  glyphs,
) {
  const plot = Array(plotWidth).fill(" ");
  for (const slot of slots) {
    const col = slotWidth * slot - 1;
    plot[col] = mask[slot] ? glyphs.signal : glyphs.point;
  }
  return `${rightAlign(label, labelWidth)} ${glyphs.lowerEnd}${plot.join("")}`;
}

// Shared time axis — slot numbers right-aligned in each slot. Edge is a
// single space so the digits don't sit flush against the label area.
function axisRow(labelWidth, n, slotWidth) {
  const cells = [];
  for (let k = 1; k <= n; k++) {
    cells.push(String(k).padStart(slotWidth, " "));
  }
  return `${" ".repeat(labelWidth)}  ${cells.join("")}`;
}

function makeXLabels(stats, ascii) {
  const { mu, UPL, LPL, zoneUpper, zoneLower } = stats;
  const sigma = ascii ? ASCII.sigma : UNICODE.sigma;
  const muSym = ascii ? "X-bar" : UNICODE.mu;
  return [
    `UPL ${fmt1(UPL)}`,
    "",
    `+1.5${sigma} ${fmt1(zoneUpper)}`,
    `${muSym} ${fmt1(mu)}`,
    `-1.5${sigma} ${fmt1(zoneLower)}`,
    "",
    `LPL ${fmt1(LPL)}`,
  ];
}

function makeMRLabels(stats, ascii) {
  const { R, URL } = stats;
  const rSym = ascii ? "R-bar" : "R";
  return [`URL ${fmt1(URL)}`, "", `${rSym} ${fmt1(R)}`, "", "0.0", ""];
}

function jointLabelWidth(labels) {
  return labels.reduce((max, s) => Math.max(max, s.length), 0);
}

function rightAlign(s, width) {
  return s.padStart(width, " ");
}

// Edge case: n=1. No mR, no limits — just one point on a degenerate
// centerline. Spec §11 requires a note about needing n≥2 for mR.
function renderSinglePoint(value, glyphs, slotWidth) {
  const label = `${glyphs.mu} ${fmt1(value)}`;
  const plot = Array(slotWidth).fill(" ");
  plot[slotWidth - 1] = glyphs.point;
  const labelWidth = label.length;
  const lines = [
    `${rightAlign(label, labelWidth)} ${glyphs.cross}${plot.join("")}`,
    "",
    `${" ".repeat(labelWidth)}  ${"1".padStart(slotWidth, " ")}`,
    "",
    "Note: mR chart requires n ≥ 2.",
  ];
  return lines.join("\n");
}

// Edge case: R = 0 (every value identical). Limits collapse to μ, σ̂ = 0,
// every zone has zero width. Render the X chart flat with a single
// centerline-and-points row, plus the spec's verbatim warning.
function renderFlat(values, stats, glyphs, slotWidth, ascii) {
  const n = values.length;
  const plotWidth = n * slotWidth;
  const muSym = ascii ? "X-bar" : UNICODE.mu;
  const rSym = ascii ? "R-bar" : "R";
  const labels = [`${muSym} ${fmt1(stats.mu)}`, `${rSym} ${fmt1(stats.R)}`];
  const labelWidth = jointLabelWidth(labels);

  const xPlot = Array(plotWidth).fill(" ");
  for (let i = 0; i < n; i++) xPlot[slotWidth * (i + 1) - 1] = glyphs.point;

  const mrPlot = Array(plotWidth).fill(" ");
  for (let i = 1; i < n; i++) mrPlot[slotWidth * (i + 1) - 1] = glyphs.point;

  const lines = [
    `${rightAlign(labels[0], labelWidth)} ${glyphs.cross}${xPlot.join("")}`,
    "",
    `${rightAlign(labels[1], labelWidth)} ${glyphs.lowerEnd}${mrPlot.join("")}`,
    axisRow(labelWidth, n, slotWidth),
    "",
    "Note: zero observed variation — control limits coincide with",
    "centerline. Verify measurement resolution before interpreting.",
  ];
  return lines.join("\n");
}
