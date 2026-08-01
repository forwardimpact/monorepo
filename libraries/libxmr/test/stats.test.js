import { test, describe } from "node:test";
import assert from "node:assert";

import { computeXmR } from "../src/stats.js";
import { d2, E2, D4 } from "../src/constants.js";

const APPROX = 1e-9;

describe("constants", () => {
  test("the constants hold the Wheeler/Vacanti exact values for n=2", () => {
    assert.strictEqual(d2, 1.128);
    assert.strictEqual(E2, 2.66);
    assert.strictEqual(D4, 3.268);
  });
});

describe("computeXmR", () => {
  test("matches the Wheeler §10 worked example", () => {
    const values = [5, 6, 7, 5, 6, 4, 7, 8, 6, 13, 5, 6, 7, 6, 5];
    const stats = computeXmR(values);

    assert.strictEqual(stats.mu, 6.4);
    assert.ok(Math.abs(stats.R - 32 / 14) < APPROX);
    assert.ok(Math.abs(stats.sigmaHat - stats.R / d2) < APPROX);
    assert.ok(Math.abs(stats.UPL - (stats.mu + E2 * stats.R)) < APPROX);
    assert.ok(Math.abs(stats.LPL - (stats.mu - E2 * stats.R)) < APPROX);
    assert.ok(Math.abs(stats.URL - D4 * stats.R) < APPROX);
    assert.ok(
      Math.abs(stats.zoneUpper - (stats.mu + 1.5 * stats.sigmaHat)) < APPROX,
    );
    assert.ok(
      Math.abs(stats.zoneLower - (stats.mu - 1.5 * stats.sigmaHat)) < APPROX,
    );
  });

  test("does NOT clip LPL to zero", () => {
    // The variation is large relative to the mean. So LPL is negative.
    const values = [1, 10, 1, 10, 1, 10];
    const stats = computeXmR(values);
    assert.ok(stats.LPL < 0, `expected negative LPL, got ${stats.LPL}`);
  });

  test("zero variation collapses the limits to mu", () => {
    const stats = computeXmR([7, 7, 7, 7, 7]);
    assert.strictEqual(stats.mu, 7);
    assert.strictEqual(stats.R, 0);
    assert.strictEqual(stats.sigmaHat, 0);
    assert.strictEqual(stats.UPL, 7);
    assert.strictEqual(stats.LPL, 7);
    assert.strictEqual(stats.URL, 0);
  });

  test("a single value has an empty mr series", () => {
    const stats = computeXmR([5]);
    assert.strictEqual(stats.mu, 5);
    assert.strictEqual(stats.R, 0);
    assert.strictEqual(stats.mrs.length, 0);
  });

  test("mrs are absolute consecutive differences", () => {
    const stats = computeXmR([10, 12, 8, 11]);
    assert.deepStrictEqual(stats.mrs, [2, 4, 3]);
  });
});
