/**
 * Copy helpers for staging a workspace's `data/` tree. Activity and
 * pathway are a matched pair from the same data root: the roster under
 * `data/activity` carries level ids defined by `data/pathway`, so both
 * ship from the same source.
 *
 * Pure helpers — they throw raw Errors on failure so the caller's
 * runPhase envelope owns the framing.
 */

import path from "node:path";

/**
 * Copy a source directory into `<target>/data/activity/` recursively.
 * `recursive: true` creates the `data/` parent if absent, matching
 * init.js's semantics.
 *
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

/**
 * Replace `<target>/data/pathway/` with the source pathway directory.
 *
 * Unlike `copyActivity`, the staged pathway is replaced wholesale: init
 * has already materialised the starter standard at the destination, and
 * a merge copy (`force: false`) would blend starter files into the
 * source standard. When the source pathway does not exist, the starter
 * copy stays as the fallback; when source and destination resolve to
 * the same directory (staging into the data root itself), the copy is
 * skipped.
 *
 * @param {object} params
 * @param {string} params.source - Absolute path to the source pathway dir
 *   (e.g. `<monorepo>/data/pathway`).
 * @param {string} params.target - Absolute path to the workspace target
 *   (the `--cwd` value).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs).
 */
export async function copyPathway({ source, target, runtime }) {
  const dest = path.join(target, "data", "pathway");
  if (path.resolve(source) === path.resolve(dest)) return;
  try {
    await runtime.fs.access(source);
  } catch {
    return;
  }
  await runtime.fs.rm(dest, { recursive: true, force: true });
  await runtime.fs.cp(source, dest, { recursive: true });
}
