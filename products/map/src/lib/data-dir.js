/**
 * Locate the Map data directory for the running process.
 *
 * If `providedPath` is given, resolve it against the current cwd and verify
 * it exists. Otherwise walk upward from the cwd using the shared `Finder`
 * helper, returning the `pathway/` subdirectory of whatever `data/` root is
 * found. Callers downstream of `findDataDir` (seed, transform) that need the
 * `data/` root use `path.dirname(findDataDir(...))`.
 */

import { join, resolve } from "node:path";
import { homedir as defaultHomedir } from "node:os";

/**
 * @param {string|undefined} providedPath - Explicit path from --data flag.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs, finder).
 * @param {object} [opts]
 * @param {() => string} [opts.homedir] - homedir() override (for tests).
 * @returns {Promise<string>} Resolved data directory (pathway/) path.
 */
export async function findDataDir(
  providedPath,
  runtime,
  { homedir = defaultHomedir } = {},
) {
  if (providedPath) {
    const resolved = resolve(providedPath);
    try {
      await runtime.fs.access(resolved);
    } catch {
      throw new Error(`Data directory not found: ${providedPath}`);
    }
    return resolved;
  }

  try {
    return join(runtime.finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "No data directory found. Use --data=<path> to specify location.",
    );
  }
}
