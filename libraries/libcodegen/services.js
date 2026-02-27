/**
 * Handles service and client generation from protobuf files
 * Specializes in gRPC service base classes and client generation
 */
export class CodegenServices {
  #base;

  /**
   * Creates a new services generator with base functionality
   * @param {object} base - CodegenBase instance providing shared utilities
   */
  constructor(base) {
    if (!base) throw new Error("CodegenBase instance is required");
    this.#base = base;
  }

  /**
   * Generate service or client artifacts for all proto files
   * @param {"service"|"client"} kind - Type of artifacts to generate
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async runForKind(kind, generatedPath) {
    if (!generatedPath) throw new Error("generatedPath is required");
    const protoFiles = this.#base
      .collectProtoFiles({ includeTools: true })
      .filter((file) => !file.endsWith(this.#base.path.sep + "common.proto"));

    for (const protoFile of protoFiles) {
      const basename = this.#base.path.basename(protoFile, ".proto");
      const outDir = this.#base.path.join(generatedPath, "services", basename);
      this.#base.fs.mkdirSync(outDir, { recursive: true });
      await this.#base.generateArtifact(kind, protoFile, outDir);
    }
  }

  /**
   * Generate services exports file with all service bases and clients
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async runExports(generatedPath) {
    if (!generatedPath) throw new Error("generatedPath is required");
    const serviceDir = this.#base.path.join(generatedPath, "services");
    const outputFile = this.#base.path.join(serviceDir, "exports.js");

    this.#base.fs.mkdirSync(this.#base.path.dirname(outputFile), {
      recursive: true,
    });

    const services = [];
    const clients = [];

    if (this.#base.fs.existsSync(serviceDir)) {
      for (const dir of this.#base.fs.readdirSync(serviceDir)) {
        const servicePath = this.#base.path.join(serviceDir, dir);
        if (!this.#base.fs.statSync(servicePath).isDirectory()) continue;

        const serviceName = this.#base.pascalCase(dir);
        if (
          this.#base.fs.existsSync(
            this.#base.path.join(servicePath, "service.js"),
          )
        ) {
          services.push({
            name: `${serviceName}Base`,
            path: `./${dir}/service.js`,
          });
        }
        if (
          this.#base.fs.existsSync(
            this.#base.path.join(servicePath, "client.js"),
          )
        ) {
          clients.push({
            name: `${serviceName}Client`,
            path: `./${dir}/client.js`,
          });
        }
      }
    }

    const template = this.#base.loadTemplate("services-exports");

    const content = this.#base.renderTemplate(template, {
      services,
      clients,
      hasServices: services.length > 0,
      hasClients: clients.length > 0,
    });

    this.#base.fs.writeFileSync(outputFile, content);
  }
}
