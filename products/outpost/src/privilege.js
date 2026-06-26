/**
 * Privilege — resolve an agent's least-privilege execution level and map it to
 * the hop-2 spawn disclaim flag.
 *
 * The level governs the macOS reach the daemon grants a woken agent. `full`
 * keeps today's single-grant model (the child inherits `fit-outpost.app` as its
 * responsible process, so Full Disk Access and Automation flow to it); a
 * `restricted` agent is held responsible for itself, so those grants are not
 * extended and it can reach only non-TCC-protected substrate.
 *
 * The level is mandatory and lives in the same user-only trust root as the
 * spawn-env allow-set and the state roots, so an agent cannot raise its own
 * level. Patterned on `posture.js` but with no `effective*` coercion and no
 * default — a missing or unrecognised value throws.
 */

/** The two privilege levels, in declaration order. */
export const PRIVILEGE_LEVELS = ["full", "restricted"];

/**
 * Resolve an agent's declared privilege level. The level is mandatory: a
 * missing or unrecognised value throws — there is no default.
 * @param {{ privilege?: string }} agent - One agent's config.
 * @returns {"full"|"restricted"} The declared level.
 * @throws {Error} when `agent.privilege` is not one of {@link PRIVILEGE_LEVELS}.
 */
export function resolvePrivilege(agent) {
  const level = agent?.privilege;
  if (!PRIVILEGE_LEVELS.includes(level)) {
    throw new Error(
      `invalid privilege "${level}"; expected one of ${PRIVILEGE_LEVELS.join(", ")}`,
    );
  }
  return level;
}

/**
 * Map a level to the hop-2 disclaim flag: `restricted` self-disclaims (`1`),
 * `full` keeps the inherited responsible process (`0`).
 * @param {"full"|"restricted"} level
 * @returns {0|1}
 */
export function disclaimFor(level) {
  return level === "restricted" ? 1 : 0;
}
