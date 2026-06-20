/**
 * The active work-item tracker selects which column of the work-trackers
 * matrix realizes each coordination operation (see the agent reference
 * `work-trackers.md`). `github` is the production binding; the offline
 * coordination benchmark runs under `filesystem`.
 */
export const DEFAULT_WORK_TRACKER = "github";

/** Trackers the harness knows how to select. */
export const KNOWN_WORK_TRACKERS = ["github", "filesystem"];

/**
 * Resolve the active work tracker from parsed CLI option values, falling back
 * to the default when `--work-tracker` is absent or blank. The harness writes
 * the result to `LIBEVAL_WORK_TRACKER` on the agent environment, mirroring
 * `--agent-profile` → `LIBEVAL_AGENT_PROFILE`.
 * @param {Record<string, string|undefined>} values - Parsed option values
 * @returns {string}
 * @throws {Error} if `--work-tracker` is set to an unknown tracker
 */
export function resolveWorkTracker(values) {
  const tracker = values["work-tracker"] || DEFAULT_WORK_TRACKER;
  if (!KNOWN_WORK_TRACKERS.includes(tracker)) {
    throw new Error(
      `unknown work tracker '${tracker}'; expected one of: ${KNOWN_WORK_TRACKERS.join(", ")}`,
    );
  }
  return tracker;
}
