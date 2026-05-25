import { test, describe } from "node:test";
import assert from "node:assert";

import { computeXmR } from "../src/stats.js";
import { detectSignals } from "../src/signals.js";
import { renderChart } from "../src/chart.js";

// The canonical worked example from SCRATCHPAD-4.md §10.
// Diff-checking this golden block byte-for-byte is the only reliable
// regression detector for column alignment, signal placement, and
// rounding (per spec §12).
//
// NOTE: trailing spaces in zone rows are intentional — they preserve
// fixed-width column alignment.
const GOLDEN_SECTION_10 = [
  " UPL 12.5 ┬                             ●               ",
  "          │                                             ",
  "+1.5σ 9.4 │        ·           ·  ·              ·      ",
  "    μ 6.4 ┼                                             ",
  "-1.5σ 3.4 │  ·  ·     ·  ·  ·        ·     ·  ·     ·  ·",
  "          │                                             ",
  "  LPL 0.3 ┴                                             ",
  "",
  "  URL 7.5 ┬                                ●            ",
  "          │                    ·        ·               ",
  "    R 2.3 ┼                                             ",
  "          │     ·  ·  ·  ·  ·     ·  ·        ·  ·  ·  ·",
  "      0.0 ┴                                             ",
  "             1  2  3  4  5  6  7  8  9 10 11 12 13 14 15",
].join("\n");

describe("renderChart — Wheeler §10 worked example", () => {
  test("matches the canonical 14-line golden output byte-for-byte", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    const chart = renderChart(values, stats, signals);

    assert.strictEqual(chart, GOLDEN_SECTION_10);
  });

  test("emits exactly 14 lines", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    const chart = renderChart(values, stats, signals);

    assert.strictEqual(chart.split("\n").length, 14);
  });
});

describe("renderChart — alignment invariant", () => {
  test("the X chart's edge column lines up with the mR chart's edge column", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    const lines = renderChart(values, stats, signals).split("\n");

    // Zone rows carry a `│` edge at index labelWidth + 1 (0-indexed). Find
    // it on a zone row from each chart and assert the columns match.
    const xEdge = lines[1].indexOf("│");
    const mrEdge = lines[9].indexOf("│");
    assert.strictEqual(xEdge, mrEdge);
  });

  test("axis digit columns line up with the UPL ● column for slot 10", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    const lines = renderChart(values, stats, signals).split("\n");

    const breachCol = lines[0].indexOf("●");
    const axisLine = lines[13];
    // Slot 10 is rendered as "10" right-aligned in its 3-char slot, so the
    // "0" sits at the same column as the breach glyph.
    assert.strictEqual(axisLine[breachCol], "0");
    assert.strictEqual(axisLine[breachCol - 1], "1");
  });
});

describe("renderChart — ASCII fallback", () => {
  test("substitutes ASCII glyphs and recomputes label width", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    const chart = renderChart(values, stats, signals, { ascii: true });

    assert.ok(chart.includes("X-bar"));
    assert.ok(chart.includes("R-bar"));
    assert.ok(chart.includes("+1.5s"));
    assert.ok(chart.includes("-1.5s"));
    assert.ok(chart.includes("*"));
    assert.ok(chart.includes("o"));
    assert.ok(!chart.includes("σ"));
    assert.ok(!chart.includes("μ"));
    assert.ok(!chart.includes("●"));
    assert.ok(!chart.includes("·"));
    assert.strictEqual(chart.split("\n").length, 14);
  });
});

describe("renderChart — boundary buckets per spec §11", () => {
  test("v exactly on UPL renders in inner-upper, not as a breach", () => {
    // Construct stats then a series whose final value sits exactly on UPL.
    const values = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10];
    const stats = computeXmR(values);
    const onLimit = [...values];
    onLimit[14] = stats.UPL;
    const sigOnLimit = detectSignals(
      onLimit,
      computeXmR(onLimit).mrs,
      computeXmR(onLimit),
    );
    const lines = renderChart(onLimit, computeXmR(onLimit), sigOnLimit).split(
      "\n",
    );

    // UPL row (line 0) must NOT carry a `●` for the on-limit slot — that
    // would imply Rule 1 fired, but Rule 1 is strict inequality.
    assert.ok(!lines[0].includes("●"));
    // Inner-upper row (line 2) carries a glyph for slot 15.
    assert.ok(lines[2].includes("·") || lines[2].includes("●"));
  });
});

describe("renderChart — edge cases", () => {
  test("zero variation emits the measurement-resolution warning", () => {
    const values = Array(15).fill(7);
    const stats = computeXmR(values);
    const signals = detectSignals(values, stats.mrs, stats);
    const chart = renderChart(values, stats, signals);
    assert.ok(chart.includes("zero observed variation"));
    assert.ok(chart.includes("measurement resolution"));
  });

  test("n=1 emits the n≥2 note", () => {
    const stats = computeXmR([5]);
    const signals = { xRule1: [], xRule2: [], xRule3: [], mrRule1: [] };
    const chart = renderChart([5], stats, signals);
    assert.ok(chart.includes("mR chart requires n ≥ 2"));
  });
});
