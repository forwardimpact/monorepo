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
 * @param {{email: string, jwt: string}|null} [params.identity] - Resolved caller identity (required when needsSupabase).
 * @returns {Promise<{mapData: object, supabase: object|null, format: string, options: object, identity: object|null}>}
 */
export async function buildContext({
  dataDir,
  options,
  needsSupabase,
  identity = null,
}) {
  const mapData = await loadMapData(dataDir);
  const supabase = needsSupabase
    ? createLandmarkClient({ jwt: identity?.jwt })
    : null;
  const format = resolveFormat(options);
  return { mapData, supabase, format, options, identity };
}
