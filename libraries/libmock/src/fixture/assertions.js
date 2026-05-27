import assert from "node:assert";

/**
 * Asserts that a function throws with a matching message
 * @param {Function} fn - Function to test
 * @param {RegExp|string} pattern - Pattern to match
 * @param {string} message - Assertion message
 */
export function assertThrowsMessage(fn, pattern, message) {
  assert.throws(
    fn,
    { message: pattern instanceof RegExp ? pattern : new RegExp(pattern) },
    message,
  );
}

/**
 * Asserts that an async function rejects with a matching message
 * @param {Function} fn - Async function to test
 * @param {RegExp|string} pattern - Pattern to match
 * @param {string} message - Assertion message
 */
export async function assertRejectsMessage(fn, pattern, message) {
  await assert.rejects(
    fn,
    { message: pattern instanceof RegExp ? pattern : new RegExp(pattern) },
    message,
  );
}

/**
 * Creates a deferred promise for async testing
 * @returns {object} Object with promise, resolve, and reject
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
