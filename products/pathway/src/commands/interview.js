/**
 * Interview CLI Command
 *
 * Generates and displays interview questions in the terminal.
 *
 * Usage:
 *   npx fit-pathway interview <discipline> <level>                                  # All interview types
 *   npx fit-pathway interview <discipline> <level> --track=<track>                  # With track
 *   npx fit-pathway interview <discipline> <level> --track=<track> --type=mission   # Single type
 */

import { createCompositeCommand } from "./command-factory.js";
import {
  prepareInterviewDetail,
  INTERVIEW_TYPES,
} from "../formatters/interview/shared.js";
import { interviewToMarkdown } from "../formatters/interview/markdown.js";
import { formatError, horizontalRule } from "@forwardimpact/libcli";

const VALID_TYPES = Object.keys(INTERVIEW_TYPES);

/**
 * Format a single interview type as markdown
 * @param {Object} view - Presenter view
 * @param {Object} options - Options including standard
 */
function formatInterview(view, options, runtime) {
  runtime.proc.stdout.write(
    interviewToMarkdown(view, { standard: options.standard }) + "\n",
  );
}

/**
 * Format all interview types as markdown with separators
 * @param {Array<Object>} views - Array of presenter views
 * @param {Object} options - Options including standard
 */
function formatAllInterviews(views, options, runtime) {
  for (let i = 0; i < views.length; i++) {
    if (i > 0) {
      runtime.proc.stdout.write("\n" + horizontalRule(80) + "\n\n");
    }
    runtime.proc.stdout.write(
      interviewToMarkdown(views[i], { standard: options.standard }) + "\n",
    );
  }
}

export const runInterviewCommand = createCompositeCommand({
  commandName: "interview",
  requiredArgs: ["discipline_id", "level_id"],
  findEntities: (data, args, options, runtime) => {
    const interviewType = options.type === "full" ? null : options.type;

    if (interviewType && !INTERVIEW_TYPES[interviewType]) {
      runtime.proc.stderr.write(
        formatError(`Unknown interview type: ${interviewType}`) + "\n",
      );
      runtime.proc.stderr.write(`Available types: ${VALID_TYPES.join(", ")}\n`);
      runtime.proc.exit(1);
    }

    return {
      discipline: data.disciplines.find((d) => d.id === args[0]),
      level: data.levels.find((g) => g.id === args[1]),
      track: options.track
        ? data.tracks.find((t) => t.id === options.track)
        : null,
      interviewType,
    };
  },
  validateEntities: (entities, _data, options) => {
    if (!entities.discipline) {
      return `Discipline not found: ${entities.discipline}`;
    }
    if (!entities.level) {
      return `Level not found: ${entities.level}`;
    }
    if (options.track && !entities.track) {
      return `Track not found: ${options.track}`;
    }
    return null;
  },
  presenter: (entities, data, _options) => {
    const params = {
      discipline: entities.discipline,
      level: entities.level,
      track: entities.track,
      skills: data.skills,
      behaviours: data.behaviours,
      questions: data.questions,
    };

    // Single type: return one view
    if (entities.interviewType) {
      return prepareInterviewDetail({
        ...params,
        interviewType: entities.interviewType,
      });
    }

    // All types: return array of views
    return VALID_TYPES.map((type) =>
      prepareInterviewDetail({ ...params, interviewType: type }),
    ).filter(Boolean);
  },
  formatter: (view, options, data, runtime) => {
    const opts = { ...options, standard: data.standard };

    if (Array.isArray(view)) {
      formatAllInterviews(view, opts, runtime);
    } else {
      formatInterview(view, opts, runtime);
    }
  },
  usageExample:
    "npx fit-pathway interview software_engineering J090 --track=platform --type=mission",
});
