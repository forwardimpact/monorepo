import path from "node:path";
import { spy } from "./spy.js";

/**
 * Creates a mock `Finder` collaborator over an in-memory `files` map. Mimics
 * the real `Finder` surface (`findUpward`, `findData`, `findProjectRoot`,
 * `findPackagePath`, `findGeneratedPath`, `createSymlink`,
 * `createPackageSymlinks`) without touching the real filesystem. Every call
 * is recorded on `calls`.
 *
 * @param {object} [options]
 * @param {Object<string, true|string>} [options.files] - Existing paths.
 * @param {string} [options.cwd="/work"] - Working directory for `findData`.
 * @returns {object} The mock finder.
 */
export function createMockFinder({ files = {}, cwd = "/work" } = {}) {
  const calls = [];
  const has = (p) => Object.hasOwn(files, p);
  const record = (name, args) => calls.push({ name, args });

  const findUpward = spy((root, relativePath, maxDepth = 3) => {
    record("findUpward", [root, relativePath, maxDepth]);
    let current = root;
    for (let depth = 0; depth < maxDepth; depth++) {
      const candidate = path.join(current, relativePath);
      if (has(candidate)) return candidate;
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return null;
  });

  const findData = spy((baseName, homeDir) => {
    record("findData", [baseName, homeDir]);
    const found = findUpward(cwd, baseName);
    if (found) return found;
    const homePath = path.join(homeDir, ".fit", baseName);
    if (has(homePath)) return homePath;
    throw new Error(`No ${baseName} directory found.`);
  });

  const findProjectRoot = spy((startPath) => {
    record("findProjectRoot", [startPath]);
    const pkg = findUpward(startPath, "package.json", 5);
    if (pkg) return path.dirname(pkg);
    throw new Error("Could not find project root");
  });

  const findPackagePath = spy((projectRoot, packageName) => {
    record("findPackagePath", [projectRoot, packageName]);
    return path.join(projectRoot, "libraries", packageName);
  });

  const findGeneratedPath = spy((projectRoot, packageName) => {
    record("findGeneratedPath", [projectRoot, packageName]);
    return path.join(
      findPackagePath(projectRoot, packageName),
      "src",
      "generated",
    );
  });

  const createSymlink = spy(async (sourcePath, targetPath) => {
    record("createSymlink", [sourcePath, targetPath]);
    files[targetPath] = sourcePath;
  });

  const createPackageSymlinks = spy(async (generatedPath) => {
    record("createPackageSymlinks", [generatedPath]);
  });

  return {
    findUpward,
    findData,
    findProjectRoot,
    findPackagePath,
    findGeneratedPath,
    createSymlink,
    createPackageSymlinks,
    calls,
  };
}
