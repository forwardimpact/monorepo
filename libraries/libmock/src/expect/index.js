/**
 * Dependency-free, runner-independent `expect()` shim. Replaces `expect` from
 * `bun:test` so the test suite can run under `node --test` (which ships no
 * `expect`) as well as `bun test`. Mirrors how `spy()` replaced `mock.fn`.
 *
 * Covers exactly the matcher surface the converged test files use: `toBe`,
 * `toEqual`, `toMatchObject`, `toBeNull`, `toBeUndefined`, `toBeDefined`,
 * `toBeTruthy`, `toBeGreaterThan`, `toBeGreaterThanOrEqual`,
 * `toBeLessThanOrEqual`, `toHaveLength`, `toContain`, `toMatch`, `toThrow`,
 * plus the `.not`, `.resolves`, and `.rejects` chain modifiers.
 *
 * Imports only from the Node standard library.
 */

import { AssertionError } from "node:assert";
import { isDeepStrictEqual } from "node:util";

/**
 * Render a value for assertion messages without throwing on circular refs.
 * @param {unknown} value - Value to stringify.
 * @returns {string} Human-readable rendering.
 */
function show(value) {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (value instanceof Map) {
    return `Map(${value.size})`;
  }
  if (value instanceof Set) {
    return `Set(${value.size})`;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Throw or, when negated, swallow — the single choke point that makes `.not`
 * invert every matcher. `pass` is the un-negated truth of the assertion.
 * @param {boolean} pass - Whether the positive assertion holds.
 * @param {boolean} negated - Whether `.not` is active.
 * @param {string} message - Message for the failing (positive) direction.
 * @param {string} [negatedMessage] - Message for the failing negated direction.
 */
function settle(pass, negated, message, negatedMessage) {
  if (negated) {
    if (pass) {
      throw new AssertionError({
        message: negatedMessage ?? `not: ${message}`,
      });
    }
    return;
  }
  if (!pass) {
    throw new AssertionError({ message });
  }
}

const ASYMMETRIC = Symbol.for("libmock.expect.asymmetric");

/**
 * Whether `value` is an asymmetric matcher produced by `expect.any` / friends.
 * @param {unknown} value - Candidate.
 * @returns {boolean} True when `value` carries the asymmetric marker.
 */
function isAsymmetric(value) {
  return (
    value != null && typeof value === "object" && value[ASYMMETRIC] === true
  );
}

/**
 * Structural equality that understands asymmetric matchers (`expect.any`).
 * Falls back to `node:util.isDeepStrictEqual` when neither side carries one.
 * @param {unknown} actual - Observed value.
 * @param {unknown} expected - Expected value, possibly an asymmetric matcher.
 * @returns {boolean} Whether they match.
 */
function equals(actual, expected) {
  if (isAsymmetric(expected)) {
    return expected.asymmetricMatch(actual);
  }
  if (expected === null || typeof expected !== "object") {
    return Object.is(actual, expected) || isDeepStrictEqual(actual, expected);
  }
  if (actual === null || typeof actual !== "object") {
    return false;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      return false;
    }
    return expected.every((e, i) => equals(actual[i], e));
  }
  // No asymmetric matcher anywhere → exact deep equality is correct and cheap.
  if (!containsAsymmetric(expected)) {
    return isDeepStrictEqual(actual, expected);
  }
  const keys = Object.keys(expected);
  if (keys.length !== Object.keys(actual).length) {
    return false;
  }
  return keys.every((k) => equals(actual[k], expected[k]));
}

/**
 * Whether an expected value tree contains any asymmetric matcher.
 * @param {unknown} value - Tree to scan.
 * @returns {boolean} True if an asymmetric matcher is present.
 */
function containsAsymmetric(value) {
  if (isAsymmetric(value)) {
    return true;
  }
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsAsymmetric);
  }
  return Object.values(value).some(containsAsymmetric);
}

/**
 * Deep subset match: every own enumerable key of `subset` matches the same key
 * in `actual` (recursively for plain objects, asymmetric-aware).
 * @param {unknown} actual - Candidate object.
 * @param {unknown} subset - Expected subset.
 * @returns {boolean} Whether `actual` contains `subset`.
 */
function matchesObject(actual, subset) {
  if (isAsymmetric(subset)) {
    return subset.asymmetricMatch(actual);
  }
  if (subset === null || typeof subset !== "object") {
    return equals(actual, subset);
  }
  if (actual === null || typeof actual !== "object") {
    return false;
  }
  for (const key of Object.keys(subset)) {
    const sv = subset[key];
    const av = actual[key];
    if (
      sv !== null &&
      typeof sv === "object" &&
      !Array.isArray(sv) &&
      !isAsymmetric(sv)
    ) {
      if (!matchesObject(av, sv)) {
        return false;
      }
    } else if (!equals(av, sv)) {
      return false;
    }
  }
  return true;
}

