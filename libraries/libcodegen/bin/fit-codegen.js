#!/usr/bin/env node

import "@forwardimpact/libpreflight/node22";

// Bind protobufjs's `util.Long` before any other import evaluates. The
// `@grpc/proto-loader` import below pulls in protobufjs's descriptor extension,
// which calls `Root.fromJSON(...).resolveAll()` at module-evaluation time —
// resolving a 64-bit field default needs `util.Long`, which `bun --compile`
// leaves undefined (see long-init.js). This side-effect import must precede the
// proto-loader import so the binding is in place before that resolveAll runs.
import "../src/long-init.js";

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import protoLoader from "@grpc/proto-loader";
import mustache from "mustache";

import {
  createCli,
  SummaryRenderer,
  withEmbeddedAssets,
} from "@forwardimpact/libcli";
import { createDefaultRuntime } from "@forwardimpact/libutil/runtime";
import { Logger } from "@forwardimpact/libtelemetry";
import {
  CodegenBase,
  CodegenTypes,
  CodegenServices,
  CodegenDefinitions,
  CodegenMetadata,
} from "@forwardimpact/libcodegen";
import { createStorage } from "@forwardimpact/libstorage";

const definition = {
  name: "fit-codegen",
  description:
    "Generate protobuf types, service clients, and definitions from .proto files in installed @forwardimpact/* packages (node_modules/@forwardimpact/*/proto/) and an optional project-local proto/ directory.",
  globalOptions: {
    all: { type: "boolean", description: "Generate all code" },
    type: { type: "boolean", description: "Generate protobuf types only" },
    service: {
      type: "boolean",
      description: "Generate service bases only",
    },
    client: { type: "boolean", description: "Generate clients only" },
    definition: {
      type: "boolean",
      description: "Generate service definitions only",
    },
    metadata: {
      type: "boolean",
      description: "Generate field metadata only",
    },
    help: { type: "boolean", short: "h", description: "Show this help" },
    version: { type: "boolean", description: "Show version" },
    json: { type: "boolean", description: "Output help as JSON" },
  },
  examples: [
    "npx fit-codegen --all",
    "npx fit-codegen --type",
    "npx fit-codegen --service",
  ],
};

const runtime = createDefaultRuntime();
const cli = createCli(definition, {
  runtime,
  packageJsonUrl: new URL("../package.json", import.meta.url),
});

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
 * Parse command line flags using libcli
 * @returns {object} Parsed flags with convenience methods
 */
function parseFlags() {
  const parsed = cli.parse(process.argv.slice(2));
  if (!parsed) {
    process.exit(0);
  }

  const { values } = parsed;
  const doAll = values.all;
  return {
    doAll,
    doTypes: doAll || values.type,
    doServices: doAll || values.service,
    doClients: doAll || values.client,
    doDefinitions: doAll || values.definition,
    doMetadata: doAll || values.metadata,
    hasGenerationFlags() {
      return (
        this.doTypes ||
        this.doServices ||
        this.doClients ||
        this.doDefinitions ||
        this.doMetadata
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
  runtime,
) {
  const base = new CodegenBase(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    fs,
    runtime,
  );
  return {
    types: new CodegenTypes(base),
    services: new CodegenServices(base),
    definitions: new CodegenDefinitions(base),
    metadata: new CodegenMetadata(base),
  };
}

/**
 * Count files recursively in a directory
 * @param {string} dirPath - Directory to count files in
 * @returns {number} Total file count
 */
function countFiles(dirPath) {
  let count = 0;
  if (!fs.existsSync(dirPath)) return count;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dirPath, entry.name));
    } else if (!entry.name.endsWith(".tar.gz")) {
      count++;
    }
  }
  return count;
}

/**
 * Print a summary of generated code
 * @param {string} sourcePath - Path to generated directory
 * @param {object} flags - Parsed generation flags
 */
