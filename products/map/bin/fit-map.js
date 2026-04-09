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
import { homedir } from "os";
import { parseArgs } from "node:util";
import { Finder } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Format validation results for display
 */
function formatValidationResults(result) {
  const lines = [];

  if (result.valid) {
    lines.push("Validation passed\n");
  } else {
    lines.push("Validation failed\n");
    lines.push("\nErrors:");
    for (const error of result.errors) {
      const path = error.path ? ` (${error.path})` : "";
      lines.push(`  - ${error.type}: ${error.message}${path}`);
    }
  }

  if (result.warnings?.length > 0) {
    lines.push("\nWarnings:");
    for (const warning of result.warnings) {
      const path = warning.path ? ` (${warning.path})` : "";
      lines.push(`  - ${warning.type}: ${warning.message}${path}`);
    }
  }

  return lines.join("\n");
}

/**
 * Validate command
 */
async function runValidate(dataDir) {
  console.log(`Validating data in: ${dataDir}\n`);

  const { createDataLoader, createSchemaValidator } =
    await import("../src/index.js");

  const loader = createDataLoader();
  const validator = createSchemaValidator();

  const data = await loader.loadAllData(dataDir);
  const result = await validator.runFullValidation(dataDir, data);

  console.log(formatValidationResults(result));

  console.log("\nData Summary:");
  console.log(`   Skills:      ${data.skills?.length || 0}`);
  console.log(`   Behaviours:  ${data.behaviours?.length || 0}`);
  console.log(`   Disciplines: ${data.disciplines?.length || 0}`);
  console.log(`   Tracks:      ${data.tracks?.length || 0}`);
  console.log(`   Levels:      ${data.levels?.length || 0}`);
  console.log(`   Drivers:     ${data.drivers?.length || 0}`);

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
  console.log(`Exporting framework to: ${outputDir}\n`);

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

  console.log("Export complete\n");
  for (const [type, count] of Object.entries(counts).sort()) {
    console.log(`   ${type.padEnd(12)} ${count}`);
  }
  console.log(`   ${"total".padEnd(12)} ${result.written.length}`);

  if (result.errors.length > 0) {
    console.log("\nErrors:");
    for (const err of result.errors) {
      console.log(`   ${err.path}: ${err.error}`);
    }
    return 1;
  }

  return 0;
}

/**
 * Generate index command
 */
async function runGenerateIndex(dataDir) {
  console.log(`Generating index files in: ${dataDir}\n`);

  const { createIndexGenerator } = await import("../src/index.js");

  const generator = createIndexGenerator();
  const results = await generator.generateAllIndexes(dataDir);

  for (const [dir, files] of Object.entries(results)) {
    if (files.error) {
      console.log(`  ${dir}/_index.yaml: ${files.error}`);
    } else {
      console.log(`  ${dir}/_index.yaml (${files.length} files)`);
    }
  }

  return 0;
}

/**
 * SHACL validation command
 */
