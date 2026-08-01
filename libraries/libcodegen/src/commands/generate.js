import path from "node:path";
import { createRequire } from "node:module";

import { SummaryRenderer, withEmbeddedAssets } from "@forwardimpact/libcli";
import { Logger } from "@forwardimpact/libtelemetry";
import { createStorage } from "@forwardimpact/libstorage";

import {
  CodegenBase,
  CodegenTypes,
  CodegenServices,
  CodegenDefinitions,
  CodegenMetadata,
} from "../index.js";

/**
 * Whether an error is a missing-module error. That error signals that this
 * install omitted the optional proto-compiler toolchain.
 * @param {NodeJS.ErrnoException} err
 * @returns {boolean}
 */
function isMissingModule(err) {
  return (
    err?.code === "ERR_MODULE_NOT_FOUND" ||
    err?.code === "MODULE_NOT_FOUND" ||
    err?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
  );
}

/**
 * Derive the generation flags from the parsed option values. `--all` implies
 * every kind. The individual flags select one kind each.
 * @param {Record<string, boolean|undefined>} values
 * @returns {object}
 */
function computeFlags(values) {
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
 * Create a tar.gz bundle of all the directories inside sourcePath
 * @param {string} sourcePath - Path that holds the directories to bundle
 * @param {object} fs - Sync filesystem surface (runtime.fsSync)
 * @param {object} subprocess - Subprocess surface (runtime.subprocess)
 */
function createBundle(sourcePath, fs, subprocess) {
  const bundlePath = path.join(sourcePath, "bundle.tar.gz");

  // Get all directories in sourcePath
  const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (directories.length === 0) {
    return; // No directories to bundle
  }

  // Create the tar.gz archive with the system tar command
  const result = subprocess.runSync(
    "tar",
    ["-czf", bundlePath, "-C", sourcePath, ...directories],
    { stdio: "pipe" },
  );
  if (result.exitCode !== 0) {
    throw new Error(`Failed to create bundle: ${result.stderr}`);
  }
}

/**
 * Discover proto directories from installed @forwardimpact/* packages
 * and the project root. Scans node_modules for packages that include
 * a proto/ subdirectory, plus the project's own proto/ if present.
 * @param {string} projectRoot - Project root directory path
 * @param {object} fs - Sync filesystem surface (runtime.fsSync)
 * @returns {string[]} Array of absolute paths to proto directories
 */
function discoverProtoDirs(projectRoot, fs) {
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
 * @param {object} mustache - Mustache module
 * @param {object} protoLoader - Proto loader module
 * @param {object} codegenFs - File system module
 * @param {object} runtime - Injected runtime
 * @returns {object} Codegen instances
 */
function createCodegen(
  protoDirs,
  projectRoot,
  mustache,
  protoLoader,
  codegenFs,
  runtime,
) {
  const base = new CodegenBase(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    codegenFs,
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
 * @param {object} fs - Sync filesystem surface (runtime.fsSync)
 * @returns {number} Total file count
 */
function countFiles(dirPath, fs) {
  let count = 0;
  if (!fs.existsSync(dirPath)) return count;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dirPath, entry.name), fs);
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
 * @param {object} fs - Sync filesystem surface (runtime.fsSync)
 * @param {object} proc - Process surface (runtime.proc)
 */
function printSummary(sourcePath, flags, fs, proc) {
  const totalFiles = countFiles(sourcePath, fs);
  const relPath = path.relative(proc.cwd(), sourcePath);

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

  const summary = new SummaryRenderer({ process: proc });
  summary.render(
    {
      title: `Generated ${totalFiles} files in ./${relPath}/`,
      ok: true,
      items,
    },
    proc.stdout,
  );

  const generated = [
    flags.doTypes && "types",
    flags.doServices && "services",
    flags.doClients && "clients",
    flags.doDefinitions && "definitions",
    flags.doMetadata && "metadata",
  ].filter(Boolean);
  proc.stdout.write(`\nCode generation complete (${generated.join(", ")}).\n`);
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
 * Run the code generation pipeline
 * @param {object} args
 * @param {string[]} args.protoDirs - Discovered proto directories
 * @param {string} args.projectRoot - Project root directory path
 * @param {object} args.finder - Finder instance that manages the paths
 * @param {object} args.flags - Parsed generation flags
 * @param {object} args.mustache - Mustache module
 * @param {object} args.protoLoader - Proto loader module
 * @param {object} args.runtime - Injected runtime
 */
async function runCodegen({
  protoDirs,
  projectRoot,
  finder,
  flags,
  mustache,
  protoLoader,
  runtime,
}) {
  const fs = runtime.fsSync;
  const proc = runtime.proc;

  const generatedStorage = createStorage("generated", "local");
  const sourcePath = generatedStorage.path();

  await generatedStorage.ensureBucket();

  // A full regeneration (--all) clears the content directories first. A
  // renamed or removed proto then leaves no orphaned per-proto artifacts. The
  // services exports step scans the services/ directory. Without the clear,
  // that step would re-export a stale service dir, which imports types that no
  // longer exist. Partial flags preserve sibling artifacts on purpose, so the
  // code does not clear the directories for them.
  if (flags.doAll) {
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

  // Inject the embedded-overlay sync fs. In a compiled binary, loadTemplate's
  // reads of the virtual template mount then hit the inlined registry. In
  // source/npx execution withEmbeddedAssets is a no-op. This is then the full
  // node:fs sync surface, identical to the runtime.fsSync used above.
  const codegenFs = withEmbeddedAssets(runtime).fsSync;
  const codegens = createCodegen(
    protoDirs,
    projectRoot,
    mustache,
    protoLoader,
    codegenFs,
    runtime,
  );
  await executeGeneration(codegens, sourcePath, flags);

  await finder.createPackageSymlinks(sourcePath);
  createBundle(sourcePath, fs, runtime.subprocess);

  printSummary(sourcePath, flags, fs, proc);
}

/**
 * `fit-codegen generate` — generate protobuf types, service clients, and
 * definitions from proto files. Needs the optional proto-compiler toolchain
 * (`@grpc/proto-loader`, `mustache`, `protobufjs-cli`). A production install
 * that omitted the optional dependencies gets a friendly reinstall hint.
 * @param {object} ctx
 * @param {Record<string, boolean|undefined>} ctx.values - Parsed generation flags
 * @param {import("@forwardimpact/libutil/runtime").Runtime} ctx.runtime
 * @param {import("@forwardimpact/libcli").Cli} ctx.cli
 * @returns {Promise<void>}
 */
export async function run({ values, runtime, cli }) {
  const proc = runtime.proc;
  const flags = computeFlags(values);
  if (!flags.hasGenerationFlags()) {
    cli.usageError(
      "no generation flags specified (use --all, --type, --service, --client, --definition, or --metadata)",
    );
    proc.exit(2);
    return;
  }

  // Bind protobufjs's util.Long before the proto-loader descriptor extension
  // evaluates (see long-init.js). Then load the proto-compiler toolchain.
  await import("../long-init.js");

  let protoLoader;
  let mustache;
  try {
    ({ default: protoLoader } = await import("@grpc/proto-loader"));
    ({ default: mustache } = await import("mustache"));
    // types.js resolves protobufjs-cli at runtime. Verify it is present here.
    // A missing toolchain then surfaces as one friendly hint. It does not
    // surface in the middle of the run.
    createRequire(import.meta.url).resolve("protobufjs-cli/bin/pbjs");
  } catch (err) {
    if (isMissingModule(err)) {
      cli.error(
        "code generation needs the proto-compiler toolchain, which this " +
          "install omitted. Reinstall with optional dependencies: " +
          "npm install @forwardimpact/libcodegen",
      );
      proc.exit(1);
      return;
    }
    throw err;
  }

  const logger = new Logger("codegen", runtime);
  // The shared runtime.finder carries a no-op logger. Bind this CLI's logger
  // so createPackageSymlinks still emits its symlink debug logs.
  // createPackageSymlinks is the one Finder consumer that logs.
  const finder = runtime.finder.withLogger(logger);
  const projectRoot = finder.findProjectRoot(proc.cwd());

  const protoDirs = discoverProtoDirs(projectRoot, runtime.fsSync);
  if (protoDirs.length === 0) {
    throw new Error(
      "No proto directories found. Install @forwardimpact packages " +
        "with proto/ directories, or add proto files " +
        "to your project's proto/ directory.",
    );
  }

  await runCodegen({
    protoDirs,
    projectRoot,
    finder,
    flags,
    mustache,
    protoLoader,
    runtime,
  });
}
