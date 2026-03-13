import { describe, test } from "node:test";
import assert from "node:assert";
import { createSeededRNG } from "../engine/rng.js";

describe("createSeededRNG", () => {
  describe("determinism", () => {
    test("same seed produces same sequence", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(42);
      const seq1 = Array.from({ length: 10 }, () => rng1.random());
      const seq2 = Array.from({ length: 10 }, () => rng2.random());
      assert.deepStrictEqual(seq1, seq2);
    });

    test("different seeds produce different sequences", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(99);
      const seq1 = Array.from({ length: 5 }, () => rng1.random());
      const seq2 = Array.from({ length: 5 }, () => rng2.random());
      assert.notDeepStrictEqual(seq1, seq2);
    });

    test("string seed is deterministic", () => {
      const rng1 = createSeededRNG("hello");
      const rng2 = createSeededRNG("hello");
      assert.strictEqual(rng1.random(), rng2.random());
    });
  });

  describe("random()", () => {
    test("returns values in [0, 1)", () => {
      const rng = createSeededRNG(42);
      for (let i = 0; i < 100; i++) {
        const val = rng.random();
        assert.ok(val >= 0, `Expected >= 0, got ${val}`);
        assert.ok(val < 1, `Expected < 1, got ${val}`);
      }
    });

    test("returns different values on successive calls", () => {
      const rng = createSeededRNG(42);
      const a = rng.random();
      const b = rng.random();
      assert.notStrictEqual(a, b);
    });
  });

  describe("randomInt(min, max)", () => {
    test("returns integers within the specified range", () => {
      const rng = createSeededRNG(42);
      for (let i = 0; i < 100; i++) {
        const val = rng.randomInt(1, 10);
        assert.ok(Number.isInteger(val), `Expected integer, got ${val}`);
        assert.ok(val >= 1, `Expected >= 1, got ${val}`);
        assert.ok(val <= 10, `Expected <= 10, got ${val}`);
      }
    });

    test("returns min when min equals max", () => {
      const rng = createSeededRNG(42);
      const val = rng.randomInt(5, 5);
      assert.strictEqual(val, 5);
    });

    test("handles range of 0 to 0", () => {
      const rng = createSeededRNG(42);
      assert.strictEqual(rng.randomInt(0, 0), 0);
    });

    test("is deterministic for same seed", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(42);
      for (let i = 0; i < 20; i++) {
        assert.strictEqual(rng1.randomInt(0, 100), rng2.randomInt(0, 100));
      }
    });
  });

  describe("pick(arr)", () => {
    test("returns an element from the array", () => {
      const rng = createSeededRNG(42);
      const arr = ["a", "b", "c", "d", "e"];
      for (let i = 0; i < 50; i++) {
        const picked = rng.pick(arr);
        assert.ok(arr.includes(picked), `Picked '${picked}' not in array`);
      }
    });

    test("returns the only element for single-item arrays", () => {
      const rng = createSeededRNG(42);
      assert.strictEqual(rng.pick(["only"]), "only");
    });

    test("is deterministic for same seed", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(42);
      const arr = [1, 2, 3, 4, 5];
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(rng1.pick(arr), rng2.pick(arr));
      }
    });
  });

  describe("shuffle(arr)", () => {
    test("returns a new array with same elements", () => {
      const rng = createSeededRNG(42);
      const arr = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle(arr);
      assert.strictEqual(shuffled.length, arr.length);
      assert.deepStrictEqual([...shuffled].sort(), [...arr].sort());
    });

    test("does not modify the original array", () => {
      const rng = createSeededRNG(42);
      const arr = [1, 2, 3, 4, 5];
      const original = [...arr];
      rng.shuffle(arr);
      assert.deepStrictEqual(arr, original);
    });

    test("is deterministic for same seed", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(42);
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      assert.deepStrictEqual(rng1.shuffle(arr), rng2.shuffle(arr));
    });

    test("handles single-element arrays", () => {
      const rng = createSeededRNG(42);
      assert.deepStrictEqual(rng.shuffle([1]), [1]);
    });

    test("handles empty arrays", () => {
      const rng = createSeededRNG(42);
      assert.deepStrictEqual(rng.shuffle([]), []);
    });
  });

  describe("weightedPick(weights)", () => {
    test("returns a valid index", () => {
      const rng = createSeededRNG(42);
      const weights = [10, 20, 30];
      for (let i = 0; i < 50; i++) {
        const idx = rng.weightedPick(weights);
        assert.ok(
          idx >= 0 && idx < weights.length,
          `Index ${idx} out of range`,
        );
      }
    });

    test("respects heavy weighting", () => {
      const rng = createSeededRNG(42);
      // Weight index 2 very heavily
      const weights = [1, 1, 1000];
      const counts = [0, 0, 0];
      for (let i = 0; i < 200; i++) {
        counts[rng.weightedPick(weights)]++;
      }
      // Index 2 should dominate
      assert.ok(
        counts[2] > counts[0] + counts[1],
        `Expected index 2 to dominate: ${JSON.stringify(counts)}`,
      );
    });

    test("returns only valid index for single-weight array", () => {
      const rng = createSeededRNG(42);
      assert.strictEqual(rng.weightedPick([100]), 0);
    });

    test("is deterministic for same seed", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(42);
      const weights = [10, 20, 30, 40];
      for (let i = 0; i < 20; i++) {
        assert.strictEqual(
          rng1.weightedPick(weights),
          rng2.weightedPick(weights),
        );
      }
    });
  });

  describe("gaussian(mean, std)", () => {
    test("produces values centered around the mean", () => {
      const rng = createSeededRNG(42);
      const mean = 50;
      const std = 10;
      const values = Array.from({ length: 1000 }, () =>
        rng.gaussian(mean, std),
      );
      const avg = values.reduce((s, v) => s + v, 0) / values.length;
      // Average should be reasonably close to mean
      assert.ok(
        Math.abs(avg - mean) < 3,
        `Average ${avg} too far from mean ${mean}`,
      );
    });

    test("produces reasonable spread", () => {
      const rng = createSeededRNG(42);
      const mean = 0;
      const std = 1;
      const values = Array.from({ length: 1000 }, () =>
        rng.gaussian(mean, std),
      );
      // Most values should be within 3 standard deviations
      const withinThreeSigma = values.filter(
        (v) => v >= mean - 3 * std && v <= mean + 3 * std,
      );
      assert.ok(
        withinThreeSigma.length > 990,
        `Expected >99% within 3 sigma, got ${withinThreeSigma.length}/1000`,
      );
    });

    test("is deterministic for same seed", () => {
      const rng1 = createSeededRNG(42);
      const rng2 = createSeededRNG(42);
      for (let i = 0; i < 10; i++) {
        assert.strictEqual(rng1.gaussian(0, 1), rng2.gaussian(0, 1));
      }
    });

    test("respects custom mean and std", () => {
      const rng = createSeededRNG(42);
      const values = Array.from({ length: 500 }, () => rng.gaussian(100, 5));
      const min = Math.min(...values);
      const max = Math.max(...values);
      // Should be roughly within 100 +/- 25 (5 sigma)
      assert.ok(min > 70, `Min ${min} too low for mean=100, std=5`);
      assert.ok(max < 130, `Max ${max} too high for mean=100, std=5`);
    });
  });
});
