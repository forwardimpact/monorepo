#!/usr/bin/env node

/**
 * fit-map CLI
 *
 * Map validation, index generation, export, and activity management
 * for Engineering Pathway data.
 */

import fs from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { homedir } from "os";
import { Finder } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";
import {
  createCli,
  SummaryRenderer,
  formatHeader,
  formatSubheader,
  formatSuccess,
  formatError,
  formatWarning,
  formatBullet,
} from "@forwardimpact/libcli";

const summary = new SummaryRenderer({ process });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
).version;

const definition = {
  name: "fit-map",
  version: VERSION,
  description: "Data validation and management for Engineering Pathway",
  commands: [
    {
      name: "init",
      description: "Create ./data/pathway/ with starter framework data",
    },
    {
      name: "validate",
      description: "Run validation (default: JSON schema)",
    },
    {
      name: "generate-index",
      description: "Generate _index.yaml files",
    },
    {
      name: "export",
      description: "Render base entities to HTML microdata",
    },
    {
      name: "people",
      args: "<validate|push> <file>",
      description: "Validate or push people files",
    },
    {
      name: "activity",
      args: "<start|stop|status|migrate|transform|verify|seed>",
      description: "Manage activity stack",
    },
    {
      name: "getdx",
      args: "sync",
      description: "Extract + transform GetDX snapshots",
    },
  ],
  options: {
    data: { type: "string", description: "Path to data directory" },
    output: { type: "string", description: "Output directory for export" },
    url: { type: "string", description: "Supabase URL" },
    "base-url": { type: "string", description: "GetDX API base URL" },
    json: { type: "boolean", description: "Output as JSON" },
    shacl: { type: "boolean", description: "SHACL schema validation" },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
  },
  examples: [
    "fit-map init",
    "fit-map validate",
    "fit-map validate --shacl",
    "fit-map people validate ./org/people.yaml",
    "fit-map activity start",
  ],
};

const cli = createCli(definition);

/**
 * Find the data directory
 * @param {string|undefined} providedPath - Explicit path from --data flag
 * @returns {Promise<string>} Resolved data directory path
 */
async function findDataDir(providedPath) {
  if (providedPath) {
    const resolved = resolve(providedPath);
    try {
      await fs.access(resolved);
    } catch {
      throw new Error(`Data directory not found: ${providedPath}`);
    }
    return resolved;
  }

  const logger = createLogger("map");
  const finder = new Finder(fs, logger, process);
  try {
    return join(finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "No data directory found. Use --data=<path> to specify location.",
    );
  }
}

/**
 * Format validation results for display using libcli helpers.
 * @param {{valid: boolean, errors: Array, warnings?: Array}} result
 * @returns {string}
 */
function formatValidationResults(result) {
  const lines = [];

  if (result.valid) {
    lines.push(formatSuccess("Validation passed"));
  } else {
    lines.push(formatError("Validation failed"));
    lines.push("");
    lines.push(formatSubheader("Errors"));
    for (const error of result.errors) {
      const path = error.path ? ` (${error.path})` : "";
      lines.push(formatBullet(`${error.type}: ${error.message}${path}`, 0));
    }
  }

  if (result.warnings?.length > 0) {
    lines.push("");
    lines.push(formatSubheader("Warnings"));
    for (const warning of result.warnings) {
      const path = warning.path ? ` (${warning.path})` : "";
      lines.push(formatBullet(`${warning.type}: ${warning.message}${path}`, 0));
    }
  }

  return lines.join("\n");
}

/**
 * Validate command
 */
async function runValidate(dataDir) {
  process.stdout.write(formatHeader(`Validating data in: ${dataDir}`) + "\n\n");

  const { createDataLoader, createSchemaValidator } =
    await import("../src/index.js");

  const loader = createDataLoader();
  const validator = createSchemaValidator();

  const data = await loader.loadAllData(dataDir);
  const result = await validator.runFullValidation(dataDir, data);

  process.stdout.write(formatValidationResults(result) + "\n\n");

  summary.render({
    title: formatHeader("Data Summary"),
    items: [
      { label: "Skills", description: String(data.skills?.length || 0) },
      {
        label: "Behaviours",
        description: String(data.behaviours?.length || 0),
      },
      {
        label: "Disciplines",
        description: String(data.disciplines?.length || 0),
      },
      { label: "Tracks", description: String(data.tracks?.length || 0) },
      { label: "Levels", description: String(data.levels?.length || 0) },
      { label: "Drivers", description: String(data.drivers?.length || 0) },
    ],
  });

  return result.valid ? 0 : 1;
}

/**
 * Resolve the output directory for `fit-map export`.
 * @param {string|undefined} providedPath
 * @returns {Promise<string>}
 */
async function findOutputDir(providedPath) {
  if (providedPath) return resolve(providedPath);
  const logger = createLogger("map");
  const finder = new Finder(fs, logger, process);
  const dataRoot = finder.findData("data", homedir());
  return join(dataRoot, "knowledge");
}

/**
 * Export command — render every base entity to HTML microdata.
 */
