// The engine. It runs every rule against one cutoff and returns one verdict.
// Doubt stops the line: a probe that cannot read, and a response that cannot
// cover the window, both breach.

import { isoTimestamp } from "@forwardimpact/libutil";

/**
 * Run every rule and build one verdict.
 * @param {Array<object>} rules - The rules to run.
 * @param {object} input
 * @param {Function} input.request - The REST request function.
 * @param {string} input.repo - `owner/repo`.
 * @param {string} input.defaultBranch - The branch the commits probe reads.
 * @param {{now: () => number}} input.clock - The clock the cutoff derives from.
 * @param {number} input.windowMs - The window the counters cover.
 * @returns {Promise<object>} The verdict: `cutoff`, `windowMs`, `counts`
 *   (each carrying its own threshold), `breaches`, and `engage`.
 */
export async function evaluate(
  rules,
  { request, repo, defaultBranch, clock, windowMs },
) {
  const cutoff = isoTimestamp(clock.now() - windowMs);
  const counts = [];
  const breaches = [];

  for (const rule of rules) {
    let reading;
    try {
      reading = await rule.probe({ request, repo, defaultBranch, cutoff });
    } catch (error) {
      counts.push({
        id: rule.id,
        count: null,
        covered: false,
        threshold: rule.threshold,
        error: error.message,
      });
      breaches.push({
        id: rule.id,
        kind: "unreadable",
        count: null,
        threshold: rule.threshold,
      });
      continue;
    }

    counts.push({
      id: rule.id,
      count: reading.count,
      covered: reading.covered,
      threshold: rule.threshold,
      error: null,
    });

    // One probe raises at most one breach, and `uncovered` outranks a count
    // that also sits over the threshold.
    if (!reading.covered) {
      breaches.push({
        id: rule.id,
        kind: "uncovered",
        count: reading.count,
        threshold: rule.threshold,
      });
    } else if (reading.count >= rule.threshold) {
      breaches.push({
        id: rule.id,
        kind: "threshold",
        count: reading.count,
        threshold: rule.threshold,
      });
    }
  }

  return { cutoff, windowMs, counts, breaches, engage: breaches.length > 0 };
}
