/**
 * Shared CLI helpers for Summit command handlers.
 *
 * These helpers resolve the Map data directory from CLI options or from
 * the contributor data finder. They load standard data. They also
 * normalize the option lookups that commands share.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";

/** Canonical output format constants. */
export const Format = Object.freeze({
  TEXT: "text",
  JSON: "json",
  MARKDOWN: "markdown",
});

/**
 * Resolve the Map data directory from options. Fall back to the
 * contributor data finder. Pathway uses the same pattern.
 *
 * @param {object} options - Parsed CLI options.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators.
 * @returns {string}
 */
export function resolveDataDir(options, runtime) {
  if (options.data) return resolve(options.data);

  try {
    return join(runtime.finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "summit: no data directory found. Pass --data <path> that points at a Map data directory.",
    );
  }
}

/**
 * Load standard data for a given data directory.
 *
 * @param {string} dataDir
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs).
 * @returns {Promise<object>}
 */
export async function loadMapData(dataDir, runtime) {
  const loader = createDataLoader(runtime);
  return loader.loadAllData(dataDir);
}

/**
 * Normalize the `--format` option to a known constant.
 *
 * @param {object} options
 * @returns {string}
 */
export function resolveFormat(options) {
  const value = options.format ?? Format.TEXT;
  if (
    value !== Format.TEXT &&
    value !== Format.JSON &&
    value !== Format.MARKDOWN
  ) {
    throw new Error(
      `summit: invalid --format "${value}". Expected one of text, json, markdown.`,
    );
  }
  return value;
}

/**
 * Normalize the source of the roster (explicit path vs. Map-sourced).
 *
 * @param {object} options
 * @param {object} [config] - libconfig Config to forward to createSummitClient.
 * @returns {{ rosterPath?: string, config?: object }}
 */
export function getRosterSource(options, config) {
  if (options.roster) return { rosterPath: options.roster };
  return config ? { config } : {};
}
