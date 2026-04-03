#!/usr/bin/env node

import fs from "node:fs";
import fsAsync from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
    execFileSync(
      "tar",
      ["-czf", bundlePath, "-C", sourcePath, ...directories],
      {
        stdio: "pipe",
      },
    );
  } catch (error) {
    throw new Error(`Failed to create bundle: ${error.message}`, {
      cause: error,
    });
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
 * Discover proto directories from installed @forwardimpact/* packages
 * and the project root. Scans node_modules for packages that include
 * a proto/ subdirectory, plus the project's own proto/ if present.
 * @param {string} projectRoot - Project root directory path
 * @returns {string[]} Array of absolute paths to proto directories
 */
function discoverProtoDirs(projectRoot) {
  const protoDirs = [];

  // Scan node_modules/@forwardimpact/*/proto/ for package-owned protos
  // Use fs.statSync to follow workspace symlinks (entry.isDirectory() is false for symlinks)
  const scopeDir = path.join(projectRoot, "node_modules", "@forwardimpact");
  if (fs.existsSync(scopeDir)) {
    for (const name of fs.readdirSync(scopeDir)) {
      const protoDir = path.join(scopeDir, name, "proto");
      if (fs.existsSync(protoDir) && fs.statSync(protoDir).isDirectory()) {
        protoDirs.push(fs.realpathSync(protoDir));
      }
    }
  }

  // Also check workspace-linked packages (monorepo with symlinked node_modules)
  // The loop above handles this since workspace packages appear in node_modules

  // Include the project's own proto/ directory for custom protos
  const projectProtoDir = path.join(projectRoot, "proto");
  if (fs.existsSync(projectProtoDir)) {
    protoDirs.push(projectProtoDir);
  }

  return protoDirs;
}

/**
 * Create codegen instances
 * @param {string[]} protoDirs - Array of proto directory paths
 * @param {string} projectRoot - Project root for tools/ discovery
 * @param {object} path - Path module
 * @param {object} mustache - Mustache module
 * @param {object} protoLoader - Proto loader module
 * @param {object} fs - File system module
 * @returns {object} Codegen instances
 */
function createCodegen(
  protoDirs,
  projectRoot,
  path,
  mustache,
  protoLoader,
  fs,
) {
  const base = new CodegenBase(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    fs,
  );
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
 * Run code generation pipeline
 * @param {string[]} protoDirs - Discovered proto directories
 * @param {string} projectRoot - Project root directory path
 * @param {object} finder - Finder instance for path management
 */
async function runCodegen(protoDirs, projectRoot, finder) {
  const parsedFlags = parseFlags();

  if (!parsedFlags.hasGenerationFlags()) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const generatedStorage = createStorage("generated", "local");
  const sourcePath = generatedStorage.path();

  await generatedStorage.ensureBucket();

  const codegens = createCodegen(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    fs,
  );
  await executeGeneration(codegens, sourcePath, parsedFlags);

  await finder.createPackageSymlinks(sourcePath);
  await createBundle(sourcePath);
}

/**
 * CLI entry point
 */
async function main() {
  try {
    const logger = new Logger("codegen");
    const finder = new Finder(fsAsync, logger, process);
    const projectRoot = finder.findProjectRoot(process.cwd());

    const protoDirs = discoverProtoDirs(projectRoot);
    if (protoDirs.length === 0) {
      throw new Error(
        "No proto directories found. Ensure @forwardimpact packages " +
          "with proto/ directories are installed, or add proto files " +
          "to your project's proto/ directory.",
      );
    }

    await runCodegen(protoDirs, projectRoot, finder);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`Unexpected error: ${err.message}\n`);
  process.exit(1);
});
