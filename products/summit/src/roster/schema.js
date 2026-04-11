/**
 * Validate a roster against loaded Map framework data.
 *
 * Checks each person's `job.discipline`, `job.level`, and optional
 * `job.track` against the loaded framework definitions. Returns a
 * structured result without throwing — callers decide whether to fail
 * or warn based on command context (the `validate` command exits
 * non-zero; analytical commands warn and proceed).
 */

/**
 * @typedef {object} Issue
 * @property {string} code
 * @property {string} message
 * @property {object} [context]
 */

/**
 * @typedef {object} ValidationResult
 * @property {Issue[]} errors
 * @property {Issue[]} warnings
 */

/**
 * Validate a roster.
 *
 * @param {import("./yaml.js").Roster} roster
 * @param {object} data - Map data object from `createDataLoader().loadAllData()`.
 * @returns {ValidationResult}
 */
export function validateRosterAgainstFramework(roster, data) {
  const errors = [];
  const warnings = [];

  const disciplines = new Set((data.disciplines ?? []).map((d) => d.id));
  const levels = new Set((data.levels ?? []).map((l) => l.id));
  const tracks = new Set((data.tracks ?? []).map((t) => t.id));

  for (const team of roster.teams.values()) {
    validateTeamMembers(team, "teams", { disciplines, levels, tracks }, errors);
  }

  for (const team of roster.projects.values()) {
    validateTeamMembers(
      team,
      "projects",
      { disciplines, levels, tracks },
      errors,
    );
  }

  return { errors, warnings };
}

function validateTeamMembers(team, section, known, errors) {
  for (const member of team.members) {
    const pointer = `${section}.${team.id}[${member.name ?? member.email}]`;

    if (!known.disciplines.has(member.job.discipline)) {
      errors.push({
        code: "UNKNOWN_DISCIPLINE",
        message: `${pointer} job.discipline: "${member.job.discipline}" is not defined in disciplines.`,
        context: {
          team: team.id,
          member: member.email,
          field: "discipline",
          value: member.job.discipline,
        },
      });
    }
    if (!known.levels.has(member.job.level)) {
      errors.push({
        code: "UNKNOWN_LEVEL",
        message: `${pointer} job.level: "${member.job.level}" is not defined in levels.yaml.`,
        context: {
          team: team.id,
          member: member.email,
          field: "level",
          value: member.job.level,
        },
      });
    }
    if (member.job.track && !known.tracks.has(member.job.track)) {
      errors.push({
        code: "UNKNOWN_TRACK",
        message: `${pointer} job.track: "${member.job.track}" is not defined in tracks.`,
        context: {
          team: team.id,
          member: member.email,
          field: "track",
          value: member.job.track,
        },
      });
    }
  }
}
