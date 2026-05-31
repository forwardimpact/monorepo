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
 * @param {object} params.config - libconfig Config for the landmark product.
 * @param {object} params.options - Parsed CLI options.
 * @param {boolean} params.needsSupabase - Whether to open a Supabase client.
 * @param {{email: string, jwt: string}|null} [params.identity] - Resolved caller identity (required when needsSupabase).
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs).
 * @returns {Promise<{mapData: object, supabase: object|null, format: string, options: object, identity: object|null}>}
 */
export async function buildContext({
  dataDir,
  config,
  options,
  needsSupabase,
  identity = null,
  runtime,
}) {
  const mapData = await loadMapData(dataDir, runtime);
  const supabase = needsSupabase
    ? createLandmarkClient({ jwt: identity?.jwt, config })
    : null;
  const format = resolveFormat(options);
  return { mapData, supabase, format, options, identity };
}
