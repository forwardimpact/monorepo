import { test, describe } from "node:test";
import assert from "node:assert";

import { computeXmR } from "../src/stats.js";
import {
  detectSignals,
  buildSignalMask,
  buildMRSignalMask,
} from "../src/signals.js";

describe("detectSignals — Wheeler §10 worked example", () => {
  test("X Rule 1 fires at slot 10. mR Rule 1 fires at slot 11. No other rules fire", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);

    assert.strictEqual(sig.xRule1.length, 1);
    assert.deepStrictEqual(sig.xRule1[0].slots, [10]);
    assert.strictEqual(sig.xRule2.length, 0);
    assert.strictEqual(sig.xRule3.length, 0);
    assert.strictEqual(sig.mrRule1.length, 1);
    assert.deepStrictEqual(sig.mrRule1[0].slots, [11]);
  });
});

describe("detectSignals — X Rule 2 (run of 8+ same side of μ)", () => {
  test("fires for 8 consecutive values above μ", () => {
    // 5 low values come first, then 8 high values. That is a run of 8 above μ.
    const values = [1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9, 9];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);

    assert.strictEqual(sig.xRule2.length, 1);
    assert.deepStrictEqual(sig.xRule2[0].slots, [6, 7, 8, 9, 10, 11, 12, 13]);
  });

  test("does NOT fire for 7 consecutive values on the same side", () => {
    const values = [1, 1, 1, 1, 1, 1, 9, 9, 9, 9, 9, 9, 9];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);
    assert.strictEqual(sig.xRule2.length, 0);
  });

  test("under strict-inequality comparison, an 8-long run + neutral neighbors still fires", () => {
    // The values give a strict above-side run of exactly 8, then a flip.
    // Rule 2 fires.
    const values = [9, 9, 9, 9, 9, 9, 9, 9, 1, 1, 1, 1, 1];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);
    assert.strictEqual(sig.xRule2.length, 1);
    assert.strictEqual(sig.xRule2[0].slots.length, 8);
  });
});

describe("detectSignals — X Rule 3 (3 of 4 in outer zone)", () => {
  test("fires when 3 of 4 consecutive values are strictly beyond +1.5σ̂", () => {
    // Construct a series whose μ ≈ 0 and whose σ̂ lets three points sit
    // beyond +1.5σ̂ in a 4-slot window.
    const values = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0, // baseline
      10,
      10,
      1,
      10, // window with 3 of 4 beyond +1.5σ̂
    ];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);

    assert.ok(
      sig.xRule3.length > 0,
      `expected at least one Rule 3 signal, got 0`,
    );
    const all = sig.xRule3.flatMap((s) => s.slots);
    assert.ok(all.includes(12) && all.includes(13) && all.includes(15));
  });

  test("collapses windows that overlap and fire into one signal per stretch", () => {
    // A 4-slot stretch in the outer-upper zone fires three 4-windows that
    // overlap. They must merge into a single signal. They must not emit
    // once per start position.
    const values = [
      1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 3, 3, 3, 3, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2,
    ];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);

    assert.strictEqual(sig.xRule3.length, 1);
    assert.deepStrictEqual(sig.xRule3[0].slots, [11, 12, 13, 14]);
  });

  test("does NOT fire when only 2 of 4 values are beyond the zone", () => {
    const values = Array(15).fill(5);
    values[10] = 50;
    values[11] = 50;
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);
    assert.strictEqual(sig.xRule3.length, 0);
  });
});

describe("detectSignals — mR Rule 1", () => {
  test("fires when mR exceeds the URL", () => {
    // A single large jump produces an mR breach.
    const values = [5, 5, 5, 5, 5, 5, 5, 5, 100, 5];
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);

    assert.strictEqual(sig.mrRule1.length, 2);
    assert.deepStrictEqual(sig.mrRule1[0].slots, [9]);
    assert.deepStrictEqual(sig.mrRule1[1].slots, [10]);
  });

  test("does NOT fire when all mR ≤ URL", () => {
    const values = Array.from({ length: 20 }, (_, i) => 10 + (i % 2));
    const stats = computeXmR(values);
    const sig = detectSignals(values, stats.mrs, stats);
    assert.strictEqual(sig.mrRule1.length, 0);
  });
});

describe("signal masks", () => {
  test("the X mask covers every slot in xRule1/2/3", () => {
    const sig = {
      xRule1: [{ slots: [3] }],
      xRule2: [{ slots: [5, 6, 7] }],
      xRule3: [{ slots: [10] }],
      mrRule1: [{ slots: [4] }],
    };
    const mask = buildSignalMask(sig, 12);
    assert.strictEqual(mask[3], true);
    assert.strictEqual(mask[5], true);
    assert.strictEqual(mask[6], true);
    assert.strictEqual(mask[7], true);
    assert.strictEqual(mask[10], true);
    // The mR rule never marks the X mask.
    assert.strictEqual(mask[4], false);
  });

  test("the mR mask covers only mrRule1 slots", () => {
    const sig = {
      xRule1: [{ slots: [3] }],
      xRule2: [],
      xRule3: [],
      mrRule1: [{ slots: [4] }, { slots: [9] }],
    };
    const mask = buildMRSignalMask(sig, 12);
    assert.strictEqual(mask[4], true);
    assert.strictEqual(mask[9], true);
    assert.strictEqual(mask[3], false);
  });
});
