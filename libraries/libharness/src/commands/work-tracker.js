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
 * Resolve the active work tracker. Precedence: the explicit `--work-tracker`
 * flag, then an inherited `LIBEVAL_WORK_TRACKER` on the environment (so a CI
 * job or harness can select it without the flag), then the `github` default.
 * The harness writes the result to `LIBEVAL_WORK_TRACKER` on the agent
 * environment, mirroring `--agent-profile` → `LIBEVAL_AGENT_PROFILE`.
 * @param {Record<string, string|undefined>} values - Parsed option values
 * @param {Record<string, string|undefined>} [env] - Process environment
 *   (e.g. `runtime.proc.env`); read for the `LIBEVAL_WORK_TRACKER` fallback.
 * @returns {string}
 * @throws {Error} if the resolved tracker is unknown
 */
export function resolveWorkTracker(values, env = {}) {
  const tracker =
    values["work-tracker"] || env.LIBEVAL_WORK_TRACKER || DEFAULT_WORK_TRACKER;
  if (!KNOWN_WORK_TRACKERS.includes(tracker)) {
    throw new Error(
      `unknown work tracker '${tracker}'; expected one of: ${KNOWN_WORK_TRACKERS.join(", ")}`,
    );
  }
  return tracker;
}
