/**
 * JSON formatter for the `roster` command.
 */

/**
 * Convert a roster to a JSON-friendly object.
 *
 * @param {import("../../roster/yaml.js").Roster} roster
 * @returns {object}
 */
export function rosterToJson(roster) {
  const teams = {};
  for (const [teamId, team] of roster.teams) {
    teams[teamId] = {
      members: team.members.length,
      people: team.members.map((m) => ({
        name: m.name,
        email: m.email,
        job: m.job,
      })),
    };
  }

  const projects = {};
  for (const [projectId, project] of roster.projects) {
    projects[projectId] = {
      members: project.members.length,
      effectiveFte: project.members.reduce(
        (sum, m) => sum + (m.allocation ?? 1.0),
        0,
      ),
      people: project.members.map((m) => ({
        name: m.name,
        email: m.email,
        job: m.job,
        allocation: m.allocation ?? 1.0,
      })),
    };
  }

  return { source: roster.source, teams, projects };
}
