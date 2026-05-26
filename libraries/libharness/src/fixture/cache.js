/**
 * Cross-file fixture caching helpers. The test runner currently executes one
 * test file per process, but fixtures loaded inside a file (e.g. starter
 * standard YAML via `createDataLoader().loadAllData(dir)`) are re-parsed for
 * every `test(...)` case unless hoisted.
 */

const caches = new WeakMap();
const stringCaches = new Map();

/**
 * Wraps an async factory so it is invoked at most once per unique key.
 *
 * @template T
 * @param {string} key - Cache key. Using the same key returns the cached value.
 * @param {() => Promise<T>} factory - Factory invoked on miss.
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
 * Caches the result of `fn(subject)` keyed by identity of `subject`. Useful
 * for expensive derivations over a frozen input object.
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
 * Clears all memoization caches. Only useful in self-tests of this helper.
 */
export function __resetMemoCaches() {
  stringCaches.clear();
}
