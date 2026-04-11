/**
 * Stage CLI Command
 *
 * Handles stage summary, listing, and detail display in the terminal.
 *
 * Usage:
 *   npx fit-pathway stage              # Summary with lifecycle flow
 *   npx fit-pathway stage --list       # IDs only (for piping)
 *   npx fit-pathway stage <id>         # Detail view
 */

import { createEntityCommand } from "./command-factory.js";
import {
  prepareStageDetail,
  getStageEmoji,
} from "../formatters/stage/shared.js";
import {
  formatTable,
  formatHeader,
  formatSubheader,
  formatBullet,
  formatWarning,
} from "@forwardimpact/libcli";

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
  process.stdout.write("\n" + formatHeader("\u{1F504} Stages") + "\n\n");

  // Show lifecycle flow
  const flow = stages
    .map((s) => `${getStageEmoji(stages, s.id)} ${s.name}`)
    .join(" → ");
  process.stdout.write(formatSubheader(`Lifecycle: ${flow}`) + "\n\n");

  const rows = stages.map((s) => {
    const toolCount = s.tools?.length || 0;
    const handoffCount = s.handoffs?.length || 0;
    return [s.id, s.name, s.mode, toolCount, handoffCount];
  });

  process.stdout.write(
    formatTable(["ID", "Name", "Mode", "Tools", "Handoffs"], rows) + "\n",
  );
  process.stdout.write(
    "\n" + formatSubheader(`Total: ${stages.length} stages`) + "\n\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway stage --list' for IDs and names") + "\n",
  );
  process.stdout.write(
    formatBullet("Run 'npx fit-pathway stage <id>' for details") + "\n\n",
  );
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

  process.stdout.write("\n" + formatHeader(`${emoji} ${view.name}`) + "\n\n");
  process.stdout.write(view.description + "\n\n");

  // Read checklist
  if (view.readChecklist.length > 0) {
    process.stdout.write(formatSubheader("Read-Then-Do Checklist") + "\n\n");
    for (const item of view.readChecklist) {
      process.stdout.write(formatBullet(item, 1) + "\n");
    }
    process.stdout.write("\n");
  }

  // Confirm checklist
  if (view.confirmChecklist.length > 0) {
    process.stdout.write(formatSubheader("Do-Then-Confirm Checklist") + "\n\n");
    for (const item of view.confirmChecklist) {
      process.stdout.write(formatBullet(item, 1) + "\n");
    }
    process.stdout.write("\n");
  }

  // Constraints
  if (view.constraints.length > 0) {
    process.stdout.write(formatSubheader("Constraints") + "\n\n");
    for (const item of view.constraints) {
      process.stdout.write("  " + formatWarning(item) + "\n");
    }
    process.stdout.write("\n");
  }

  // Handoffs
  if (view.handoffs.length > 0) {
    process.stdout.write(formatSubheader("Handoffs") + "\n\n");
    for (const handoff of view.handoffs) {
      const targetStage = stages.find((s) => s.id === handoff.target);
      const targetEmoji = getStageEmoji(stages, handoff.target);
      const targetName = targetStage?.name || handoff.target;
      process.stdout.write(
        formatBullet(`${targetEmoji} ${handoff.label} → ${targetName}`, 1) +
          "\n",
      );
      if (handoff.prompt) {
        process.stdout.write(`      "${handoff.prompt}"\n`);
      }
    }
    process.stdout.write("\n");
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
