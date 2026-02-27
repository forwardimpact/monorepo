import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * Base class for code generation utilities providing shared functionality
 * Implements dependency injection pattern with explicit validation
 */
export class CodegenBase {
  #projectRoot;
  #path;
  #mustache;
  #protoLoader;
  #fs;

  /**
   * Creates a new codegen base instance with dependency injection
   * @param {string} projectRoot - Project root directory path
   * @param {object} path - Path module for file operations
   * @param {object} mustache - Mustache template rendering module
   * @param {object} protoLoader - Protocol buffer loader module
   * @param {object} fs - File system module (sync operations only)
   */
  constructor(projectRoot, path, mustache, protoLoader, fs) {
    if (!projectRoot) throw new Error("projectRoot is required");
    if (!path) throw new Error("path module is required");
    if (!mustache) throw new Error("mustache module is required");
    if (!protoLoader) throw new Error("protoLoader module is required");
    if (!fs) throw new Error("fs module is required");

    this.#projectRoot = projectRoot;
    this.#path = path;
    this.#mustache = mustache;
    this.#protoLoader = protoLoader;
    this.#fs = fs;
  }

  /**
   * Collect all proto files from project proto directory and tools directory
   * @param {object} opts - Collection options
   * @param {boolean} opts.includeTools - Whether to include tool proto files
   * @returns {string[]} Array of absolute proto file paths
   */
  collectProtoFiles(opts = {}) {
    const { includeTools = true } = opts;
    const protoDir = this.#path.join(this.#projectRoot, "proto");

    const discovered = this.#fs
      .readdirSync(protoDir)
      .filter((f) => f.endsWith(".proto"))
      .sort();

    const ordered = discovered.includes("common.proto")
      ? [
          this.#path.join(protoDir, "common.proto"),
          ...discovered
            .filter((f) => f !== "common.proto")
            .map((f) => this.#path.join(protoDir, f)),
        ]
      : discovered.map((f) => this.#path.join(protoDir, f));

    if (includeTools) {
      try {
        ordered.push(
          ...this.#fs
            .readdirSync(this.#path.join(this.#projectRoot, "tools"))
            .filter((f) => f.endsWith(".proto"))
            .map((f) => this.#path.join(this.#projectRoot, "tools", f)),
        );
      } catch {
        // tools directory may not exist; ignore
      }
    }

    return ordered;
  }

  /**
   * Load mustache template for given kind
   * @param {"service"|"client"|"exports"|"definition"|"definitions-exports"|"services-exports"} kind - Template kind
   * @returns {string} Template content
   */
  loadTemplate(kind) {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = this.#path.dirname(__filename);
    const templatePath = this.#path.join(
      __dirname,
      "templates",
      `${kind}.js.mustache`,
    );

    if (!this.#fs.existsSync(templatePath)) {
      throw new Error(`Missing ${kind}.js.mustache template`);
    }
    return this.#fs.readFileSync(templatePath, "utf8");
  }

  /**
   * Render mustache template with given data
   * @param {string} template - Template content
   * @param {object} data - Template data
   * @returns {string} Rendered content
   */
  renderTemplate(template, data) {
    return this.#mustache.render(template, data);
  }

  /**
   * Run a command with arguments and options
   * @param {string} cmd - Command to execute
   * @param {string[]} args - Command-line arguments
   * @param {object} [opts] - Child process options
   * @returns {Promise<void>} Resolves when the command completes successfully
   */
  run(cmd, args, opts = {}) {
    return new Promise((resolvePromise, reject) => {
      const child = execFile(
        cmd,
        args,
        { stdio: "inherit", ...opts },
        (err) => {
          if (err) reject(err);
          else resolvePromise();
        },
      );
      child.on("error", reject);
    });
  }

  /**
   * Convert string to PascalCase
   * @param {string} str - String to convert
   * @returns {string} PascalCase string
   */
  pascalCase(str) {
    return str
      .split(/[-_\s]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join("");
  }

  /**
   * Parse a .proto file to extract a single service definition and method shapes
   * @param {string} protoPath - Absolute path to .proto file
   * @returns {{packageName:string, serviceName:string, methods:Array, namespaceName:string}|null} Parsed service info
   */
  parseProtoFile(protoPath) {
    const def = this.#protoLoader.loadSync(protoPath, {
      includeDirs: [this.#path.dirname(protoPath)],
      keepCase: true,
    });

    const serviceKey = Object.keys(def).find((key) => {
      const val = def[key];
      if (!val || typeof val !== "object") return false;
      const methods = Object.values(val);
      return (
        methods.length > 0 &&
        methods.every(
          (m) =>
            m &&
            typeof m === "object" &&
            "requestType" in m &&
            "responseType" in m,
        )
      );
    });

    if (!serviceKey) return null; // Indicate no service for this proto (pure message proto)

    const serviceDef = def[serviceKey];
    const parts = serviceKey.split(".");
    const serviceName = parts[parts.length - 1];
    const packageName = parts.slice(0, -1).join(".");

    const methods = Object.entries(serviceDef).map(
      ([name, method], index, array) => {
        const req = method.requestType.type;
        const res = method.responseType.type;

        return {
          name,
          requestType: req.name,
          responseType: res.name,
          requestTypeNamespace: this.findTypeNamespace(req, def, packageName),
          responseTypeNamespace: this.findTypeNamespace(res, def, packageName),
          paramName: "req",
          isLast: index === array.length - 1,
          responseStream: !!method.responseStream,
          requestStream: !!method.requestStream,
        };
      },
    );

    // Collect all unique namespaces needed for imports
    const namespaces = new Set([
      packageName,
      ...methods.flatMap((m) => [
        m.requestTypeNamespace,
        m.responseTypeNamespace,
      ]),
    ]);

    // Filter out well-known google namespaces as they are not in libtype
    const filteredNamespaces = Array.from(namespaces).filter(
      (ns) => !ns.startsWith("google"),
    );

    return {
      packageName,
      serviceName,
      methods,
      namespaceName: packageName,
      importNamespaces: filteredNamespaces.map((ns, index, array) => ({
        name: ns,
        isLast: index === array.length - 1,
      })),
    };
  }

  /**
   * Find the namespace for a given type by comparing structure
   * @param {object} typeToFind - The type definition to find namespace for
   * @param {object} allTypes - All available type definitions
   * @param {string} fallbackPackage - Fallback package name
   * @returns {string} The namespace string for the type
   */
  findTypeNamespace(typeToFind, allTypes, fallbackPackage) {
    // Find matching type definition by structure comparison
    for (const [key, typeDef] of Object.entries(allTypes)) {
      if (typeDef.type && typeDef.type.name === typeToFind.name) {
        const typeFields = typeDef.type.field || [];
        const targetFields = typeToFind.field || [];

        // Compare fields to see if structures match
        const fieldsMatch =
          typeFields.length === targetFields.length &&
          typeFields.every(
            (field, i) =>
              field.name === targetFields[i].name &&
              field.type === targetFields[i].type &&
              field.typeName === targetFields[i].typeName,
          );

        if (fieldsMatch) {
          const parts = key.split(".");
          return parts.length > 1
            ? parts.slice(0, -1).join(".")
            : fallbackPackage;
        }
      }
    }
    return fallbackPackage;
  }

  /**
   * Render and write a service/client artifact for a given proto into a service dir
   * @param {"service"|"client"|"definition"} kind - Artifact kind to generate
   * @param {string} protoPath - Absolute path to .proto file
   * @param {string} outputDir - Absolute directory path for output
   * @param {string} [filename] - Optional custom filename (defaults to kind.js)
   * @returns {Promise<void>}
   */
  async generateArtifact(kind, protoPath, outputDir, filename) {
    const parsed = this.parseProtoFile(protoPath);
    if (!parsed) return; // Skip non-service proto

    const {
      packageName,
      serviceName,
      methods,
      namespaceName,
      importNamespaces,
    } = parsed;
    const rendered = this.#mustache.render(this.loadTemplate(kind), {
      packageName,
      serviceName,
      methods,
      namespaceName,
      importNamespaces,
      className: `${serviceName}${kind === "service" ? "Base" : kind === "client" ? "Client" : "ServiceDefinition"}`,
    });

    const jsFile = this.#path.join(outputDir, filename || `${kind}.js`);
    this.#fs.writeFileSync(jsFile, rendered);
  }

  /**
   * Get path module instance
   * @returns {object} Path module
   */
  get path() {
    return this.#path;
  }

  /**
   * Get fs module instance
   * @returns {object} File system module
   */
  get fs() {
    return this.#fs;
  }

  /**
   * Get project root path
   * @returns {string} Project root directory path
   */
  get projectRoot() {
    return this.#projectRoot;
  }
}
