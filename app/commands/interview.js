/**
 * Interview CLI Command
 *
 * Generates and displays interview questions in the terminal.
 */

import { createCompositeCommand } from "./command-factory.js";
import {
  prepareInterviewDetail,
  INTERVIEW_TYPES,
} from "../formatters/interview/shared.js";
import { interviewToMarkdown } from "../formatters/interview/markdown.js";

/**
 * Format interview output
 * @param {Object} view - Presenter view
 * @param {Object} options - Options including framework
 */
function formatInterview(view, options) {
  console.log(interviewToMarkdown(view, { framework: options.framework }));
}

export const runInterviewCommand = createCompositeCommand({
  commandName: "interview",
  requiredArgs: ["discipline_id", "track_id", "grade_id"],
  findEntities: (data, args, options) => {
    const interviewType = options.type || "full";

    if (!INTERVIEW_TYPES[interviewType]) {
      console.error(`Unknown interview type: ${interviewType}`);
      console.error("Available types: full, short, behaviour");
      process.exit(1);
    }

    return {
      discipline: data.disciplines.find((d) => d.id === args[0]),
      track: data.tracks.find((t) => t.id === args[1]),
      grade: data.grades.find((g) => g.id === args[2]),
      interviewType,
    };
  },
  validateEntities: (entities, _data) => {
    if (!entities.discipline) {
      return `Discipline not found: ${entities.discipline}`;
    }
    if (!entities.grade) {
      return `Grade not found: ${entities.grade}`;
    }
    if (!entities.track) {
      return `Track not found: ${entities.track}`;
    }
    return null;
  },
  presenter: (entities, data, _options) =>
    prepareInterviewDetail({
      discipline: entities.discipline,
      grade: entities.grade,
      track: entities.track,
      skills: data.skills,
      behaviours: data.behaviours,
      questions: data.questions,
      interviewType: entities.interviewType,
    }),
  formatter: (view, options, data) =>
    formatInterview(view, { ...options, framework: data.framework }),
  usageExample:
    "npx pathway interview software_engineering platform L4 --type=short",
});
