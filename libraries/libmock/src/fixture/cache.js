/**
 * Helpers that cache fixtures across files. The test runner currently executes
 * one test file per process. But each `test(...)` case re-parses the fixtures
 * that a file loads inline, unless you hoist them. One example is the starter
 * standard YAML from `createDataLoader(runtime).loadAllData(dir)`.
 */

const caches = new WeakMap();
const stringCaches = new Map();

/**
 * Wraps an async factory. Calls the factory at most once per unique key.
 *
 * @template T
 * @param {string} key - Cache key. The same key returns the cached value.
 * @param {() => Promise<T>} factory - Factory to call on a cache miss.
 * @returns {Promise<T>}
 */
export async function memoizeAsync(key, factory) {
  if (stringCaches.has(key)) return stringCaches.get(key);
  const promise = Promise.resolve().then(factory);
  stringCaches.set(key, promise);
  try {
    return await promise;
  } catch (err) {
    stringCaches.delete(key);
    throw err;
  }
}

/**
 * Caches the result of `fn(subject)`. The identity of `subject` is the key.
 * Use it for expensive derivations over a frozen input object.
 *
 * @template S, T
 * @param {S} subject
 * @param {(subject: S) => T} fn
 * @returns {T}
 */
export function memoizeOnSubject(subject, fn) {
  if (!caches.has(subject)) caches.set(subject, fn(subject));
  return caches.get(subject);
}

/**
 * Clears all memoization caches. Use it only in self-tests of this helper.
 */
export function __resetMemoCaches() {
  stringCaches.clear();
}
