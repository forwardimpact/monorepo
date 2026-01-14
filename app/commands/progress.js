/**
 * Progress CLI Command
 *
 * Shows career progression analysis in the terminal.
 */

import { createCompositeCommand } from "./command-factory.js";
import {
  prepareProgressDetail,
  getDefaultTargetGrade,
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
  requiredArgs: ["discipline_id", "track_id", "grade_id"],
  findEntities: (data, args, options) => {
    const discipline = data.disciplines.find((d) => d.id === args[0]);
    const track = data.tracks.find((t) => t.id === args[1]);
    const grade = data.grades.find((g) => g.id === args[2]);

    let targetGrade;
    if (options.compare) {
      targetGrade = data.grades.find((g) => g.id === options.compare);
      if (!targetGrade) {
        console.error(`Target grade not found: ${options.compare}`);
        process.exit(1);
      }
    } else {
      targetGrade = getDefaultTargetGrade(grade, data.grades);
      if (!targetGrade) {
        console.error("No next grade available for progression.");
        process.exit(1);
      }
    }

    return { discipline, grade, track, targetGrade };
  },
  validateEntities: (entities, _data) => {
    if (!entities.discipline) {
      return `Discipline not found`;
    }
    if (!entities.grade) {
      return `Grade not found`;
    }
    if (!entities.track) {
      return `Track not found`;
    }
    if (!entities.targetGrade) {
      return `Target grade not found`;
    }
    return null;
  },
  presenter: (entities, data) =>
    prepareProgressDetail({
      fromDiscipline: entities.discipline,
      fromGrade: entities.grade,
      fromTrack: entities.track,
      toDiscipline: entities.discipline,
      toGrade: entities.targetGrade,
      toTrack: entities.track,
      skills: data.skills,
      behaviours: data.behaviours,
      capabilities: data.capabilities,
    }),
  formatter: formatProgress,
  usageExample:
    "npx pathway progress software_engineering platform L3 --compare=L4",
});
