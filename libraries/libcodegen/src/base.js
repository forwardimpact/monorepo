import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";

/** Convert camelCase to snake_case (protobufjs normalizes field names) */
function camelToSnake(str) {
  return str.replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

// Protobufjs scalar type names are already human-readable (string, int32, bool, etc.)
// so most pass through as-is. This map handles any aliases needed.
const PBJS_TYPE_MAP = {
  string: "string",
  int32: "int32",
  int64: "int64",
  uint32: "uint32",
  uint64: "uint64",
  sint32: "sint32",
  sint64: "sint64",
  fixed32: "fixed32",
  fixed64: "fixed64",
  sfixed32: "sfixed32",
  sfixed64: "sfixed64",
  float: "float",
  double: "double",
  bool: "bool",
  bytes: "bytes",
};

/**
 * Extract field metadata from a protobufjs Type
 * @param {protobuf.Type} pbjsType - Resolved protobufjs type
 * @returns {object} Map of snake_case field names to metadata
 */
function extractFields(pbjsType) {
  const fields = {};
  for (const [camelName, field] of Object.entries(pbjsType.fields)) {
    const name = camelToSnake(camelName);
    const typeName = field.resolvedType
      ? "message"
      : PBJS_TYPE_MAP[field.type] || field.type;
    const hasOptionalKeyword = pbjsType.oneofs?.[`_${camelName}`] !== undefined;
    fields[name] = {
      type: typeName,
      optional: hasOptionalKeyword,
      repeated: field.repeated || false,
      description: field.comment || null,
    };
  }
  return fields;
}

/**
 * Base class for code generation utilities providing shared functionality
 * Implements dependency injection pattern with explicit validation
 */
export class CodegenBase {
  #protoDirs;
  #projectRoot;
  #path;
  #mustache;
  #protoLoader;
  #fs;
  #subprocess;

  /**
   * Creates a new codegen base instance with dependency injection
   * @param {string[]} protoDirs - Array of proto directory paths to scan
   * @param {string} projectRoot - Project root directory path (for tools/ discovery)
   * @param {object} path - Path module for file operations
   * @param {object} mustache - Mustache template rendering module
   * @param {object} protoLoader - Protocol buffer loader module
   * @param {object} fs - File system module (sync operations only)
   * @param {import("@forwardimpact/libutil/runtime").Runtime} runtime - Injected runtime bag
   */
  constructor(
    protoDirs,
    projectRoot,
    path,
    mustache,
    protoLoader,
    fs,
    runtime,
  ) {
    if (!protoDirs || !Array.isArray(protoDirs) || protoDirs.length === 0) {
      throw new Error("protoDirs must be a non-empty array");
    }
    if (!projectRoot) throw new Error("projectRoot is required");
    if (!path) throw new Error("path module is required");
    if (!mustache) throw new Error("mustache module is required");
    if (!protoLoader) throw new Error("protoLoader module is required");
    if (!fs) throw new Error("fs module is required");
    if (!runtime) throw new Error("runtime is required");

    this.#protoDirs = protoDirs;
    this.#projectRoot = projectRoot;
    this.#path = path;
    this.#mustache = mustache;
    this.#protoLoader = protoLoader;
    this.#fs = fs;
    this.#subprocess = runtime.subprocess;
  }

  /**
   * Collect all proto files from discovered proto directories and tools directory.
   * Deduplicates by filename (last occurrence wins), maintains common.proto-first
   * ordering, and includes all discovered directories as proto include paths.
   * @param {object} opts - Collection options
   * @param {boolean} opts.includeTools - Whether to include tool proto files
   * @returns {string[]} Array of absolute proto file paths
   */
  collectProtoFiles(opts = {}) {
    const { includeTools = true } = opts;

    // Collect from all proto directories, dedup by filename (last wins)
    const byName = new Map();
    for (const dir of this.#protoDirs) {
      if (!this.#fs.existsSync(dir)) continue;
      for (const file of this.#fs.readdirSync(dir)) {
        if (file.endsWith(".proto")) {
          byName.set(file, this.#path.join(dir, file));
        }
      }
    }

    // Sort and ensure common.proto comes first
    const sorted = Array.from(byName.keys()).sort();
    const ordered = sorted.includes("common.proto")
      ? [
          byName.get("common.proto"),
          ...sorted
            .filter((f) => f !== "common.proto")
            .map((f) => byName.get(f)),
        ]
      : sorted.map((f) => byName.get(f));

    if (includeTools) {
      try {
        const toolsDir = this.#path.join(this.#projectRoot, "tools");
        ordered.push(
          ...this.#fs
            .readdirSync(toolsDir)
            .filter((f) => f.endsWith(".proto"))
            .map((f) => this.#path.join(toolsDir, f)),
        );
      } catch {
        // tools directory may not exist; ignore
      }
    }

    return ordered;
  }

  /**
   * Get all proto include directories for cross-file import resolution
   * @returns {string[]} Array of absolute paths to proto directories
   */
  get includeDirs() {
    return this.#protoDirs.filter((dir) => this.#fs.existsSync(dir));
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
      "..",
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
   * @param {object} [opts] - Subprocess options (e.g. cwd)
   * @returns {Promise<void>} Resolves when the command completes successfully
   */
  async run(cmd, args, opts = {}) {
    // `stdio: "inherit"` forwards to the underlying execFile/spawn so the
    // child's stdout/stderr go straight to the parent's fds — preserving the
    // exact pre-1370 behavior (origin/main also ran execFile with
    // stdio:"inherit"), so `just codegen` shows protoc/pbjs progress live.
    // With inherited stdio the buffered result is empty, so the error path
    // below falls back to the exit code. Capture-mode callers override via
    // `opts.stdio`.
    const result = await this.#subprocess.run(cmd, args, {
      stdio: "inherit",
      ...opts,
    });
    if (result.exitCode !== 0) {
      const msg =
        result.stderr?.trim() ||
        result.stdout?.trim() ||
        `exited with code ${result.exitCode}`;
      throw new Error(`Command failed: ${cmd} ${args.join(" ")}\n${msg}`);
    }
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
      includeDirs: this.includeDirs,
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
   * Parse metadata for a proto file: service methods with request type fields.
   * Uses protobufjs for field types, optionality, and comments.
   * @param {string} protoPath - Absolute path to .proto file
   * @returns {{packageName:string, serviceName:string, methods:object}|null}
   */
  parseMetadata(protoPath) {
    const parsed = this.parseProtoFile(protoPath);
    if (!parsed) return null;

    const { packageName, serviceName, methods: parsedMethods } = parsed;
    const root = this.#loadProtobufRoot(protoPath);

    const methods = {};
    for (const method of parsedMethods) {
      const pbjsType = this.#resolveRequestType(root, method);
      const fields = pbjsType ? extractFields(pbjsType) : {};
      methods[method.name] = {
        requestType: `${method.requestTypeNamespace}.${method.requestType}`,
        fields,
      };
    }

    return { packageName, serviceName, methods };
  }

  /**
   * Load a protobufjs Root with include-path resolution
   * @param {string} protoPath - Absolute path to .proto file
   * @returns {protobuf.Root}
   */
  #loadProtobufRoot(protoPath) {
    const root = new protobuf.Root();
    root.resolvePath = (_origin, target) => {
      for (const dir of this.includeDirs) {
        const candidate = this.#path.join(dir, target);
        if (this.#fs.existsSync(candidate)) return candidate;
      }
      return target;
    };
    root.loadSync(protoPath, { alternateCommentMode: true });
    root.resolveAll();
    return root;
  }

  /**
   * Resolve the request type for a method from the protobufjs Root
   * @param {protobuf.Root} root - Loaded protobufjs root
   * @param {object} method - Parsed method descriptor
   * @returns {protobuf.Type|null}
   */
  #resolveRequestType(root, method) {
    const qualified = `${method.requestTypeNamespace}.${method.requestType}`;
    try {
      return root.lookupType(qualified);
    } catch {
      try {
        return root.lookupType(method.requestType);
      } catch {
        return null;
      }
    }
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
