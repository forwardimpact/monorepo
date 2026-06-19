/**
 * Hosted standard-data loader.
 *
 * The artifact-driven evidence producer needs standard data (`mapData`). The
 * CLI loads it from the consuming project's installed standard-data directory,
 * a filesystem that does not exist in the hosted runtime. The hosted path reads
 * a JSON bundle emitted at deploy build (see `fit-map activity
 * bundle-standard-data`), resolved relative to this module.
 *
 * The reader is injected by the caller (the `.ts` wrapper passes a
 * `Deno.readTextFile`-backed reader; tests pass their own), so this module
 * carries no reference to the `Deno` global and imports cleanly under the
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
