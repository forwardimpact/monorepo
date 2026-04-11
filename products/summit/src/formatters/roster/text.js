/**
 * Text formatter for the `roster` command.
 */

/**
 * Render a roster as a plain-text summary.
 *
 * @param {import("../../roster/yaml.js").Roster} roster
 * @param {object[]} levels - Map levels (used for level distribution labels).
 * @returns {string}
 */
export function rosterToText(roster, levels) {
  const lines = [];
  const sourceLabel = roster.source === "yaml" ? "summit.yaml" : "Map";
  lines.push(`  Source: ${sourceLabel}`);
  lines.push("");

  if (roster.teams.size === 0 && roster.projects.size === 0) {
    lines.push("  (no teams or projects defined)");
    return lines.join("\n") + "\n";
  }

  if (roster.teams.size > 0) {
    lines.push("  Teams:");
    for (const [teamId, team] of roster.teams) {
      const dist = formatLevelDistribution(team.members, levels);
      lines.push(
        `    ${teamId.padEnd(14)} ${String(team.members.length).padStart(2)} members${
          dist ? `  (${dist})` : ""
        }`,
      );
    }
    lines.push("");
  }

  if (roster.projects.size > 0) {
    lines.push("  Projects:");
    for (const [projectId, project] of roster.projects) {
      const fte = project.members.reduce(
        (sum, m) => sum + (m.allocation ?? 1.0),
        0,
      );
      lines.push(
        `    ${projectId.padEnd(14)} ${String(project.members.length).padStart(2)} members  (${fte.toFixed(1)} effective FTE)`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatLevelDistribution(members, levels) {
  if (!levels || levels.length === 0) return "";
  const counts = new Map();
  for (const member of members) {
    const levelId = member.job.level;
    counts.set(levelId, (counts.get(levelId) ?? 0) + 1);
  }
  const ordered = [...levels]
    .sort((a, b) => (b.ordinalRank ?? 0) - (a.ordinalRank ?? 0))
    .filter((l) => counts.has(l.id));
  if (ordered.length === 0) return "";
  return ordered
    .map((l) => {
      const count = counts.get(l.id);
      const title = l.professionalTitle ?? l.name ?? l.id;
      return `${count}× ${title}`;
    })
    .join(", ");
}
