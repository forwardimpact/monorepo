import fs from "fs";
import fsAsync from "fs/promises";
import path from "path";
import { createRequire } from "node:module";

/**
 * Finder class for project path resolution and symlink management
 * Handles filesystem operations for linking generated code to packages
 */
export class Finder {
  #logger;
  #process;

  /**
   * Creates a new Finder instance
   * @param {object} fs - Filesystem module (fs/promises)
   * @param {object} logger - Logger instance for debug output
   * @param {object} process - Process environment access (for testing)
   */
  constructor(fs, logger, process = global.process) {
    if (!fs) throw new Error("fs is required");
    if (!logger) throw new Error("logger is required");
    if (!process) throw new Error("process is required");

    this.#logger = logger;
    this.#process = process;
  }

  /**
   * Searches upward from one or more roots for a target file or directory.
   * @param {string} root - Starting directory to search from
   * @param {string} relativePath - Relative path to append while traversing upward
   * @param {number} maxDepth - Maximum parent levels to check
   * @returns {string|null} Found absolute path or null
   */
  findUpward(root, relativePath, maxDepth = 3) {
    let current = root;
    for (let depth = 0; depth < maxDepth; depth++) {
      const candidate = path.join(current, relativePath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  }

  /**
   * Find the project root directory
   * @param {string} startPath - Starting directory path
   * @returns {string} Project root directory path
   */
  findProjectRoot(startPath) {
    const projectRoot = this.findUpward(startPath, "package.json", 5);
    if (projectRoot) {
      return path.dirname(projectRoot);
    }

    throw new Error("Could not find project root");
  }

  /**
   * Resolve the actual filesystem path to a package
   * Works both in monorepo (./packages) and when installed as dependency
   * @param {string} projectRoot - Project root directory path
   * @param {"libtype"|"librpc"} packageName - Package name without scope
   * @returns {string} Absolute path to package directory
   */
  findPackagePath(projectRoot, packageName) {
    const fullPackageName = `@forwardimpact/${packageName}`;

    // First try local monorepo structures
    for (const dir of ["libraries", "packages"]) {
      const localPath = path.join(projectRoot, dir, packageName);
      if (fs.existsSync(localPath)) {
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
   * Resolve the generated directory path for a package
   * @param {string} projectRoot - Project root directory path
   * @param {"libtype"|"librpc"} packageName - Package name without scope
   * @returns {string} Absolute path to package's generated directory
   */
  findGeneratedPath(projectRoot, packageName) {
    const packagePath = this.findPackagePath(projectRoot, packageName);
    return path.join(packagePath, "generated");
  }

  /**
   * Create symlink from source to target directory
   * @param {string} sourcePath - Source directory path
   * @param {string} targetPath - Target directory path
   * @returns {Promise<void>}
   */
  async createSymlink(sourcePath, targetPath) {
    // Ensure the source directory exists
    await fsAsync.mkdir(sourcePath, { recursive: true });

    // Remove the existing target if it exists
    try {
      const stats = await fsAsync.lstat(targetPath);
      if (stats.isSymbolicLink()) {
        await fsAsync.unlink(targetPath);
      } else {
        await fsAsync.rm(targetPath, { recursive: true, force: true });
      }
    } catch {
      // Target doesn't exist, which is fine
    }

    // Create the symlink
    await fsAsync.symlink(sourcePath, targetPath, "dir");
    this.#logger.debug("Finder", "Created symlink", {
      source_path: sourcePath,
      target_path: targetPath,
    });
  }

  /**
   * Create symlinks to the generated directory for standard packages
   * Attempts to find project root and create symlinks, but won't fail in test environments
   * @param {string} generatedPath - Path to generated code directory
   * @returns {Promise<void>}
   */
  async createPackageSymlinks(generatedPath) {
    const projectRoot = this.findProjectRoot(this.#process.cwd());
    const packageNames = ["libtype", "librpc"];

    const promises = packageNames.map(async (packageName) => {
      const targetPath = this.findGeneratedPath(projectRoot, packageName);
      await this.createSymlink(generatedPath, targetPath);
    });

    await Promise.all(promises);
  }
}
