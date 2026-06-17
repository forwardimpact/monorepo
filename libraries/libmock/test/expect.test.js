import { describe, test } from "node:test";
import assert from "node:assert";
import { expect } from "../src/expect/index.js";

// Per-matcher anti-vacuity property. For every matcher in the shim's usage
// surface, a passing case must NOT throw and a deliberately-wrong case MUST
// throw. A no-op matcher body would pass the "wrong" case and is caught here.
const MATCHER_CASES = [
  { name: "toBe", pass: [1, 1], fail: [1, 2] },
  { name: "toEqual", pass: [{ a: 1 }, { a: 1 }], fail: [{ a: 1 }, { a: 2 }] },
  {
    name: "toMatchObject",
    pass: [{ a: 1, b: 2 }, { a: 1 }],
    fail: [{ a: 1 }, { a: 2 }],
  },
  { name: "toBeNull", pass: [null], fail: [0] },
  { name: "toBeUndefined", pass: [undefined], fail: [null] },
  { name: "toBeDefined", pass: [0], fail: [undefined] },
  { name: "toBeTruthy", pass: [1], fail: [0] },
  { name: "toBeGreaterThan", pass: [3, 2], fail: [2, 3] },
  { name: "toBeGreaterThanOrEqual", pass: [2, 2], fail: [1, 2] },
  { name: "toBeLessThanOrEqual", pass: [2, 2], fail: [3, 2] },
  { name: "toHaveLength", pass: [[1, 2], 2], fail: [[1, 2], 3] },
  { name: "toContain", pass: [[1, 2, 3], 2], fail: [[1, 2, 3], 9] },
  { name: "toMatch", pass: ["hello", /ell/], fail: ["hello", /xyz/] },
  {
    name: "toThrow",
    pass: [
      () => {
        throw new Error("boom");
      },
    ],
    fail: [() => {}],
  },
];

describe("expect shim — per-matcher anti-vacuity property", () => {
  for (const { name, pass, fail } of MATCHER_CASES) {
    test(`${name}: passing case does not throw`, () => {
      const [actual, ...args] = pass;
      assert.doesNotThrow(() => expect(actual)[name](...args));
    });
    test(`${name}: wrong case throws (a no-op matcher would not)`, () => {
      const [actual, ...args] = fail;
      assert.throws(() => expect(actual)[name](...args));
    });
  }
});

describe("expect shim — .not is genuinely inverting", () => {
  test(".not passes when the positive would fail", () => {
    assert.doesNotThrow(() => expect(1).not.toBe(2));
  });
  test(".not throws when the positive would pass (passthrough .not is vacuous)", () => {
    // A negated assertion that SHOULD fail must throw. If `.not` were a
    // passthrough, this would silently pass.
    assert.throws(() => expect(1).not.toBe(1));
  });
});

describe("expect shim — async negatives", () => {
  test("rejects.toThrow() on a non-rejecting promise must fail", async () => {
    // An unawaited / passthrough `rejects` chain passes green; this asserts the
    // shim actually fails when the promise does not reject.
    await assert.rejects(async () => {
      await expect(Promise.resolve(1)).rejects.toThrow();
    });
  });
  test("rejects.toThrow() on a genuinely rejecting promise passes", async () => {
    await assert.doesNotReject(async () => {
      await expect(Promise.reject(new Error("nope"))).rejects.toThrow("nope");
    });
  });
  test("resolves matcher applies to the resolved value", async () => {
    await assert.doesNotReject(async () => {
      await expect(Promise.resolve(5)).resolves.toBe(5);
    });
    await assert.rejects(async () => {
      await expect(Promise.resolve(5)).resolves.toBe(6);
    });
  });
});

describe("expect shim — expect.any asymmetric matcher", () => {
  test("toEqual with expect.any(String) passes on a string, fails otherwise", () => {
    assert.doesNotThrow(() =>
      expect({ id: "x" }).toEqual({ id: expect.any(String) }),
    );
    assert.throws(() => expect({ id: 7 }).toEqual({ id: expect.any(String) }));
  });
  test("expect.anything rejects null/undefined", () => {
    assert.doesNotThrow(() =>
      expect({ a: 1 }).toEqual({ a: expect.anything() }),
    );
    assert.throws(() => expect({ a: null }).toEqual({ a: expect.anything() }));
  });
});

describe("expect shim — semantics drift the 49 files rely on", () => {
  test("toEqual deep-equals Map and Set", () => {
    assert.doesNotThrow(() =>
      expect(new Map([["a", 1]])).toEqual(new Map([["a", 1]])),
    );
    assert.throws(() =>
      expect(new Map([["a", 1]])).toEqual(new Map([["a", 2]])),
    );
    assert.doesNotThrow(() => expect(new Set([1, 2])).toEqual(new Set([1, 2])));
    assert.throws(() => expect(new Set([1, 2])).toEqual(new Set([1, 3])));
  });
  test("toThrow matches by substring and by RegExp", () => {
    const boom = () => {
      throw new Error("connection refused");
    };
    assert.doesNotThrow(() => expect(boom).toThrow("refused"));
    assert.doesNotThrow(() => expect(boom).toThrow(/conn.*refused/));
    assert.throws(() => expect(boom).toThrow("accepted"));
  });
  test("async .rejects surfaces the rejection value", async () => {
    await assert.doesNotReject(async () => {
      await expect(Promise.reject(new Error("E_DRIFT"))).rejects.toMatch(
        /DRIFT/,
      );
    });
  });
});