/**
 * Run a possibly-throwing function and apply the `toThrow` predicate.
 * @param {() => unknown} fn - The thunk under test.
 * @param {unknown} matcher - undefined, a string (substring), or a RegExp.
 * @param {boolean} negated - Whether `.not` is active.
 */
function assertThrow(fn, matcher, negated) {
  if (typeof fn !== "function") {
    throw new AssertionError({
      message: `toThrow expects a function, got ${show(fn)}`,
    });
  }
  let thrown;
  let didThrow = false;
  try {
    fn();
  } catch (err) {
    didThrow = true;
    thrown = err;
  }
  if (!didThrow) {
    settle(false, negated, "expected function to throw, but it did not");
    return;
  }
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  let pass = true;
  if (typeof matcher === "string") {
    pass = message.includes(matcher);
  } else if (matcher instanceof RegExp) {
    pass = matcher.test(message);
  }
  settle(
    pass,
    negated,
    `expected thrown message ${show(message)} to match ${show(matcher)}`,
    `expected thrown message ${show(message)} not to match ${show(matcher)}`,
  );
}

/**
 * Build the synchronous matcher object for an already-resolved actual value.
 * @param {unknown} actual - The value under test.
 * @param {boolean} negated - Whether `.not` is active.
 * @returns {object} Matcher object.
 */
function matchers(actual, negated) {
  return {
    get not() {
      return matchers(actual, !negated);
    },
    toBe(expected) {
      settle(
        Object.is(actual, expected),
        negated,
        `expected ${show(actual)} to be ${show(expected)}`,
        `expected ${show(actual)} not to be ${show(expected)}`,
      );
    },
    toEqual(expected) {
      settle(
        equals(actual, expected),
        negated,
        `expected ${show(actual)} to deep-equal ${show(expected)}`,
        `expected ${show(actual)} not to deep-equal ${show(expected)}`,
      );
    },
    toMatchObject(expected) {
      settle(
        matchesObject(actual, expected),
        negated,
        `expected ${show(actual)} to match object ${show(expected)}`,
        `expected ${show(actual)} not to match object ${show(expected)}`,
      );
    },
    toBeNull() {
      settle(
        actual === null,
        negated,
        `expected ${show(actual)} to be null`,
        `expected ${show(actual)} not to be null`,
      );
    },
    toBeUndefined() {
      settle(
        actual === undefined,
        negated,
        `expected ${show(actual)} to be undefined`,
        `expected ${show(actual)} not to be undefined`,
      );
    },
    toBeDefined() {
      settle(
        actual !== undefined,
        negated,
        `expected ${show(actual)} to be defined`,
        `expected ${show(actual)} not to be defined`,
      );
    },
    toBeTruthy() {
      settle(
        Boolean(actual),
        negated,
        `expected ${show(actual)} to be truthy`,
        `expected ${show(actual)} not to be truthy`,
      );
    },
    toBeGreaterThan(expected) {
      settle(
        actual > expected,
        negated,
        `expected ${show(actual)} to be greater than ${show(expected)}`,
        `expected ${show(actual)} not to be greater than ${show(expected)}`,
      );
    },
    toBeGreaterThanOrEqual(expected) {
      settle(
        actual >= expected,
        negated,
        `expected ${show(actual)} to be >= ${show(expected)}`,
        `expected ${show(actual)} not to be >= ${show(expected)}`,
      );
    },
    toBeLessThanOrEqual(expected) {
      settle(
        actual <= expected,
        negated,
        `expected ${show(actual)} to be <= ${show(expected)}`,
        `expected ${show(actual)} not to be <= ${show(expected)}`,
      );
    },
    toHaveLength(expected) {
      const len = actual == null ? undefined : actual.length;
      settle(
        len === expected,
        negated,
        `expected length ${show(len)} to be ${show(expected)}`,
        `expected length ${show(len)} not to be ${show(expected)}`,
      );
    },
    toContain(expected) {
      let pass = false;
      if (typeof actual === "string") {
        pass = actual.includes(expected);
      } else if (Array.isArray(actual)) {
        pass = actual.includes(expected);
      } else if (actual instanceof Set) {
        pass = actual.has(expected);
      } else if (
        actual != null &&
        typeof actual[Symbol.iterator] === "function"
      ) {
        pass = [...actual].includes(expected);
      }
      settle(
        pass,
        negated,
        `expected ${show(actual)} to contain ${show(expected)}`,
        `expected ${show(actual)} not to contain ${show(expected)}`,
      );
    },
    toMatch(expected) {
      const str = String(actual);
      const pass =
        expected instanceof RegExp
          ? expected.test(str)
          : str.includes(String(expected));
      settle(
        pass,
        negated,
        `expected ${show(str)} to match ${show(expected)}`,
        `expected ${show(str)} not to match ${show(expected)}`,
      );
    },
    toThrow(expected) {
      assertThrow(actual, expected, negated);
    },
  };
}

