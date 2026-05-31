/**
 * Agent listing and summary helpers
 *
 * Splits the listing / summary output out of agent.js so the command file
 * stays focused on orchestration.
 */

import {
  getDisciplineAbbreviation,
  toKebabCase,
} from "@forwardimpact/libskill/agent";
import {
  formatHeader,
  formatSubheader,
  formatBullet,
  SummaryRenderer,
} from "@forwardimpact/libcli";

/**
 * Find valid agent combination pairs
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @returns {Array<{discipline: Object, track: Object, humanDiscipline: Object, humanTrack: Object}>}
 */
export function findValidCombinations(data, agentData) {
  const pairs = [];
  for (const discipline of agentData.disciplines) {
    for (const track of agentData.tracks) {
      const humanDiscipline = data.disciplines.find(
        (d) => d.id === discipline.id,
      );
      const humanTrack = data.tracks.find((t) => t.id === track.id);
      if (humanDiscipline && humanTrack) {
        pairs.push({ discipline, track, humanDiscipline, humanTrack });
      }
    }
  }
  return pairs;
}

/**
 * Show agent summary with stats
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {Array} skillsWithAgent - Skills with agent sections
 */
export function showAgentSummary(data, agentData, skillsWithAgent, runtime) {
  const summary = new SummaryRenderer({ process: runtime.proc });
  const validCombinations = findValidCombinations(data, agentData).length;
  const skillsWithAgentCount = skillsWithAgent.filter((s) => s.agent).length;

  runtime.proc.stdout.write("\n" + formatHeader("\u{1F916} Agent") + "\n");
  summary.render({
    title: formatSubheader("Coverage"),
    ok: true,
    items: [
      {
        label: "Disciplines",
        description: `${agentData.disciplines.length}/${data.disciplines.length} with agent definitions`,
      },
      {
        label: "Tracks",
        description: `${agentData.tracks.length}/${data.tracks.length} with agent definitions`,
      },
      {
        label: "Skills",
        description: `${skillsWithAgentCount}/${skillsWithAgent.length} with agent sections`,
      },
    ],
  });
  runtime.proc.stdout.write(
    "\n" + formatSubheader(`Valid combinations: ${validCombinations}`) + "\n\n",
  );
  runtime.proc.stdout.write(
    formatBullet("Run 'npx fit-pathway agent --list' for all combinations") +
      "\n",
  );
  runtime.proc.stdout.write(
    formatBullet(
      "Run 'npx fit-pathway agent <discipline> --track=<track>' to generate files",
    ) + "\n\n",
  );
}

/**
 * List available agent combinations — compact output for piping
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 */
function listAgentCombinationsCompact(data, agentData, runtime) {
  for (const {
    discipline,
    track,
    humanDiscipline,
    humanTrack,
  } of findValidCombinations(data, agentData)) {
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const agentName = `${abbrev}-${toKebabCase(track.id)}`;
    const specName = humanDiscipline.specialization || humanDiscipline.id;
    runtime.proc.stdout.write(
      `${agentName} ${discipline.id} ${track.id}, ${specName} (${humanTrack.name})\n`,
    );
  }
}

/**
 * List available agent combinations — verbose output (markdown)
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 */
function listAgentCombinationsVerbose(data, agentData, runtime) {
  // Markdown headings stay literal so downstream tools can parse them.
  runtime.proc.stdout.write("# 🤖 Available Agent Combinations\n\n");

  const agentDisciplineIds = new Set(agentData.disciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentData.tracks.map((t) => t.id));

  runtime.proc.stdout.write("## Disciplines with agent definitions:\n\n");
  for (const discipline of data.disciplines) {
    const status = agentDisciplineIds.has(discipline.id) ? "✅" : "⬜";
    runtime.proc.stdout.write(
      `  ${status} ${discipline.id} - ${discipline.specialization || discipline.name}\n`,
    );
  }

  runtime.proc.stdout.write("\n## Tracks with agent definitions:\n\n");
  for (const track of data.tracks) {
    const status = agentTrackIds.has(track.id) ? "✅" : "⬜";
    runtime.proc.stdout.write(`  ${status} ${track.id} - ${track.name}\n`);
  }

  runtime.proc.stdout.write("\n## Valid combinations:\n\n");
  for (const { discipline, track } of findValidCombinations(data, agentData)) {
    runtime.proc.stdout.write(
      `  npx fit-pathway agent ${discipline.id} --track=${track.id}\n`,
    );
  }
}

/**
 * List available agent combinations
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {boolean} verbose - Show verbose output
 */
export function listAgentCombinations(
  data,
  agentData,
  verbose = false,
  runtime,
) {
  if (verbose) {
    listAgentCombinationsVerbose(data, agentData, runtime);
  } else {
    listAgentCombinationsCompact(data, agentData, runtime);
  }
}
