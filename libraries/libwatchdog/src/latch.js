// The latch policy. `engage` runs only after a breach, so the policy carries
// no verdict. It answers one question: may this run write?

import { isTruthy } from "./truthy.js";

/**
 * Decide whether to write the latch.
 *
 * A truthy effective value means the team is already stopped. A repository
 * record a human cleared inside the window gets its quiet window, so the
 * burst that caused the stop drains out of the counters before the watchdog
 * may stop the team again.
 * @param {object} state - The latch state `read()` returned.
 * @param {object} options
 * @param {number} options.windowMs - The quiet window's length.
 * @param {number} options.now - The current epoch time in ms.
 * @returns {"engage"|"skip"} The decision.
 */
export function decide(state, { windowMs, now }) {
  if (isTruthy(state.value)) return "skip";

  const repository = state.repository;
  if (
    repository &&
    !isTruthy(repository.value) &&
    repository.updatedAt &&
    now - Date.parse(repository.updatedAt) < windowMs
  ) {
    return "skip";
  }

  return "engage";
}