function printSummary(sourcePath, flags) {
  const totalFiles = countFiles(sourcePath);
  const relPath = path.relative(process.cwd(), sourcePath);

  const dirLabels = {
    types: "Protocol Buffer types",
    proto: "Proto source files",
    services: "Service bases and clients",
    definitions: "Service definitions",
  };

  const items = [];
  if (fs.existsSync(sourcePath)) {
    const dirs = fs
      .readdirSync(sourcePath, { withFileTypes: true })
      .filter((e) => e.isDirectory());

    for (const dir of dirs) {
      const label = dirLabels[dir.name];
      if (label) items.push({ label: `${dir.name}/`, description: label });
    }
  }

  const summary = new SummaryRenderer({ process });
  summary.render(
    {
      title: `Generated ${totalFiles} files in ./${relPath}/`,
      ok: true,
      items,
    },
    process.stdout,
  );

  const generated = [
    flags.doTypes && "types",
    flags.doServices && "services",
    flags.doClients && "clients",
    flags.doDefinitions && "definitions",
    flags.doMetadata && "metadata",
  ].filter(Boolean);
  process.stdout.write(
    `\nCode generation complete (${generated.join(", ")}).\n`,
  );
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
  if (flags.doMetadata) {
    tasks.push(codegens.metadata.run(sourcePath));
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
 * @param {object} parsedFlags - Parsed generation flags
 */
async function runCodegen(protoDirs, projectRoot, finder, parsedFlags) {
  const generatedStorage = createStorage("generated", "local");
  const sourcePath = generatedStorage.path();

  await generatedStorage.ensureBucket();

  // Full regeneration (--all) clears the content directories first so that a
  // renamed or removed proto leaves no orphaned per-proto artifacts. The
  // services exports step scans the services/ directory, so a stale service
  // dir would otherwise be re-exported and import types that no longer exist.
  // Partial flags intentionally preserve sibling artifacts and are not cleaned.
  if (parsedFlags.doAll) {
    for (const dir of ["types", "services", "definitions", "proto"]) {
      fs.rmSync(path.join(sourcePath, dir), { recursive: true, force: true });
    }
  }

  // Write package.json with "type": "module" so Node.js treats generated
  // ES module files correctly and avoids MODULE_TYPELESS_PACKAGE_JSON warnings.
  const generatedPkgPath = path.join(sourcePath, "package.json");
  if (!fs.existsSync(generatedPkgPath)) {
    fs.writeFileSync(
      generatedPkgPath,
      JSON.stringify({ type: "module" }, null, 2) + "\n",
    );
  }

  // Inject the embedded-overlay sync fs so loadTemplate's reads of the virtual
  // template mount hit the inlined registry in a compiled binary. In
  // source/npx execution withEmbeddedAssets is a no-op and this is the full
  // node:fs sync surface, identical to the bare `fs` used elsewhere in this bin.
  const codegenFs = withEmbeddedAssets(runtime).fsSync;
  const codegens = createCodegen(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    codegenFs,
    runtime,
  );
  await executeGeneration(codegens, sourcePath, parsedFlags);

  await finder.createPackageSymlinks(sourcePath);
  await createBundle(sourcePath);

  printSummary(sourcePath, parsedFlags);
}

/**
 * CLI entry point
 */
async function main() {
  try {
    // Flags must parse before project-root and proto discovery: --help and
    // --version have to exit 0 from a bare directory, and discovery throws
    // outside a proto-bearing project.
    const parsedFlags = parseFlags();
    if (!parsedFlags.hasGenerationFlags()) {
      cli.usageError(
        "no generation flags specified (use --all, --type, --service, --client, --definition, or --metadata)",
      );
      process.exit(2);
    }

    const logger = new Logger("codegen", runtime);
    // The shared runtime.finder carries a no-op logger; bind this CLI's logger
    // so createPackageSymlinks (the one logging Finder consumer) keeps emitting
    // symlink debug logs.
    const finder = runtime.finder.withLogger(logger);
    const projectRoot = finder.findProjectRoot(process.cwd());

    const protoDirs = discoverProtoDirs(projectRoot);
    if (protoDirs.length === 0) {
      throw new Error(
        "No proto directories found. Ensure @forwardimpact packages " +
          "with proto/ directories are installed, or add proto files " +
          "to your project's proto/ directory.",
      );
    }

    await runCodegen(protoDirs, projectRoot, finder, parsedFlags);
  } catch (err) {
    const logger = new Logger("codegen", runtime);
    logger.exception("main", err);
    cli.error(err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  cli.error(err.message);
  process.exit(1);
});
