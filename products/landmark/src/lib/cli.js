/**
 * Shared CLI helpers for Landmark command handlers.
 *
 * Resolves the Map data directory from CLI options (or the contributor
 * data finder), loads framework data, and normalizes option lookups used
 * across commands.
 */

import fs from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { createDataLoader } from "@forwardimpact/map/loader";
import { Finder } from "@forwardimpact/libutil";
import { createLogger } from "@forwardimpact/libtelemetry";

/** Canonical output format constants. */
export const Format = Object.freeze({
  TEXT: "text",
  JSON: "json",
  MARKDOWN: "markdown",
});

/**
 * Resolve the Map data directory from options, falling back to the
 * contributor data finder. Uses the "pathway" subdirectory — same as
 * Summit and Pathway.
 *
 * @param {object} options - Parsed CLI options.
 * @returns {string}
 */
export function resolveDataDir(options) {
  if (options.data) return resolve(options.data);

  const logger = createLogger("landmark");
  const finder = new Finder(fs, logger, process);
  try {
    return join(finder.findData("data", homedir()), "pathway");
  } catch {
    throw new Error(
      "landmark: no data directory found. Pass --data <path> pointing at a Map data directory.",
    );
  }
}

/**
 * Load framework data for a given data directory.
 *
 * @param {string} dataDir
 * @returns {Promise<object>}
 */
export async function loadMapData(dataDir) {
  const loader = createDataLoader();
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
      `landmark: invalid --format "${value}". Expected one of text, json, markdown.`,
    );
  }
  return value;
}
