/**
 * Job CLI Command
 *
 * Generates and displays job definitions in the terminal.
 *
 * Usage:
 *   npx pathway job                                          # Summary with stats
 *   npx pathway job --list                                   # All valid combinations (for piping)
 *   npx pathway job <discipline> <level>                     # Detail view (trackless)
 *   npx pathway job <discipline> <level> --track=<track>     # Detail view (with track)
 *   npx pathway job <d> <l> [--track=<t>] --skills           # Plain list of skill IDs
 *   npx pathway job <d> <l> [--track=<t>] --tools            # Plain list of tool names
 *   npx pathway job se L3 --track=platform --checklist=code  # Show checklist for handoff
 *   npx pathway job --validate                               # Validation checks
 */

import { prepareJobDetail } from "@forwardimpact/libskill/job";
import { jobToMarkdown } from "../formatters/job/markdown.js";
import {
  generateJobTitle,
  generateAllJobs,
} from "@forwardimpact/libskill/derivation";
import { formatTable } from "../lib/cli-output.js";
import {
  deriveChecklist,
  formatChecklistMarkdown,
} from "@forwardimpact/libskill/checklist";
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
export async function runJobCommand({
  data,
  args,
  options,
  dataDir,
  templateLoader,
}) {
  const jobs = generateAllJobs({
    disciplines: data.disciplines,
    levels: data.levels,
    tracks: data.tracks,
    skills: data.skills,
    behaviours: data.behaviours,
    validationRules: data.framework.validationRules,
  });

  // Apply --track filter to list and summary modes
  const filteredJobs = options.track
    ? jobs.filter((j) => j.track && j.track.id === options.track)
    : jobs;

  if (options.track && filteredJobs.length === 0 && args.length === 0) {
    const trackExists = data.tracks.some((t) => t.id === options.track);
    if (!trackExists) {
      console.error(`Track not found: ${options.track}`);
      console.error(`Available: ${data.tracks.map((t) => t.id).join(", ")}`);
    } else {
      console.error(`No jobs found for track: ${options.track}`);
      const trackDisciplines = data.disciplines
        .filter((d) => d.validTracks && d.validTracks.includes(options.track))
        .map((d) => d.id);
      if (trackDisciplines.length > 0) {
        console.error(
          `Disciplines with this track: ${trackDisciplines.join(", ")}`,
        );
      }
    }
    process.exit(1);
  }

  // --list: Output descriptive comma-separated lines for piping and AI agent discovery
  if (options.list) {
    for (const job of filteredJobs) {
      const title = generateJobTitle(job.discipline, job.level, job.track);
      if (job.track) {
        console.log(
          `${job.discipline.id} ${job.level.id} ${job.track.id}, ${title}`,
        );
      } else {
        console.log(`${job.discipline.id} ${job.level.id}, ${title}`);
      }
    }
    return;
  }

  // No args: Show summary
  if (args.length === 0) {
    const trackLabel = options.track ? ` — ${options.track}` : "";
    console.log(`\n💼 Jobs${trackLabel}\n`);

    // Count by discipline with name, grouped by track
    const byDiscipline = {};
    for (const job of filteredJobs) {
      const key = job.discipline.id;
      if (!byDiscipline[key]) {
        byDiscipline[key] = {
          name: job.discipline.specialization || job.discipline.id,
          roleTitle: job.discipline.roleTitle || job.discipline.id,
          type: job.discipline.isProfessional ? "Professional" : "Management",
          tracks: new Set(),
          count: 0,
        };
      }
      if (job.track) byDiscipline[key].tracks.add(job.track.id);
      byDiscipline[key].count++;
    }

    const rows = Object.entries(byDiscipline).map(([id, info]) => [
      id,
      info.name,
      info.type,
      info.count,
      info.tracks.size > 0 ? [...info.tracks].join(", ") : "—",
    ]);
    console.log(
      formatTable(["ID", "Specialization", "Type", "Jobs", "Tracks"], rows),
    );
    console.log(`\nTotal: ${filteredJobs.length} valid job combinations`);
    console.log(
      `\nRun 'npx pathway job --list' for all combinations with titles`,
    );
    console.log(
      `Run 'npx pathway job <discipline> <level> [--track=<track>]' for details\n`,
    );
    return;
  }

  // Handle job detail view - requires discipline and level
  if (args.length < 2) {
    // Check if the single arg is a level or track, hinting at what's missing
    const arg = args[0];
    const isLevel = data.levels.some((g) => g.id === arg);
    const isTrack = data.tracks.some((t) => t.id === arg);
    if (isLevel) {
      console.error(
        `Missing discipline. Usage: npx pathway job <discipline> ${arg} [--track=<track>]`,
      );
      console.error(
        `Disciplines: ${data.disciplines.map((d) => d.id).join(", ")}`,
      );
    } else if (isTrack) {
      console.error(`Track must be passed as a flag: --track=${arg}`);
      console.error(
        `Usage: npx pathway job <discipline> <level> --track=${arg}`,
      );
    } else {
      console.error(
        "Usage: npx pathway job <discipline> <level> [--track=<track>]",
      );
      console.error("       npx pathway job --list");
    }
    process.exit(1);
  }

  const discipline = data.disciplines.find((d) => d.id === args[0]);
  const level = data.levels.find((g) => g.id === args[1]);
  const track = options.track
    ? data.tracks.find((t) => t.id === options.track)
    : null;

  if (!discipline) {
    // Check if args are swapped (level first, discipline second)
    const maybeLevel = data.levels.find((g) => g.id === args[0]);
    const maybeDiscipline = data.disciplines.find((d) => d.id === args[1]);
    if (maybeLevel && maybeDiscipline) {
      console.error(`Arguments are in the wrong order. Try:`);
      console.error(
        `  npx pathway job ${args[1]} ${args[0]}${options.track ? ` --track=${options.track}` : ""}`,
      );
    } else {
      console.error(`Discipline not found: ${args[0]}`);
      console.error(
        `Available: ${data.disciplines.map((d) => d.id).join(", ")}`,
      );
    }
    process.exit(1);
  }

  if (!level) {
    // Check if the second arg is a track ID passed as positional
    const isTrack = data.tracks.some((t) => t.id === args[1]);
    if (isTrack) {
      console.error(
        `Track must be passed as a flag, not a positional argument:`,
      );
      console.error(`  npx pathway job ${args[0]} <level> --track=${args[1]}`);
      console.error(`Levels: ${data.levels.map((g) => g.id).join(", ")}`);
    } else {
      console.error(`Level not found: ${args[1]}`);
      console.error(`Available: ${data.levels.map((g) => g.id).join(", ")}`);
    }
    process.exit(1);
  }

  if (options.track && !track) {
    console.error(`Track not found: ${options.track}`);
    console.error(`Available: ${data.tracks.map((t) => t.id).join(", ")}`);
    process.exit(1);
  }

  const view = prepareJobDetail({
    discipline,
    level,
    track,
    skills: data.skills,
    behaviours: data.behaviours,
    drivers: data.drivers,
    capabilities: data.capabilities,
    stages: data.stages,
  });

  if (!view) {
    const combo = track
      ? `${discipline.id} × ${level.id} × ${track.id}`
      : `${discipline.id} × ${level.id}`;
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
    // Check if it's a minLevel issue
    if (discipline.minLevel) {
      const levelIndex = data.levels.findIndex((g) => g.id === level.id);
      const minIndex = data.levels.findIndex(
        (g) => g.id === discipline.minLevel,
      );
      if (levelIndex >= 0 && minIndex >= 0 && levelIndex < minIndex) {
        console.error(
          `${discipline.id} requires minimum level: ${discipline.minLevel}`,
        );
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
    const validStages = data.stages.map((s) => s.id);
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
  const jobTemplate = templateLoader.load("job.template.md", dataDir);
  formatJob(view, options, { discipline, level, track }, jobTemplate);
}