async function runValidateShacl() {
  console.log("Validating SHACL schema syntax...\n");

  const rdfDir = join(__dirname, "../schema/rdf");

  try {
    const { default: N3 } = await import("n3");
    const { readFile, readdir } = await import("fs/promises");

    const files = await readdir(rdfDir);
    const ttlFiles = files.filter((f) => f.endsWith(".ttl")).sort();

    if (ttlFiles.length === 0) {
      console.error("No .ttl files found in schema/rdf/\n");
      return 1;
    }

    let totalQuads = 0;
    const errors = [];

    for (const file of ttlFiles) {
      const filePath = join(rdfDir, file);
      const turtleContent = await readFile(filePath, "utf-8");

      try {
        const parser = new N3.Parser({ format: "text/turtle" });
        const quads = parser.parse(turtleContent);
        totalQuads += quads.length;
        console.log(`  ${file} (${quads.length} triples)`);
      } catch (error) {
        errors.push({ file, error: error.message });
        console.log(`  ${file}: ${error.message}`);
      }
    }

    console.log();
    if (errors.length > 0) {
      console.error(`SHACL syntax errors in ${errors.length} file(s)\n`);
      return 1;
    }

    console.log(
      `SHACL syntax valid (${ttlFiles.length} files, ${totalQuads} triples)\n`,
    );
    return 0;
  } catch (error) {
    console.error(`SHACL validation error: ${error.message}\n`);
    return 1;
  }
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
fit-map - Data validation and management for Engineering Pathway

Usage:
  fit-map <command> [options]

Framework commands:
  validate              Run validation (default: JSON schema validation)
  validate --shacl      SHACL schema syntax validation
  generate-index        Generate _index.yaml files for directories
  export                Render base entities to HTML microdata

People commands:
  people validate <file>  Validate a people file against the framework (no DB)
  people push <file>      Store raw + upsert into activity.organization_people

Activity commands:
  activity start        Start the bundled local Supabase stack
  activity stop         Stop the local stack
  activity status       Report local stack health
  activity migrate      Reset + re-apply migrations (drops data)
  activity transform    Reprocess every raw document in the raw bucket
  activity verify       Smoke-test the activity database

GetDX commands:
  getdx sync            Extract + transform GetDX snapshots

Options:
  --data=PATH           Path to data directory (default: ./data or ./examples)
  --output=PATH         Output directory for export (default: <repo>/data/knowledge)
  --url=URL             Supabase URL (default: MAP_SUPABASE_URL env)
  --base-url=URL        GetDX API base URL (default: https://api.getdx.com)
  --help, -h            Show this help message

Examples:
  fit-map validate
  fit-map validate --shacl
  fit-map validate --data=./my-data
  fit-map generate-index
  fit-map export --output=./build/knowledge
  fit-map people validate ./org/people.yaml
  fit-map people push ./org/people.yaml
  fit-map activity start
  fit-map activity verify
  GETDX_API_TOKEN=xxx fit-map getdx sync
`);
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
        console.error("people validate requires a file path");
        return 1;
      }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    case "push": {
      const filePath = rest[0];
      if (!filePath) {
        console.error("people push requires a file path");
        return 1;
      }
      const supabase = await mapClient(values);
      return people.push(filePath, supabase);
    }
    case "import": {
      console.error(
        "warning: `fit-map people import` is deprecated. Use " +
          "`fit-map people validate` to validate locally or " +
          "`fit-map people push` to push to the database.",
      );
      const filePath = rest[0];
      if (!filePath) {
        console.error("people import requires a file path");
        return 1;
      }
      const dataDir = await findDataDir(values.data);
      return people.validate(filePath, dataDir);
    }
    default:
      console.error(`Unknown people subcommand: ${subcommand || "(none)"}`);
      showHelp();
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
    default:
      console.error(`Unknown activity subcommand: ${subcommand || "(none)"}`);
      showHelp();
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
      console.error(`Unknown getdx subcommand: ${subcommand || "(none)"}`);
      showHelp();
      return 1;
  }
}

/**
 * Main entry point
 */
async function main() {
  const { values, positionals } = parseArgs({
    options: {
      help: { type: "boolean", short: "h", default: false },
      json: { type: "boolean", default: false },
      shacl: { type: "boolean", default: false },
      data: { type: "string" },
      output: { type: "string" },
      url: { type: "string" },
      "base-url": { type: "string" },
    },
    allowPositionals: true,
    strict: false,
  });

  const [command, subcommand, ...rest] = positionals;

  if (values.help || !command) {
    showHelp();
    process.exit(values.help ? 0 : 1);
  }

  try {
    let exitCode = 0;

    switch (command) {
      case "validate": {
        if (values.shacl) {
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
        console.error(`Unknown command: ${command}`);
        showHelp();
        exitCode = 1;
    }

    process.exit(exitCode);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
