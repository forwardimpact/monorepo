/**
 * Hosted standard-data loader.
 *
 * The artifact-driven evidence producer needs standard data (`mapData`). The
 * CLI loads it from the installed standard-data directory in the consuming
 * project. That filesystem does not exist in the hosted runtime. The deploy
 * build emits a JSON bundle instead (see `fit-map activity
 * bundle-standard-data`). The hosted path reads that bundle and resolves its
 * URL relative to this module.
 *
 * The caller injects the reader. The `.ts` wrapper passes a
 * `Deno.readTextFile`-backed reader. Tests pass their own. So this module
 * carries no reference to the `Deno` global. It imports cleanly under the
 * Node-based test runner.
 *
 * @typedef {"bundle_absent" | "bundle_malformed"} SkipReason
 */

/**
 * Load the deploy-bundled standard data.
 * @param {(url: URL) => Promise<string>} readBundle - Reads the bundle text.
 * @returns {Promise<{ mapData: object } | { skipped: true, reason: SkipReason }>}
 */
export async function loadHostedMapData(readBundle) {
  const url = new URL("./standard-data.json", import.meta.url);
  let text;
  try {
    text = await readBundle(url);
  } catch {
    return { skipped: true, reason: "bundle_absent" };
  }
  try {
    return { mapData: JSON.parse(text) };
  } catch {
    return { skipped: true, reason: "bundle_malformed" };
  }
}
