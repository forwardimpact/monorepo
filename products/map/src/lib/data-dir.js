/**
 * Locate the Map data directory for the running process.
 *
 * If `providedPath` is given, resolve it against the current cwd and verify
 * it exists. Otherwise walk upward from the cwd using the shared `Finder`
 * helper, returning the `pathway/` subdirectory of whatever `data/` root is
 * found. Callers downstream of `findDataDir` (seed, transform) that need the
 * `data/` root use `path.dirname(findDataDir(...))`.
 */

import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir as defaultHomedir } from "node:os";
import { Finder } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";

/**
 * @param {string|undefined} providedPath - Explicit path from --data flag.
 * @param {object} [deps]
 * @param {typeof fs} [deps.fs] - Node fs/promises namespace (for tests).
 * @param {object} [deps.process] - Process object (cwd, env).
 * @param {() => string} [deps.homedir] - homedir() override.
 * @returns {Promise<string>} Resolved data directory (pathway/) path.
 */
export async function findDataDir(
  providedPath,
  { fs: fsImpl = fs, process: proc = process, homedir = defaultHomedir } = {},
) {
  if (providedPath) {
    const resolved = resolve(providedPath);
    try {
      await fsImpl.access(resolved);
    } catch {
      throw new Error(`Data directory not found: ${providedPath}`);
    }
    return resolved;
  }

  const logger = createLogger("map");
  const finder = new Finder(fsImpl, logger, proc);
  try {
    return join(finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "No data directory found. Use --data=<path> to specify location.",
    );
  }
}
