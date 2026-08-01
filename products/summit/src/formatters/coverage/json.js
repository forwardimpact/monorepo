/**
 * JSON formatter for the `coverage` command.
 *
 * The shape mirrors spec.md:836–847 for project teams. For reporting
 * teams, the formatter omits `effectiveFte`. Skill rows then carry a
 * simple `depth` in place of split derived and effective fields.
 */

/**
 * Convert a TeamCoverage to a plain JSON-serializable object.
 *
 * @param {import("../../aggregation/coverage.js").TeamCoverage} coverage
 * @returns {object}
 */
export function coverageToJson(coverage) {
  const out = {
    team: coverage.teamId,
    type: coverage.teamType,
    members: coverage.memberCount,
  };
  if (coverage.teamType === "project") {
    out.effectiveFte = round(coverage.effectiveFte, 2);
  }

  out.coverage = {};
  for (const [skillId, skill] of coverage.skills) {
    if (coverage.teamType === "project") {
      out.coverage[skillId] = {
        derivedDepth: skill.headcountDepth,
        effectiveDepth: round(skill.effectiveDepth, 2),
        maxProficiency: skill.maxProficiency,
        distribution: skill.distribution,
      };
    } else {
      out.coverage[skillId] = {
        depth: skill.headcountDepth,
        maxProficiency: skill.maxProficiency,
        distribution: skill.distribution,
      };
    }
  }

  return out;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
