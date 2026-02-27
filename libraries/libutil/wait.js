/**
 * Poll until a condition returns true with exponential backoff
 * @param {() => Promise<boolean>} checkFn - Function that returns true when ready
 * @param {object} [options] - Configuration options
 * @param {number} [options.timeout] - Maximum time to wait in ms
 * @param {number} [options.interval] - Initial polling interval in ms
 * @param {number} [options.maxInterval] - Maximum polling interval in ms
 * @returns {Promise<void>}
 * @throws {Error} When timeout is reached
 */
export async function waitFor(checkFn, options = {}) {
  const { timeout = 30000, interval = 1000, maxInterval = 10000 } = options;
  const startTime = Date.now();
  let currentInterval = interval;

  while (Date.now() - startTime < timeout) {
    try {
      if (await checkFn()) return;
    } catch {
      // Ignore errors during polling - service may not be up yet
    }

    await new Promise((resolve) => setTimeout(resolve, currentInterval));
    currentInterval = Math.min(currentInterval * 1.5, maxInterval);
  }

  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}
