/**
 * Privacy filters for Summit's audience model.
 *
 * Summit defines three audience modes: engineer, manager, director.
 * Every command filters its output before it renders. Director-scope
 * outputs never leak individual names, per spec.md:75–87.
 */

export const Audience = Object.freeze({
  ENGINEER: "engineer",
  MANAGER: "manager",
  DIRECTOR: "director",
});

/**
 * Resolve the audience from parsed CLI options (default: manager).
 *
 * @param {object} options
 * @returns {string}
 */
export function resolveAudience(options) {
  const value = options.audience ?? Audience.MANAGER;
  if (!Object.values(Audience).includes(value)) {
    throw new Error(
      `summit: invalid --audience "${value}". Expected one of engineer, manager, director.`,
    );
  }
  return value;
}

/**
 * Return a coverage object. For the director audience, this function
 * strips the holder identity. Manager and engineer audiences see their
 * own team's detail. Their coverage passes through unchanged.
 *
 * This function does not mutate the input.
 *
 * @param {import("../aggregation/coverage.js").TeamCoverage} coverage
 * @param {string} audience
 * @returns {import("../aggregation/coverage.js").TeamCoverage}
 */
export function withAudienceFilter(coverage, audience) {
  if (audience !== Audience.DIRECTOR) return coverage;

  const skills = new Map();
  for (const [skillId, entry] of coverage.skills) {
    skills.set(skillId, {
      ...entry,
      holders: entry.holders.map((h) => ({
        proficiency: h.proficiency,
        allocation: h.allocation,
      })),
    });
  }

  return { ...coverage, skills };
}
