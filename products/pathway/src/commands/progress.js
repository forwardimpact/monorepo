/**
 * Progress CLI Command
 *
 * Shows career progression analysis in the terminal.
 *
 * Usage:
 *   bunx pathway progress <discipline> <level>                            # Progress for trackless job
 *   bunx pathway progress <discipline> <level> --track=<track>            # Progress with track
 *   bunx pathway progress <discipline> <from_level> --compare=<to_level>  # Compare levels
 */

import { createCompositeCommand } from "./command-factory.js";
import {
  prepareProgressDetail,
  getDefaultTargetLevel,
} from "../formatters/progress/shared.js";
import { progressToMarkdown } from "../formatters/progress/markdown.js";

/**
 * Format progress output
 * @param {Object} view - Presenter view
 */
function formatProgress(view) {
  console.log(progressToMarkdown(view));
}

export const runProgressCommand = createCompositeCommand({
  commandName: "progress",
  requiredArgs: ["discipline_id", "level_id"],
  findEntities: (data, args, options) => {
    const discipline = data.disciplines.find((d) => d.id === args[0]);
    const level = data.levels.find((g) => g.id === args[1]);
    const track = options.track
      ? data.tracks.find((t) => t.id === options.track)
      : null;

    let targetLevel;
    if (options.compare) {
      targetLevel = data.levels.find((g) => g.id === options.compare);
      if (!targetLevel) {
        console.error(`Target level not found: ${options.compare}`);
        process.exit(1);
      }
    } else {
      targetLevel = getDefaultTargetLevel(level, data.levels);
      if (!targetLevel) {
        console.error("No next level available for progression.");
        process.exit(1);
      }
    }

    return { discipline, level, track, targetLevel };
  },
  validateEntities: (entities, _data, options) => {
    if (!entities.discipline) {
      return `Discipline not found`;
    }
    if (!entities.level) {
      return `Level not found`;
    }
    if (options.track && !entities.track) {
      return `Track not found: ${options.track}`;
    }
    if (!entities.targetLevel) {
      return `Target level not found`;
    }
    return null;
  },
  presenter: (entities, data) =>
    prepareProgressDetail({
      fromDiscipline: entities.discipline,
      fromLevel: entities.level,
      fromTrack: entities.track,
      toDiscipline: entities.discipline,
      toLevel: entities.targetLevel,
      toTrack: entities.track,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
    }),
  formatter: formatProgress,
  usageExample:
    "bunx pathway progress software_engineering L3 --track=platform --compare=L4",
});
