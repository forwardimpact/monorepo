/**
 * Copy a source directory into `<target>/data/activity/` recursively.
 *
 * Pure helper — throws raw Error on failure so the caller's runPhase
 * envelope owns the framing. `recursive: true` creates the `data/`
 * parent if absent, matching init.js's semantics.
 */

import path from "node:path";

/**
 * @param {object} params
 * @param {string} params.source - Absolute path to the source activity dir
 *   (e.g. `<monorepo>/data/activity`).
 * @param {string} params.target - Absolute path to the workspace target
 *   (the `--cwd` value).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs).
 */
export async function copyActivity({ source, target, runtime }) {
  const dest = path.join(target, "data", "activity");
  await runtime.fs.cp(source, dest, {
    recursive: true,
    force: false,
    errorOnExist: false,
  });
}
