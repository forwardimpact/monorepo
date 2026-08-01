import { createRequire } from "node:module";

/**
 * Generates the JavaScript types from the protobuf files
 * Converts Protocol Buffer types into JavaScript types
 */
export class CodegenTypes {
  #base;

  /**
   * Creates a new types generator with base functionality
   * @param {object} base - CodegenBase instance that provides shared utilities
   */
  constructor(base) {
    if (!base) throw new Error("CodegenBase instance is required");
    this.#base = base;
  }

  /**
   * Generate JavaScript types from protobuf files
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async run(generatedPath) {
    if (!generatedPath) throw new Error("generatedPath is required");
    const typesDir = this.#base.path.resolve(generatedPath, "types");
    const protoOutDir = this.#base.path.resolve(generatedPath, "proto");
    const jsOutFile = this.#base.path.resolve(typesDir, "types.js");

    // Create directories and clean up existing files
    [typesDir, protoOutDir].forEach((dir) => {
      this.#base.fs.mkdirSync(dir, { recursive: true });
    });

    if (this.#base.fs.existsSync(jsOutFile)) {
      this.#base.fs.unlinkSync(jsOutFile);
    }

    const protoFiles = this.#base.collectProtoFiles({ includeTools: true });

    // Copy all proto source files into generated/proto for the runtime to load
    protoFiles.forEach((protoFile) => {
      this.#base.fs.copyFileSync(
        protoFile,
        this.#base.path.resolve(
          protoOutDir,
          this.#base.path.basename(protoFile),
        ),
      );
    });

    await this.generateJavaScriptTypes(protoFiles, jsOutFile);

    // ESM resolution fix: give Node ESM an explicit extension and a default
    // import
    const content = this.#base.fs.readFileSync(jsOutFile, "utf8");
    const fixed = content
      .replace(/from\s+"protobufjs\/minimal";/, 'from "protobufjs/minimal.js";')
      .replace(
        /import\s+\*\s+as\s+\$protobuf\s+from\s+"protobufjs\/minimal\.js";/,
        'import $protobuf from "protobufjs/minimal.js";',
      )
      // Statically bind protobufjs's $util.Long to the `long` package. Without
      // this, `bun build --compile` tree-shakes `long`, which only protobufjs's
      // lazy require reaches. Module-init then crashes on int64 prototype
      // defaults like `Span.prototype.start_time_unix_nano = $util.Long.fromBits(...)`.
      .replace(
        /(import \$protobuf from "protobufjs\/minimal\.js";)/,
        '$1\nimport Long from "long";\n$protobuf.util.Long = Long;\n$protobuf.configure();',
      );

    if (fixed !== content) {
      this.#base.fs.writeFileSync(jsOutFile, fixed, "utf8");
    }
  }

  /**
   * Generate JavaScript types with the protobufjs compiler
   * @param {string[]} protoFiles - Array of proto file paths to compile
   * @param {string} outFile - Output JavaScript file path
   * @returns {Promise<void>}
   */
  async generateJavaScriptTypes(protoFiles, outFile) {
    // Resolve the pbjs binary from the protobufjs-cli package. This works in
    // both Bun and Node.
    const require = createRequire(import.meta.url);
    const pbjsBin = require.resolve("protobufjs-cli/bin/pbjs");

    // Pass all proto directories as include paths so cross-file imports resolve
    const includePaths = this.#base.includeDirs.flatMap((dir) => ["-p", dir]);

    const args = [
      pbjsBin,
      "-t",
      "static-module",
      "-w",
      "es6",
      "--no-delimited",
      "--no-create",
      "--no-service",
      "--force-message",
      "--keep-case",
      ...includePaths,
      "-o",
      outFile,
      ...protoFiles,
    ];

    await this.#base.run(process.execPath, args, {
      cwd: this.#base.projectRoot,
    });
  }
}
