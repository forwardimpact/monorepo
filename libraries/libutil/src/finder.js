import path from "path";
import { createRequire } from "node:module";
import { LIBCLI_IS_COMPILED } from "@forwardimpact/libcli";

const NOOP_LOGGER = { debug() {} };

/**
 * Finder class for project path resolution and symlink management.
 * Handles filesystem operations for linking generated code to packages.
 *
 * Constructed with injected collaborators: `new Finder({ fs, fsSync?, proc,
 * logger? })`. The injected `fs` (async) and `fsSync` (sync, for existence
 * checks) flow through to every internal call.
 */
export class Finder {
  #fs;
  #fsSync;
  #existsSync;
  #logger;
  #proc;
  #isCompiled;

  /**
   * @param {object} config - Injected collaborators.
   * @param {object} config.fs - Async fs surface (mkdir, lstat, symlink, …).
   * @param {object} [config.fsSync] - Sync fs surface for existence checks;
   *   falls back to `fs` when omitted.
   * @param {object} config.proc - Process collaborator (cwd provider).
   * @param {object} [config.logger] - Optional logger; defaults to a no-op.
   * @param {boolean} [config.isCompiled] - Whether the host is a
   *   `bun build --compile` binary; defaults to libcli's `LIBCLI_IS_COMPILED`.
   *   Injectable so tests can exercise the compiled branch of
   *   {@link Finder#findProjectRoot} without a real binary.
   */
  constructor(config = {}) {
    // Finder is the one module that legitimately bridges the sync and async
    // fs surfaces (existence checks vs. symlink ops), so it reads both fields
    // by property access rather than a single `{ fs, fsSync }` destructure
    // (which design Decision 7 reserves for consumer modules).
    const fs = config.fs;
    const fsSync = config.fsSync;
    const proc = config.proc;
    if (!fs) throw new Error("fs is required");
    if (!proc) throw new Error("proc is required");
    this.#fs = fs;
    // Retain the raw collaborators so `withLogger` can rebuild an identically
    // bound Finder with a different logger (private fields can't be copied
    // onto a bare clone, and `#existsSync` is derived from `fsSync ?? fs`).
    this.#fsSync = fsSync;
    const existsTarget = fsSync ?? fs;
    this.#existsSync = existsTarget.existsSync.bind(existsTarget);
    this.#proc = proc;
    this.#logger = config.logger ?? NOOP_LOGGER;
    this.#isCompiled = config.isCompiled ?? LIBCLI_IS_COMPILED;
  }

  /**
   * Return a Finder over the same collaborators but with the given logger.
   * The shared `runtime.finder` carries a no-op logger; a site that needs
   * symlink debug logs (e.g. codegen) calls `runtime.finder.withLogger(logger)`
   * instead of constructing its own Finder (Success Criterion 9 keeps `new
   * Finder(...)` inside libutil).
   * @param {object} logger - Logger with a `debug(scope, msg, data)` method.
   * @returns {Finder} A logger-bound view sharing this Finder's fs/proc.
   */
  withLogger(logger) {
    return new Finder({
      fs: this.#fs,
      fsSync: this.#fsSync,
      proc: this.#proc,
      logger,
      isCompiled: this.#isCompiled,
    });
  }

