/**
 * Job CLI Command
 *
 * Generates and displays job definitions in the terminal.
 *
 * Usage:
 *   npx pathway job                                          # Summary with stats
 *   npx pathway job --list                                   # All valid combinations (for piping)
 *   npx pathway job <discipline> <grade>                     # Detail view (trackless)
 *   npx pathway job <discipline> <grade> --track=<track>     # Detail view (with track)
 *   npx pathway job <d> <g> [--track=<t>] --skills           # Plain list of skill IDs
 *   npx pathway job <d> <g> [--track=<t>] --tools            # Plain list of tool names
 *   npx pathway job se L3 --track=platform --checklist=code  # Show checklist for handoff
 *   npx pathway job --validate                               # Validation checks
 */

import { prepareJobDetail } from "@forwardimpact/libpathway/job";
import { jobToMarkdown } from "../formatters/job/markdown.js";
import { generateAllJobs } from "@forwardimpact/libpathway/derivation";
import { formatTable } from "../lib/cli-output.js";
import {
  deriveChecklist,
  formatChecklistMarkdown,
} from "@forwardimpact/libpathway/checklist";
import { loadJobTemplate } from "../lib/template-loader.js";
import { toolkitToPlainList } from "../formatters/toolkit/markdown.js";

/**
 * Format job output
 * @param {Object} view - Presenter view
 * @param {Object} _options - Command options
 * @param {Object} entities - Original entities
 * @param {string} jobTemplate - Mustache template for job description
 */
function formatJob(view, _options, entities, jobTemplate) {
  console.log(jobToMarkdown(view, entities, jobTemplate));
}

/**
 * Run job command
 * @param {Object} params
 * @param {Object} params.data - All loaded data
 * @param {string[]} params.args - Command arguments
 * @param {Object} params.options - Command options
 * @param {string} params.dataDir - Path to data directory
 */
export async function runJobCommand({ data, args, options, dataDir }) {
  const jobs = generateAllJobs({
    disciplines: data.disciplines,
    grades: data.grades,
    tracks: data.tracks,
    skills: data.skills,
    behaviours: data.behaviours,
    validationRules: data.framework.validationRules,
  });

  // --list: Output clean lines for piping (discipline grade track format)
  if (options.list) {
    for (const job of jobs) {
      if (job.track) {
        console.log(`${job.discipline.id} ${job.grade.id} ${job.track.id}`);
      } else {
        console.log(`${job.discipline.id} ${job.grade.id}`);
      }
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
      `Run 'npx pathway job <discipline> <grade> [--track=<track>]' for details\n`,
    );
    return;
  }

  // Handle job detail view - requires discipline and grade
  if (args.length < 2) {
    console.error(
      "Usage: npx pathway job <discipline> <grade> [--track=<track>]",
    );
    console.error("       npx pathway job --list");
    console.error("Example: npx pathway job software_engineering L4");
    console.error(
      "Example: npx pathway job software_engineering L4 --track=platform",
    );
    process.exit(1);
  }

  const discipline = data.disciplines.find((d) => d.id === args[0]);
  const grade = data.grades.find((g) => g.id === args[1]);
  const track = options.track
    ? data.tracks.find((t) => t.id === options.track)
    : null;

  if (!discipline) {
    console.error(`Discipline not found: ${args[0]}`);
    console.error(`Available: ${data.disciplines.map((d) => d.id).join(", ")}`);
    process.exit(1);
  }

  if (!grade) {
    console.error(`Grade not found: ${args[1]}`);
    console.error(`Available: ${data.grades.map((g) => g.id).join(", ")}`);
    process.exit(1);
  }

  if (options.track && !track) {
    console.error(`Track not found: ${options.track}`);
    console.error(`Available: ${data.tracks.map((t) => t.id).join(", ")}`);
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
    stages: data.stages,
  });

  if (!view) {
    const combo = track
      ? `${discipline.id} × ${grade.id} × ${track.id}`
      : `${discipline.id} × ${grade.id}`;
    console.error(`Invalid combination: ${combo}`);
    if (track) {
      const validTracks =
        discipline.validTracks?.filter((t) => t !== null) || [];
      if (validTracks.length > 0) {
        console.error(
          `Valid tracks for ${discipline.id}: ${validTracks.join(", ")}`,
        );
      } else {
        console.error(`${discipline.id} does not support tracks`);
      }
    }
    process.exit(1);
  }

  // --skills: Output plain list of skill IDs (for piping)
  if (options.skills) {
    for (const skill of view.skillMatrix) {
      console.log(skill.skillId);
    }
    return;
  }

  // --tools: Output plain list of tool names (for piping)
  if (options.tools) {
    console.log(toolkitToPlainList(view.toolkit));
    return;
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

    const { readChecklist, confirmChecklist } = deriveChecklist({
      stageId: options.checklist,
      skillMatrix: view.skillMatrix,
      skills: data.skills,
      capabilities: data.capabilities,
    });

    if (readChecklist.length === 0 && confirmChecklist.length === 0) {
      console.log(`\nNo checklist items for ${options.checklist} stage\n`);
      return;
    }

    const stageLabel =
      options.checklist.charAt(0).toUpperCase() + options.checklist.slice(1);
    console.log(`\n# ${view.title} — ${stageLabel} Stage Checklist\n`);
    if (readChecklist.length > 0) {
      console.log("## Read-Then-Do\n");
      console.log(formatChecklistMarkdown(readChecklist));
      console.log("");
    }
    if (confirmChecklist.length > 0) {
      console.log("## Do-Then-Confirm\n");
      console.log(formatChecklistMarkdown(confirmChecklist));
      console.log("");
    }
    return;
  }

  // Load job template for description formatting
  const jobTemplate = await loadJobTemplate(dataDir);
  formatJob(view, options, { discipline, grade, track }, jobTemplate);
}
