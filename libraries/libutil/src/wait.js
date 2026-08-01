/**
 * Poll with exponential backoff until a condition returns true
 * @param {() => Promise<boolean>} checkFn - Function that returns true when ready
 * @param {object} options - Configuration options
 * @param {number} [options.timeout] - Maximum time to wait in ms
 * @param {number} [options.interval] - Initial poll interval in ms
 * @param {number} [options.maxInterval] - Maximum poll interval in ms
 * @param {(ms: number) => Promise<void>} delayFn - Function that returns a promise that resolves after ms
 * @returns {Promise<void>}
 * @throws {Error} When the timeout expires
 */
export async function waitFor(checkFn, options, delayFn) {
  if (!delayFn) throw new Error("delayFn is required");

  const { timeout = 30000, interval = 1000, maxInterval = 10000 } = options;
  const startTime = Date.now();
  let currentInterval = interval;

  while (Date.now() - startTime < timeout) {
    try {
      if (await checkFn()) return;
    } catch {
      // Ignore errors during the poll. The service may not be up yet
    }

    await delayFn(currentInterval);
    currentInterval = Math.min(currentInterval * 1.5, maxInterval);
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
