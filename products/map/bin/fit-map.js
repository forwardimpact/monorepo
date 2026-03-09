#!/usr/bin/env node

/**
 * fit-map CLI
 *
 * Map validation, index generation, and activity management for Engineering Pathway data.
 *
 * Commands:
 *   validate [--json|--shacl]   Run validation (default: --json)
 *   generate-index [--data=PATH] Generate _index.yaml files
 *   people import <file>        Import people from CSV/YAML
 *   --help                      Show help
 */

import { stat } from "fs/promises";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parse CLI arguments
 */
function parseArgs(args) {
  const options = {};
  const positional = [];

  for (const arg of args) {
    if (arg.startsWith("--")) {
      if (arg === "--help") {
        options.help = true;
      } else {
        const [key, value] = arg.slice(2).split("=");
        options[key] = value ?? true;
      }
    } else if (arg === "-h") {
      options.help = true;
    } else {
      positional.push(arg);
    }
  }

  const command = positional[0] || null;
  const subcommand = positional[1] || null;
  const rest = positional.slice(2);

  return { command, subcommand, options, positional: rest };
}

/**
 * Check if a directory exists
 */
async function dirExists(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Find the data directory
 */
async function findDataDir(providedPath) {
  if (providedPath) {
    const resolved = resolve(providedPath);
    if (await dirExists(resolved)) {
      return resolved;
    }
    throw new Error(`Data directory not found: ${providedPath}`);
  }

  // Check common locations
  const candidates = [
    join(process.cwd(), "data"),
    join(process.cwd(), "examples"),
    join(__dirname, "../examples"),
  ];

  for (const candidate of candidates) {
    if (await dirExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "No data directory found. Use --data=PATH to specify location.",
  );
}

/**
 * Format validation results for display
 */
function formatValidationResults(result) {
  const lines = [];

  if (result.valid) {
    lines.push("✅ Validation passed\n");
  } else {
    lines.push("❌ Validation failed\n");
    lines.push("\nErrors:");
    for (const error of result.errors) {
      const path = error.path ? ` (${error.path})` : "";
      lines.push(`  • ${error.type}: ${error.message}${path}`);
    }
  }

  if (result.warnings?.length > 0) {
    lines.push("\nWarnings:");
    for (const warning of result.warnings) {
      const path = warning.path ? ` (${warning.path})` : "";
      lines.push(`  ⚠ ${warning.type}: ${warning.message}${path}`);
    }
  }

  return lines.join("\n");
}

/**
 * Validate command
 */
async function runValidate(dataDir) {
  console.log(`🔍 Validating data in: ${dataDir}\n`);

  const { runSchemaValidation, loadAllData } = await import("../src/index.js");

  // Load data first
  const data = await loadAllData(dataDir, { validate: false });

  // Run full validation
  const result = await runSchemaValidation(dataDir, data);

  console.log(formatValidationResults(result));

  // Print summary
  console.log("\n📊 Data Summary:");
  console.log(`   Skills:      ${data.skills?.length || 0}`);
  console.log(`   Behaviours:  ${data.behaviours?.length || 0}`);
  console.log(`   Disciplines: ${data.disciplines?.length || 0}`);
  console.log(`   Tracks:      ${data.tracks?.length || 0}`);
  console.log(`   Levels:      ${data.levels?.length || 0}`);
  console.log(`   Drivers:     ${data.drivers?.length || 0}`);

  return result.valid ? 0 : 1;
}

/**
 * Generate index command
 */
async function runGenerateIndex(dataDir) {
  console.log(`📁 Generating index files in: ${dataDir}\n`);

  const { generateAllIndexes } = await import("../src/index.js");

  const results = await generateAllIndexes(dataDir);

  for (const [dir, files] of Object.entries(results)) {
    if (files.error) {
      console.log(`❌ ${dir}/_index.yaml: ${files.error}`);
    } else {
      console.log(`✅ ${dir}/_index.yaml (${files.length} files)`);
    }
  }

  return 0;
}

/**
 * SHACL validation command
 */
async function runValidateShacl() {
  console.log("🔍 Validating SHACL schema syntax...\n");

  const rdfDir = join(__dirname, "../schema/rdf");

  try {
    const { default: N3 } = await import("n3");
    const { readFile, readdir } = await import("fs/promises");

    // Find all .ttl files in the RDF directory
    const files = await readdir(rdfDir);
    const ttlFiles = files.filter((f) => f.endsWith(".ttl")).sort();

    if (ttlFiles.length === 0) {
      console.error("❌ No .ttl files found in schema/rdf/\n");
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
        console.log(`  ✓ ${file} (${quads.length} triples)`);
      } catch (error) {
        errors.push({ file, error: error.message });
        console.log(`  ✗ ${file}: ${error.message}`);
      }
    }

    console.log();
    if (errors.length > 0) {
      console.error(`❌ SHACL syntax errors in ${errors.length} file(s)\n`);
      return 1;
    }

    console.log(
      `✅ SHACL syntax valid (${ttlFiles.length} files, ${totalQuads} triples)\n`,
    );
    return 0;
  } catch (error) {
    console.error(`❌ SHACL validation error: ${error.message}\n`);
    return 1;
  }
}

/**
 * People import command
 */
async function runPeopleImport(filePath, dataDir) {
  console.log(`👤 Importing people from: ${filePath}\n`);

  const { loadPeopleFile, validatePeople } =
    await import("../activity/transform/people.js");

  const people = await loadPeopleFile(filePath);
  console.log(`  Loaded ${people.length} people from file`);

  const { valid, errors } = await validatePeople(people, dataDir);

  if (errors.length > 0) {
    console.log(`\n❌ Validation errors:`);
    for (const err of errors) {
      console.log(`  • Row ${err.row}: ${err.message}`);
    }
  }

  console.log(`\n✅ ${valid.length} people validated`);
  if (errors.length > 0) {
    console.log(`❌ ${errors.length} rows with errors\n`);
  }

  return errors.length > 0 ? 1 : 0;
}

/**
 * Show help
 */
function showHelp() {
  console.log(`
fit-map - Data validation and management for Engineering Pathway

Usage:
  fit-map <command> [options]

Commands:
  validate              Run validation (default: JSON schema validation)
  generate-index        Generate _index.yaml files for directories
  people import <file>  Import people from CSV/YAML (validates against framework)

Options:
  --json                JSON schema + referential validation (default)
  --shacl               SHACL schema syntax validation
  --data=PATH           Path to data directory (default: ./data or ./examples)
  --help, -h            Show this help message

Examples:
  fit-map validate
  fit-map validate --shacl
  fit-map validate --data=./my-data
  fit-map generate-index
  fit-map people import ./org/people.yaml
`);
}

/**
 * Main entry point
 */
async function main() {
  const { command, subcommand, options, positional } = parseArgs(
    process.argv.slice(2),
  );

  if (options.help || !command) {
    showHelp();
    process.exit(options.help ? 0 : 1);
  }

  try {
    let exitCode = 0;

    switch (command) {
      case "validate": {
        if (options.shacl) {
          exitCode = await runValidateShacl();
        } else {
          const dataDir = await findDataDir(options.data);
          exitCode = await runValidate(dataDir);
        }
        break;
      }
      case "generate-index": {
        const dataDir = await findDataDir(options.data);
        exitCode = await runGenerateIndex(dataDir);
        break;
      }
      case "people": {
        if (subcommand === "import") {
          const filePath = positional[0];
          if (!filePath) {
            console.error("Error: people import requires a file path");
            process.exit(1);
          }
          const dataDir = await findDataDir(options.data);
          exitCode = await runPeopleImport(filePath, dataDir);
        } else {
          console.error(`Unknown people subcommand: ${subcommand || "(none)"}`);
          showHelp();
          exitCode = 1;
        }
        break;
      }
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
