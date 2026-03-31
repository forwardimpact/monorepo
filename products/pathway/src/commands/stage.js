/**
 * Stage CLI Command
 *
 * Handles stage summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   bunx pathway stage              # Summary with lifecycle flow
 *   bunx pathway stage --list       # IDs only (for piping)
 *   bunx pathway stage <id>         # Detail view
 */

import { createEntityCommand } from "./command-factory.js";
import {
  prepareStageDetail,
  getStageEmoji,
} from "../formatters/stage/shared.js";
import { formatTable } from "../lib/cli-output.js";
import {
  formatHeader,
  formatSubheader,
  formatBullet,
} from "../lib/cli-output.js";

/**
 * Format stage list item for --list output
 * @param {Object} stage - Stage entity
 * @returns {string} Formatted list line
 */
function formatListItem(stage) {
  return `${stage.id}, ${stage.name}`;
}

/**
 * Format stage summary output
 * @param {Array} stages - Raw stage entities
 * @param {Object} _data - Full data context (unused)
 */
function formatSummary(stages, _data) {
  console.log("\n🔄 Stages\n");

  // Show lifecycle flow
  const flow = stages
    .map((s) => `${getStageEmoji(stages, s.id)} ${s.name}`)
    .join(" → ");
  console.log(`Lifecycle: ${flow}\n`);

  const rows = stages.map((s) => {
    const toolCount = s.tools?.length || 0;
    const handoffCount = s.handoffs?.length || 0;
    return [s.id, s.name, s.mode, toolCount, handoffCount];
  });

  console.log(formatTable(["ID", "Name", "Mode", "Tools", "Handoffs"], rows));
  console.log(`\nTotal: ${stages.length} stages`);
  console.log(`\nRun 'bunx pathway stage --list' for IDs and names`);
  console.log(`Run 'bunx pathway stage <id>' for details\n`);
}

/**
 * Format stage detail output
 * @param {Object} viewAndContext - Contains stage entity and context
 * @param {Object} _framework - Framework config (unused)
 */
function formatDetail(viewAndContext, _framework) {
  const { stage, stages } = viewAndContext;
  const view = prepareStageDetail(stage);
  const emoji = getStageEmoji(stages, stage.id);

  console.log(formatHeader(`\n${emoji} ${view.name}\n`));
  console.log(`${view.description}\n`);

  // Read checklist
  if (view.readChecklist.length > 0) {
    console.log(formatSubheader("Read-Then-Do Checklist\n"));
    for (const item of view.readChecklist) {
      console.log(formatBullet(item, 1));
    }
    console.log();
  }

  // Confirm checklist
  if (view.confirmChecklist.length > 0) {
    console.log(formatSubheader("Do-Then-Confirm Checklist\n"));
    for (const item of view.confirmChecklist) {
      console.log(formatBullet(item, 1));
    }
    console.log();
  }

  // Constraints
  if (view.constraints.length > 0) {
    console.log(formatSubheader("Constraints\n"));
    for (const item of view.constraints) {
      console.log(formatBullet(`⚠️  ${item}`, 1));
    }
    console.log();
  }

  // Handoffs
  if (view.handoffs.length > 0) {
    console.log(formatSubheader("Handoffs\n"));
    for (const handoff of view.handoffs) {
      const targetStage = stages.find((s) => s.id === handoff.target);
      const targetEmoji = getStageEmoji(stages, handoff.target);
      const targetName = targetStage?.name || handoff.target;
      console.log(
        formatBullet(`${targetEmoji} ${handoff.label} → ${targetName}`, 1),
      );
      if (handoff.prompt) {
        console.log(`      "${handoff.prompt}"`);
      }
    }
    console.log();
  }
}

export const runStageCommand = createEntityCommand({
  entityName: "stage",
  pluralName: "stages",
  findEntity: (data, id) => data.stages?.find((s) => s.id === id),
  presentDetail: (entity, data) => ({
    stage: entity,
    stages: data.stages || [],
  }),
  formatSummary,
  formatDetail,
  formatListItem,
  emojiIcon: "🔄",
});
