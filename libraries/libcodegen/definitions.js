/**
 * Handles service definition generation from protobuf files
 * Specializes in gRPC service definition creation for runtime registration
 */
export class CodegenDefinitions {
  #base;

  /**
   * Creates a new definitions generator with base functionality
   * @param {object} base - CodegenBase instance providing shared utilities
   */
  constructor(base) {
    if (!base) throw new Error("CodegenBase instance is required");
    this.#base = base;
  }

  /**
   * Generate service definitions for all proto files
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async run(generatedPath) {
    if (!generatedPath) throw new Error("generatedPath is required");
    const protoFiles = this.#base
      .collectProtoFiles({ includeTools: true })
      .filter((file) => !file.endsWith(this.#base.path.sep + "common.proto"));

    const definitionsDir = this.#base.path.join(generatedPath, "definitions");
    this.#base.fs.mkdirSync(definitionsDir, { recursive: true });

    for (const protoFile of protoFiles) {
      const basename = this.#base.path.basename(protoFile, ".proto");
      await this.#base.generateArtifact(
        "definition",
        protoFile,
        definitionsDir,
        `${basename}.js`,
      );
    }

    // Generate the definitions exports file
    await this.runExports(generatedPath);
  }

  /**
   * Generate definitions exports file with all service definitions
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async runExports(generatedPath) {
    if (!generatedPath) throw new Error("generatedPath is required");
    const definitionsDir = this.#base.path.join(generatedPath, "definitions");
    const outputFile = this.#base.path.join(definitionsDir, "exports.js");

    this.#base.fs.mkdirSync(this.#base.path.dirname(outputFile), {
      recursive: true,
    });

    const definitions = [];

    if (this.#base.fs.existsSync(definitionsDir)) {
      for (const file of this.#base.fs.readdirSync(definitionsDir)) {
        if (!file.endsWith(".js") || file === "exports.js") continue;

        const serviceName = this.#base.path.basename(file, ".js");
        const pascalServiceName = this.#base.pascalCase(serviceName);
        definitions.push({
          name: `${pascalServiceName}ServiceDefinition`,
          serviceName: serviceName,
        });
      }
    }

    const template = this.#base.loadTemplate("definitions-exports");
    const content = this.#base.renderTemplate(template, {
      definitions,
      hasDefinitions: definitions.length > 0,
    });

    this.#base.fs.writeFileSync(outputFile, content);
  }
}
