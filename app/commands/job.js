/**
 * Job CLI Command
 *
 * Generates and displays job definitions in the terminal.
 *
 * Usage:
 *   npx pathway job                              # Summary with stats
 *   npx pathway job --list                       # All valid combinations (for piping)
 *   npx pathway job <discipline> <track> <grade> # Detail view
 *   npx pathway job se platform L3 --checklist=code_to_review # Show checklist for handoff
 *   npx pathway job --validate                   # Validation checks
 */

import { prepareJobDetail } from "../model/job.js";
import { jobToMarkdown } from "../formatters/job/markdown.js";
import { generateAllJobs } from "../model/derivation.js";
import { formatTable } from "../lib/cli-output.js";
import {
  deriveChecklist,
  formatChecklistMarkdown,
} from "../model/checklist.js";

/**
 * Format job output
 * @param {Object} view - Presenter view
 * @param {Object} _options - Command options
 * @param {Object} entities - Original entities
 */
function formatJob(view, _options, entities) {
  console.log(jobToMarkdown(view, entities));
}

/**
 * Run job command
 * @param {Object} params
 * @param {Object} params.data - All loaded data
 * @param {string[]} params.args - Command arguments
 * @param {Object} params.options - Command options
 */
export async function runJobCommand({ data, args, options }) {
  const jobs = generateAllJobs({
    disciplines: data.disciplines,
    grades: data.grades,
    tracks: data.tracks,
    skills: data.skills,
    behaviours: data.behaviours,
    validationRules: data.framework.validationRules,
  });

  // --list: Output clean lines for piping
  if (options.list) {
    for (const job of jobs) {
      console.log(`${job.discipline.id} ${job.track.id} ${job.grade.id}`);
    }
    return;
  }

  // No args: Show summary
  if (args.length === 0) {
    console.log(`\n💼 Jobs\n`);

    // Count by discipline
    const byDiscipline = {};
    for (const job of jobs) {
      byDiscipline[job.discipline.id] =
        (byDiscipline[job.discipline.id] || 0) + 1;
    }

    const rows = Object.entries(byDiscipline).map(([id, count]) => [id, count]);
    console.log(formatTable(["Discipline", "Combinations"], rows));
    console.log(`\nTotal: ${jobs.length} valid job combinations`);
    console.log(`\nRun 'npx pathway job --list' for all combinations`);
    console.log(
      `Run 'npx pathway job <discipline> <track> <grade>' for details\n`,
    );
    return;
  }

  // Handle job detail view
  if (args.length < 3) {
    console.error("Usage: npx pathway job <discipline> <track> <grade>");
    console.error("       npx pathway job --list");
    console.error("Example: npx pathway job software_engineering platform L4");
    process.exit(1);
  }

  const discipline = data.disciplines.find((d) => d.id === args[0]);
  const track = data.tracks.find((t) => t.id === args[1]);
  const grade = data.grades.find((g) => g.id === args[2]);

  if (!discipline) {
    console.error(`Discipline not found: ${args[0]}`);
    console.error(`Available: ${data.disciplines.map((d) => d.id).join(", ")}`);
    process.exit(1);
  }

  if (!track) {
    console.error(`Track not found: ${args[1]}`);
    console.error(`Available: ${data.tracks.map((t) => t.id).join(", ")}`);
    process.exit(1);
  }

  if (!grade) {
    console.error(`Grade not found: ${args[2]}`);
    console.error(`Available: ${data.grades.map((g) => g.id).join(", ")}`);
    process.exit(1);
  }

  const view = prepareJobDetail({
    discipline,
    grade,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
    drivers: data.drivers,
    capabilities: data.capabilities,
  });

  if (!view) {
    console.error("Failed to generate job output.");
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(view, null, 2));
    return;
  }

  // --checklist: Show checklist for a specific stage
  if (options.checklist) {
    const validStages = ["plan", "code"];
    if (!validStages.includes(options.checklist)) {
      console.error(`Invalid stage: ${options.checklist}`);
      console.error(`Available: ${validStages.join(", ")}`);
      process.exit(1);
    }

    const checklist = deriveChecklist({
      stageId: options.checklist,
      skillMatrix: view.skillMatrix,
      skills: data.skills,
      capabilities: data.capabilities,
    });

    if (checklist.length === 0) {
      console.log(`\nNo checklist items for ${options.checklist} stage\n`);
      return;
    }

    const stageLabel =
      options.checklist.charAt(0).toUpperCase() + options.checklist.slice(1);
    console.log(`\n# ${view.title} — ${stageLabel} Stage Checklist\n`);
    console.log(formatChecklistMarkdown(checklist));
    console.log("");
    return;
  }

  formatJob(view, options, { discipline, grade, track });
}
