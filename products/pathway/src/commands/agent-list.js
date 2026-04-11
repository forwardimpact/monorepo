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

const summary = new SummaryRenderer({ process });

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
export function showAgentSummary(data, agentData, skillsWithAgent) {
  const validCombinations = findValidCombinations(data, agentData).length;
  const skillsWithAgentCount = skillsWithAgent.filter((s) => s.agent).length;

  process.stdout.write("\n" + formatHeader("\u{1F916} Agent") + "\n\n");
  summary.render({
    title: formatSubheader("Coverage"),
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
      {
        label: "Stages",
        description: `${data.stages.length} available`,
      },
    ],
  });
  process.stdout.write(
    "\n" + formatSubheader(`Valid combinations: ${validCombinations}`) + "\n\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway agent --list' for all combinations") +
      "\n",
  );
  process.stdout.write(
    formatBullet(
      "Run 'npx fit-pathway agent <discipline> <track>' to generate files",
    ) + "\n\n",
  );
}

/**
 * List available agent combinations — compact output for piping
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 */
function listAgentCombinationsCompact(data, agentData) {
  for (const {
    discipline,
    track,
    humanDiscipline,
    humanTrack,
  } of findValidCombinations(data, agentData)) {
    const abbrev = getDisciplineAbbreviation(discipline.id);
    const agentName = `${abbrev}-${toKebabCase(track.id)}`;
    const specName = humanDiscipline.specialization || humanDiscipline.id;
    // Piped output — keep as plain console.log for stable format
    console.log(
      `${agentName} ${discipline.id} ${track.id}, ${specName} (${humanTrack.name})`,
    );
  }
}

/**
 * List available agent combinations — verbose output (markdown)
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 */
function listAgentCombinationsVerbose(data, agentData) {
  // Markdown headings stay literal so downstream tools can parse them.
  process.stdout.write("# 🤖 Available Agent Combinations\n\n");

  const agentDisciplineIds = new Set(agentData.disciplines.map((d) => d.id));
  const agentTrackIds = new Set(agentData.tracks.map((t) => t.id));

  process.stdout.write("## Disciplines with agent definitions:\n\n");
  for (const discipline of data.disciplines) {
    const status = agentDisciplineIds.has(discipline.id) ? "✅" : "⬜";
    process.stdout.write(
      `  ${status} ${discipline.id} - ${discipline.specialization || discipline.name}\n`,
    );
  }

  process.stdout.write("\n## Tracks with agent definitions:\n\n");
  for (const track of data.tracks) {
    const status = agentTrackIds.has(track.id) ? "✅" : "⬜";
    process.stdout.write(`  ${status} ${track.id} - ${track.name}\n`);
  }

  process.stdout.write("\n## Valid combinations:\n\n");
  for (const { discipline, track } of findValidCombinations(data, agentData)) {
    process.stdout.write(
      `  npx fit-pathway agent ${discipline.id} ${track.id}\n`,
    );
  }

  process.stdout.write("\n## Available stages:\n\n");
  for (const stage of data.stages) {
    process.stdout.write(
      `  --stage=${stage.id}: ${stage.description.split(" - ")[0]}\n`,
    );
  }
}

/**
 * List available agent combinations
 * @param {Object} data - Pathway data
 * @param {Object} agentData - Agent-specific data
 * @param {boolean} verbose - Show verbose output
 */
export function listAgentCombinations(data, agentData, verbose = false) {
  if (verbose) {
    listAgentCombinationsVerbose(data, agentData);
  } else {
    listAgentCombinationsCompact(data, agentData);
  }
}
