/**
 * Command context builder.
 *
 * Assembles the shared context object every command handler receives.
 */

import { loadMapData, resolveFormat } from "./cli.js";
import { createLandmarkClient } from "./supabase.js";

/**
 * Build the execution context for a command handler.
 *
 * @param {object} params
 * @param {string} params.dataDir - Resolved Map data directory.
 * @param {object} params.options - Parsed CLI options.
 * @param {boolean} params.needsSupabase - Whether to open a Supabase client.
 * @returns {Promise<{mapData: object, supabase: object|null, format: string, options: object}>}
 */
export async function buildContext({ dataDir, options, needsSupabase }) {
  const mapData = await loadMapData(dataDir);
  const supabase = needsSupabase ? createLandmarkClient() : null;
  const format = resolveFormat(options);
  return { mapData, supabase, format, options };
}
