#!/usr/bin/env node

/**
 * fit-schema CLI
 *
 * Schema validation and index generation for Engineering Pathway data.
 *
 * Commands:
 *   validate [--json|--shacl]   Run validation (default: --json)
 *   generate-index [--data=PATH] Generate _index.yaml files
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
  const command = args[0];
  const options = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--data=")) {
      options.dataDir = arg.slice(7);
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      options[key] = value ?? true;
    }
  }

  return { command, options };
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
  console.log(`   Grades:      ${data.grades?.length || 0}`);
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
 * Show help
 */
function showHelp() {
  console.log(`
fit-schema - Schema validation for Engineering Pathway

Usage:
  fit-schema <command> [options]

Commands:
  validate           Run validation (default: JSON schema validation)
  generate-index     Generate _index.yaml files for directories

Options:
  --json             JSON schema + referential validation (default)
  --shacl            SHACL schema syntax validation
  --data=PATH        Path to data directory (default: ./data or ./examples)
  --help, -h         Show this help message

Examples:
  fit-schema validate
  fit-schema validate --shacl
  fit-schema validate --data=./my-data
  fit-schema generate-index
`);
}

/**
 * Main entry point
 */
async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (options.help || !command) {
    showHelp();
    process.exit(command ? 0 : 1);
  }

  try {
    let exitCode = 0;

    switch (command) {
      case "validate": {
        if (options.shacl) {
          exitCode = await runValidateShacl();
        } else {
          const dataDir = await findDataDir(options.dataDir);
          exitCode = await runValidate(dataDir);
        }
        break;
      }
      case "generate-index": {
        const dataDir = await findDataDir(options.dataDir);
        exitCode = await runGenerateIndex(dataDir);
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