  /**
   * Searches upward from a root for a target file or directory.
   * @param {string} root - Starting directory to search from
   * @param {string} relativePath - Relative path to append while traversing upward
   * @param {number} [maxDepth=3] - Maximum parent levels to check
   * @returns {string|null} Found absolute path or null
   */
  findUpward(root, relativePath, maxDepth = 3) {
    let current = root;
    for (let depth = 0; depth < maxDepth; depth++) {
      const candidate = path.join(current, relativePath);
      if (this.#existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  /**
   * Resolve a data directory by upward traversal, with HOME fallback.
   * @param {string} baseName - Directory name to find (e.g. "data")
   * @param {string} homeDir - User home directory path
   * @returns {string} Absolute path to found directory
   */
  findData(baseName, homeDir) {
    const cwd = this.#proc.cwd();
    const found = this.findUpward(cwd, baseName);
    if (found) return found;

    const homePath = path.join(homeDir, ".fit", baseName);
    if (this.#existsSync(homePath)) return homePath;

    throw new Error(
      `No ${baseName} directory found from ${cwd} or ${homePath}.`,
    );
  }

  /**
   * Find the project root a tool operates against, transparently handling
   * compiled binaries.
   *
   * In a `bun build --compile` binary the entry module lives in the virtual
   * `/$bunfs` root, so `import.meta.url`/`__dirname`-relative traversal is
   * meaningless — the binary operates on whatever project tree it is launched
   * from, so the working directory *is* the project root. In source/npx
   * execution the working directory may sit anywhere inside the project, so we
   * walk upward from `startPath` for the nearest `package.json`.
   *
   * Folding the compiled check in here keeps it out of every consumer: callers
   * just ask the injected `runtime.finder` for the project root and get the
   * right answer in both worlds.
   *
   * @param {string} [startPath] - Source-mode search origin; defaults to cwd.
   * @returns {string} Project root directory path
   */
  findProjectRoot(startPath) {
    if (this.#isCompiled) return this.#proc.cwd();

    const start = startPath ?? this.#proc.cwd();
    const projectRoot = this.findUpward(start, "package.json", 5);
    if (projectRoot) {
      return path.dirname(projectRoot);
    }

    throw new Error("Could not find project root");
  }

  /**
   * Resolve the actual filesystem path to a package.
   * Works both in monorepo (./packages) and when installed as dependency.
   * @param {string} projectRoot - Project root directory path
   * @param {"libtype"|"librpc"} packageName - Package name without scope
   * @returns {string} Absolute path to package directory
   */
  findPackagePath(projectRoot, packageName) {
    const fullPackageName = `@forwardimpact/${packageName}`;

    // First try local monorepo structures
    for (const dir of ["libraries", "packages"]) {
      const localPath = path.join(projectRoot, dir, packageName);
      if (this.#existsSync(localPath)) {
        return localPath;
      }
    }

    // Fall back to Node module resolution for installed packages
    const require = createRequire(path.join(projectRoot, "package.json"));

    // Resolve the package.json path
    const packageJsonPath = require.resolve(`${fullPackageName}/package.json`);
    return path.dirname(packageJsonPath);
  }

  /**
   * Resolve the generated directory path for a package.
   * @param {string} projectRoot - Project root directory path
   * @param {"libtype"|"librpc"} packageName - Package name without scope
   * @returns {string} Absolute path to package's generated directory
   */
  findGeneratedPath(projectRoot, packageName) {
    const packagePath = this.findPackagePath(projectRoot, packageName);
    return path.join(packagePath, "src", "generated");
  }

  /**
   * Create symlink from source to target directory.
   * @param {string} sourcePath - Source directory path
   * @param {string} targetPath - Target directory path
   * @returns {Promise<void>}
   */
  async createSymlink(sourcePath, targetPath) {
    // Ensure the source directory exists
    await this.#fs.mkdir(sourcePath, { recursive: true });

    // Remove the existing target if it exists
    try {
      const stats = await this.#fs.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        await this.#fs.unlink(targetPath);
      } else {
        await this.#fs.rm(targetPath, { recursive: true, force: true });
      }
    } catch {
      // Target doesn't exist, which is fine
    }

    // Ensure the target's parent directory exists before symlinking
    await this.#fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Link relative to the symlink's own directory, not absolute. A relative
    // target survives being moved or restored at a different path — e.g. the
    // CI workspace cache restoring libraries/*/src/generated on a runner whose
    // checkout root differs from where codegen first ran. An absolute target
    // would dangle, forcing a full codegen re-run on every warm cache.
    const relativeSource = path.relative(path.dirname(targetPath), sourcePath);
    await this.#fs.symlink(relativeSource, targetPath, "dir");
    this.#logger.debug("Finder", "Created symlink", {
      source_path: relativeSource,
      target_path: targetPath,
    });
  }

  /**
   * Create symlinks to the generated directory for standard packages.
   * Attempts to find project root and create symlinks, but won't fail in
   * test environments.
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async createPackageSymlinks(generatedPath) {
    const projectRoot = this.findProjectRoot(this.#proc.cwd());
    const packageNames = ["libtype", "librpc"];

    const promises = packageNames.map(async (packageName) => {
      const targetPath = this.findGeneratedPath(projectRoot, packageName);
      await this.createSymlink(generatedPath, targetPath);
    });

    await Promise.all(promises);
  }
}
