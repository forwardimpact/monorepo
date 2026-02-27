/**
 * Handles JavaScript type generation from protobuf files
 * Specializes in Protocol Buffer to JavaScript type conversion
 */
export class CodegenTypes {
  #base;

  /**
   * Creates a new types generator with base functionality
   * @param {object} base - CodegenBase instance providing shared utilities
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

    // Copy all proto source files into generated/proto for runtime loading
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

    // ESM resolution fix: ensure explicit extension for Node ESM and default import
    const content = this.#base.fs.readFileSync(jsOutFile, "utf8");
    const fixed = content
      .replace(/from\s+"protobufjs\/minimal";/, 'from "protobufjs/minimal.js";')
      .replace(
        /import\s+\*\s+as\s+\$protobuf\s+from\s+"protobufjs\/minimal\.js";/,
        'import $protobuf from "protobufjs/minimal.js";',
      );

    if (fixed !== content) {
      this.#base.fs.writeFileSync(jsOutFile, fixed, "utf8");
    }
  }

  /**
   * Generate JavaScript types using protobufjs compiler
   * @param {string[]} protoFiles - Array of proto file paths to compile
   * @param {string} outFile - Output JavaScript file path
   * @returns {Promise<void>}
   */
  async generateJavaScriptTypes(protoFiles, outFile) {
    const args = [
      "-t",
      "static-module",
      "-w",
      "es6",
      "--no-delimited",
      "--no-create",
      "--no-service",
      "--force-message",
      "--keep-case",
      "-o",
      outFile,
      ...protoFiles,
    ];

    await this.#base.run("npx", ["pbjs", ...args], {
      cwd: this.#base.projectRoot,
    });
  }
}
