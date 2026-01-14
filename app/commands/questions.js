/**
 * Questions CLI Command
 *
 * Browse and compare interview questions across skills and behaviours.
 *
 * Usage:
 *   npx pathway questions                    # Summary with stats
 *   npx pathway questions --list             # Question IDs (for piping)
 *   npx pathway questions --level=practitioner  # Filter by level
 *   npx pathway questions --stats            # Detailed statistics
 */

import {
  parseFilters,
  prepareQuestionsView,
} from "../formatters/questions/shared.js";
import { questionsToMarkdown } from "../formatters/questions/markdown.js";
import { questionsToYaml } from "../formatters/questions/yaml.js";
import { questionsToJson } from "../formatters/questions/json.js";
import { formatTable } from "../lib/cli-output.js";

/**
 * Parse questions command options
 * @param {Object} rawOptions - Raw CLI options
 * @returns {Object} Parsed options
 */
function parseOptions(rawOptions) {
  return {
    level: rawOptions.level || null,
    maturity: rawOptions.maturity || null,
    skill: rawOptions.skill || null,
    behaviour: rawOptions.behaviour || null,
    capability: rawOptions.capability || null,
    format: rawOptions.format || "table",
    stats: rawOptions.stats || false,
    json: rawOptions.json || false,
    list: rawOptions.list || false,
  };
}

/**
 * Show questions summary
 * @param {Object} data - Loaded data
 */
function showQuestionsSummary(data) {
  const { skills, behaviours } = data;
  const questions = data.questions;

  console.log(`\n❓ Questions\n`);

  // Skill questions by level
  const skillLevels = [
    "awareness",
    "foundational",
    "working",
    "practitioner",
    "expert",
  ];
  const skillRows = skillLevels.map((level) => {
    let count = 0;
    for (const skill of skills) {
      const sq = questions.skills?.[skill.id];
      if (sq?.[level]) {
        count += sq[level].length;
      }
    }
    return [level, count];
  });

  console.log("Skill Questions:");
  console.log(formatTable(["Level", "Count"], skillRows));

  // Behaviour questions by maturity
  const maturities = [
    "emerging",
    "developing",
    "practicing",
    "role_modeling",
    "exemplifying",
  ];
  const behaviourRows = maturities.map((maturity) => {
    let count = 0;
    for (const behaviour of behaviours) {
      const bq = questions.behaviours?.[behaviour.id];
      if (bq?.[maturity]) {
        count += bq[maturity].length;
      }
    }
    return [maturity.replace(/_/g, " "), count];
  });

  console.log("\nBehaviour Questions:");
  console.log(formatTable(["Maturity", "Count"], behaviourRows));

  console.log(`\nRun 'npx pathway questions --list' for question IDs`);
  console.log(`Run 'npx pathway questions --stats' for detailed stats`);
  console.log(`Run 'npx pathway questions --level=practitioner' to filter\n`);
}

/**
 * Run the questions command
 * @param {Object} params
 * @param {Object} params.data - Loaded data
 * @param {string[]} params.args - Command arguments
 * @param {Object} params.options - Parsed options
 */
export async function runQuestionsCommand({
  data,
  args: _args,
  options: rawOptions,
}) {
  const options = parseOptions(rawOptions);

  // Handle --json as alias for --format=json
  if (options.json) {
    options.format = "json";
  }

  // No filters and no format: Show summary
  const hasFilters =
    options.level ||
    options.maturity ||
    options.skill ||
    options.behaviour ||
    options.capability;

  if (!hasFilters && !options.stats && !options.list) {
    showQuestionsSummary(data);
    return;
  }

  // --list: Output question IDs for piping
  if (options.list) {
    const filter = parseFilters(options);
    const view = prepareQuestionsView({
      questionBank: data.questions,
      skills: data.skills,
      behaviours: data.behaviours,
      filter,
    });
    for (const section of view.sections) {
      for (const q of section.questions) {
        console.log(q.id);
      }
    }
    return;
  }

  // Parse filters
  const filter = parseFilters(options);

  // Prepare view
  const view = prepareQuestionsView({
    questionBank: data.questions,
    skills: data.skills,
    behaviours: data.behaviours,
    filter,
  });

  // Format output
  let output;
  switch (options.format) {
    case "yaml":
      output = questionsToYaml(view, options);
      break;
    case "json":
      output = questionsToJson(view, options);
      break;
    case "table":
    default:
      output = questionsToMarkdown(view, {
        stats: options.stats,
        skills: data.skills,
      });
      break;
  }

  console.log(output);
}