async function runExport(dataDir, outputDir) {
  process.stdout.write(
    formatHeader(`Exporting framework to: ${outputDir}`) + "\n\n",
  );

  const { createDataLoader, createExporter, createRenderer } =
    await import("../src/index.js");

  const loader = createDataLoader();
  const data = await loader.loadAllData(dataDir);

  const exporter = await createExporter({ renderer: createRenderer() });
  const result = await exporter.exportAll({ data, outputDir });

  const counts = {};
  for (const path of result.written) {
    const segments = path.split("/");
    const type = segments[segments.length - 2];
    counts[type] = (counts[type] || 0) + 1;
  }

  process.stdout.write(formatSuccess("Export complete") + "\n\n");
  summary.render({
    title: formatSubheader("By type"),
    items: [
      ...Object.entries(counts)
        .sort()
        .map(([type, count]) => ({
          label: type,
          description: String(count),
        })),
      { label: "total", description: String(result.written.length) },
    ],
  });

  if (result.errors.length > 0) {
    process.stderr.write("\n" + formatError("Errors:") + "\n");
    for (const err of result.errors) {
      process.stderr.write(formatBullet(`${err.path}: ${err.error}`, 1) + "\n");
    }
    return 1;
  }

  return 0;
}

/**
 * Generate index command
 */
async function runGenerateIndex(dataDir) {
  process.stdout.write(
    formatHeader(`Generating index files in: ${dataDir}`) + "\n\n",
  );

  const { createIndexGenerator } = await import("../src/index.js");

  const generator = createIndexGenerator();
  const results = await generator.generateAllIndexes(dataDir);

  for (const [dir, files] of Object.entries(results)) {
    if (files.error) {
      process.stdout.write(
        formatBullet(`${dir}/_index.yaml: ${files.error}`, 0) + "\n",
      );
    } else {
      process.stdout.write(
        formatBullet(`${dir}/_index.yaml (${files.length} files)`, 0) + "\n",
      );
    }
  }

  return 0;
}

// ── Dispatchers ──────────────────────────────────────────────────────────────

async function mapClient(values) {
  const { createMapClient } = await import("./lib/client.js");
  return createMapClient({ url: values.url });
}

async function dispatchPeople(subcommand, rest, values) {
  const people = await import("./lib/commands/people.js");
  switch (subcommand) {
    case "validate": {
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people validate requires a file path");
        return 1;
      }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    case "push": {
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people push requires a file path");
        return 1;
      }
      const supabase = await mapClient(values);
      return people.push(filePath, supabase);
    }
    case "import": {
      process.stderr.write(
        formatWarning(
          "`fit-map people import` is deprecated. Use " +
            "`fit-map people validate` to validate locally or " +
            "`fit-map people push` to push to the database.",
        ) + "\n",
      );
      const filePath = rest[0];
      if (!filePath) {
        cli.error("people import requires a file path");
        return 1;
      }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    default:
      cli.usageError(`unknown people subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchActivity(subcommand, rest, values) {
  const activity = await import("./lib/commands/activity.js");
  switch (subcommand) {
    case "start":
      return activity.start();
    case "stop":
      return activity.stop();
    case "status":
      return activity.status();
    case "migrate":
      return activity.migrate();
    case "transform":
      return activity.transform(rest[0] ?? "all", await mapClient(values));
    case "verify":
      return activity.verify(await mapClient(values));
    case "seed": {
      const dataDir = await findDataDir(values.data);
      // findDataDir returns .../pathway; seed needs the parent data/ dir
      const data = dirname(dataDir);
      return activity.seed({ data, supabase: await mapClient(values) });
    }
    default:
      cli.usageError(`unknown activity subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

async function dispatchGetdx(subcommand, rest, values) {
  const getdx = await import("./lib/commands/getdx.js");
  switch (subcommand) {
    case "sync":
      return getdx.sync(await mapClient(values), {
        baseUrl: values["base-url"],
      });
    default:
      cli.usageError(`unknown getdx subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}

/**
 * Main entry point
 */
async function main() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) process.exit(0);

  const { values, positionals } = parsed;
  const [command, subcommand, ...rest] = positionals;

  if (!command) {
    cli.showHelp();
    process.exit(0);
  }

  try {
    let exitCode = 0;

    switch (command) {
      case "init": {
        const { runInit } = await import("./lib/commands/init.js");
        await runInit(positionals[1]);
        exitCode = 0;
        break;
      }
      case "validate": {
        if (values.shacl) {
          const { runValidateShacl } =
            await import("./lib/commands/validate-shacl.js");
          exitCode = await runValidateShacl();
        } else {
          const dataDir = await findDataDir(values.data);
          exitCode = await runValidate(dataDir);
        }
        break;
      }
      case "generate-index": {
        const dataDir = await findDataDir(values.data);
        exitCode = await runGenerateIndex(dataDir);
        break;
      }
      case "export": {
        const dataDir = await findDataDir(values.data);
        const outputDir = await findOutputDir(values.output);
        exitCode = await runExport(dataDir, outputDir);
        break;
      }
      case "people":
        exitCode = await dispatchPeople(subcommand, rest, values);
        break;
      case "activity":
        exitCode = await dispatchActivity(subcommand, rest, values);
        break;
      case "getdx":
        exitCode = await dispatchGetdx(subcommand, rest, values);
        break;
      default:
        cli.usageError(`unknown command "${command}"`);
        exitCode = 2;
    }

    process.exit(exitCode);
  } catch (error) {
    cli.error(error.message);
    process.exit(1);
  }
}

main();
