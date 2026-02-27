#!/usr/bin/env node

import fs from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parseArgs } from "node:util";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import { Finder } from "@forwardimpact/libutil";
import { Logger } from "@forwardimpact/libtelemetry";
import {
  CodegenBase,
  CodegenTypes,
  CodegenServices,
  CodegenDefinitions,
} from "@forwardimpact/libcodegen";
import { createStorage } from "@forwardimpact/libstorage";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create tar.gz bundle of all directories inside sourcePath
 * @param {string} sourcePath - Path containing directories to bundle
 */
async function createBundle(sourcePath) {
  const bundlePath = path.join(sourcePath, "bundle.tar.gz");

  // Get all directories in sourcePath
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (directories.length === 0) {
    return; // No directories to bundle
  }

  // Create tar.gz archive using system tar command
  try {
    const directoriesArg = directories.join(" ");
    execSync(`tar -czf "${bundlePath}" -C "${sourcePath}" ${directoriesArg}`, {
      stdio: "pipe",
    });
  } catch (error) {
    throw new Error(`Failed to create bundle: ${error.message}`);
  }
}

/**
 * Print CLI usage help
 */
function printUsage() {
  process.stdout.write(
    [
      "Usage:",
      `  npx fit-codegen --all                              # Generate all code`,
      `  npx fit-codegen --type                             # Generate protobuf types only`,
      `  npx fit-codegen --service                          # Generate service bases only`,
      `  npx fit-codegen --client                           # Generate clients only`,
      `  npx fit-codegen --definition                       # Generate service definitions only`,
    ].join("\n") + "\n",
  );
}

/**
 * Parse command line flags
 * @returns {object} Parsed flags with convenience methods
 */
function parseFlags() {
  const { values } = parseArgs({
    options: {
      all: {
        type: "boolean",
        default: false,
      },
      type: {
        type: "boolean",
        default: false,
      },
      service: {
        type: "boolean",
        default: false,
      },
      client: {
        type: "boolean",
        default: false,
      },
      definition: {
        type: "boolean",
        default: false,
      },
    },
  });

  const doAll = values.all;
  return {
    doTypes: doAll || values.type,
    doServices: doAll || values.service,
    doClients: doAll || values.client,
    doDefinitions: doAll || values.definition,
    hasGenerationFlags() {
      return (
        this.doTypes || this.doServices || this.doClients || this.doDefinitions
      );
    },
  };
}

/**
 * Create codegen instances
 * @param {string} projectRoot - Project root directory path
 * @param {object} path - Path module
 * @param {object} mustache - Mustache module
 * @param {object} protoLoader - Proto loader module
 * @param {object} fs - File system module
 * @returns {object} Codegen instances
 */
function createCodegen(projectRoot, path, mustache, protoLoader, fs) {
  const base = new CodegenBase(projectRoot, path, mustache, protoLoader, fs);
  return {
    types: new CodegenTypes(base),
    services: new CodegenServices(base),
    definitions: new CodegenDefinitions(base),
  };
}

/**
 * Execute code generation tasks
 * @param {object} codegens - Codegen instances
 * @param {string} sourcePath - Generated source path
 * @param {object} flags - Parsed flags
 * @returns {Promise<void>}
 */
async function executeGeneration(codegens, sourcePath, flags) {
  const tasks = [];

  if (flags.doTypes) {
    tasks.push(codegens.types.run(sourcePath));
  }
  if (flags.doServices) {
    tasks.push(codegens.services.runForKind("service", sourcePath));
  }
  if (flags.doClients) {
    tasks.push(codegens.services.runForKind("client", sourcePath));
  }
  if (flags.doDefinitions) {
    tasks.push(codegens.definitions.run(sourcePath));
  }

  await Promise.all(tasks);

  // Generate exports if needed
  const needsServicesExports = flags.doServices || flags.doClients;
  const needsDefinitionsExports = flags.doDefinitions;

  const exportTasks = [];
  if (needsServicesExports) {
    exportTasks.push(codegens.services.runExports(sourcePath));
  }
  if (needsDefinitionsExports) {
    exportTasks.push(codegens.definitions.runExports(sourcePath));
  }

  await Promise.all(exportTasks);
}

/**
 * Simplified main function
 * @param {string} projectRoot - Project root directory path
 * @param {object} finder - Finder instance for path management
 */
async function runCodegen(projectRoot, finder) {
  const parsedFlags = parseFlags();

  if (!parsedFlags.hasGenerationFlags()) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const generatedStorage = createStorage("generated", "local");
  const sourcePath = generatedStorage.path();

  await generatedStorage.ensureBucket();

  const codegens = createCodegen(projectRoot, path, mustache, protoLoader, fs);
  await executeGeneration(codegens, sourcePath, parsedFlags);

  await finder.createPackageSymlinks(sourcePath);
  await createBundle(sourcePath);
}

/**
 * Find the monorepo root directory (the one with workspaces)
 * @param {string} startPath - Starting directory path
 * @returns {string} Project root directory path
 */
function findMonorepoRoot(startPath) {
  let current = startPath;
  for (let depth = 0; depth < 10; depth++) {
    const packageJsonPath = path.join(current, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      // Check if this package.json has workspaces (indicates monorepo root)
      if (packageJson.workspaces) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error("Could not find monorepo root");
}

/**
 * CLI entry point
 */
async function main() {
  try {
    const logger = new Logger("codegen");
    const finder = new Finder(fsAsync, logger, process);
    const projectRoot = findMonorepoRoot(__dirname);

    await runCodegen(projectRoot, finder);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