/**
 * Build the async matcher object for a promise-producing actual. Each matcher
 * awaits the promise and applies the underlying matcher to the settled value.
 * @param {unknown} actual - A promise (or thenable) under test.
 * @param {boolean} negated - Whether `.not` is active.
 * @param {"resolves" | "rejects"} mode - Which settlement to assert on.
 * @returns {object} Matcher object whose methods return promises.
 */
function asyncMatchers(actual, negated, mode) {
  const wrap = (apply) => async () => {
    let value;
    let rejected = false;
    let rejection;
    try {
      value = await actual;
    } catch (err) {
      rejected = true;
      rejection = err;
    }
    if (mode === "rejects") {
      if (!rejected) {
        throw new AssertionError({
          message: "expected promise to reject, but it resolved",
        });
      }
      return apply(rejection);
    }
    if (rejected) {
      throw new AssertionError({
        message: `expected promise to resolve, but it rejected with ${show(rejection)}`,
      });
    }
    return apply(value);
  };

  const make =
    (name) =>
    (...args) => {
      if (name === "toThrow") {
        // `rejects.toThrow(x)` asserts the rejection's message; the settled value
        // here is the rejection itself, so wrap it back into a throwing thunk.
        return wrap((settled) => {
          const thunk = () => {
            throw settled;
          };
          assertThrow(thunk, args[0], negated);
        })();
      }
      return wrap((settled) => matchers(settled, negated)[name](...args))();
    };

  return {
    get not() {
      return asyncMatchers(actual, !negated, mode);
    },
    toBe: make("toBe"),
    toEqual: make("toEqual"),
    toMatchObject: make("toMatchObject"),
    toBeNull: make("toBeNull"),
    toBeUndefined: make("toBeUndefined"),
    toBeDefined: make("toBeDefined"),
    toBeTruthy: make("toBeTruthy"),
    toBeGreaterThan: make("toBeGreaterThan"),
    toBeGreaterThanOrEqual: make("toBeGreaterThanOrEqual"),
    toBeLessThanOrEqual: make("toBeLessThanOrEqual"),
    toHaveLength: make("toHaveLength"),
    toContain: make("toContain"),
    toMatch: make("toMatch"),
    toThrow: make("toThrow"),
  };
}

/**
 * Jest-style `expect`. Returns a matcher object with `.not`, `.resolves`, and
 * `.rejects` chain modifiers plus the supported matchers.
 * @param {unknown} actual - The value under test.
 * @returns {object} Matcher object.
 */
export function expect(actual) {
  const base = matchers(actual, false);
  Object.defineProperties(base, {
    resolves: {
      get() {
        return asyncMatchers(actual, false, "resolves");
      },
    },
    rejects: {
      get() {
        return asyncMatchers(actual, false, "rejects");
      },
    },
  });
  return base;
}

/**
 * Asymmetric matcher: matches any value constructed by / typed as `ctor`,
 * for use inside `toEqual` / `toMatchObject`. Mirrors Jest/bun `expect.any`.
 * @param {Function} ctor - A constructor or primitive wrapper (String, Number…).
 * @returns {object} An asymmetric matcher.
 */
const PRIMITIVE_TYPEOF = new Map([
  [String, "string"],
  [Number, "number"],
  [Boolean, "boolean"],
  [BigInt, "bigint"],
  [Object, "object"],
  [Function, "function"],
]);

expect.any = (ctor) => ({
  [ASYMMETRIC]: true,
  asymmetricMatch(value) {
    if (value == null) {
      return false;
    }
    const primitive = PRIMITIVE_TYPEOF.get(ctor);
    if (primitive) {
      return typeof value === primitive || value instanceof ctor;
    }
    return value instanceof ctor;
  },
});

/**
 * Asymmetric matcher: matches any non-null, non-undefined value.
 * @returns {object} An asymmetric matcher.
 */
expect.anything = () => ({
  [ASYMMETRIC]: true,
  asymmetricMatch: (value) => value != null,
});
