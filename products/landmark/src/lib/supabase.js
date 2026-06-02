/**
 * Supabase client factory for Landmark.
 *
 * Landmark reads via the per-caller JWT minted under Supabase Auth — never
 * the service-role key (criterion 3a). The service-role client lives only
 * under products/map/src/ for ingestion.
 */

import { createClient } from "@supabase/supabase-js";

/** Error thrown when Supabase connection cannot be established due to missing configuration. */
export class SupabaseUnavailableError extends Error {
  /** Wrap the reason in a prefixed message ("Supabase connection unavailable: <reason>") and attach code "LANDMARK_SUPABASE_UNAVAILABLE". */
  constructor(reason) {
    super(`Supabase connection unavailable: ${reason}`);
    this.code = "LANDMARK_SUPABASE_UNAVAILABLE";
  }
}

/**
 * Create a Supabase client bound to the caller's JWT.
 *
 * @param {object} opts
 * @param {string} opts.jwt - Supabase Auth JWT; transports as Authorization: Bearer.
 * @param {{supabaseUrl: () => string, supabaseAnonKey: () => string}} opts.config - libconfig Config providing the Supabase URL and anon key.
 * @param {string} [opts.schema] - Database schema (default: "activity").
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createLandmarkClient({
  jwt,
  config,
  schema = "activity",
} = {}) {
  if (!config)
    throw new SupabaseUnavailableError(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set. " +
        "Copy them from your Supabase project Settings → API " +
        "(or, for monorepo contributors, run `just env-setup`).",
    );
  if (!jwt)
    throw new SupabaseUnavailableError(
      "missing JWT — resolveIdentity must run first",
    );
  let url, anonKey;
  try {
    url = config.supabaseUrl();
    anonKey = config.supabaseAnonKey();
  } catch (err) {
    throw new SupabaseUnavailableError(
      "SUPABASE_URL and SUPABASE_ANON_KEY must be set. " +
        "Copy them from your Supabase project Settings → API " +
        "(or, for monorepo contributors, run `just env-setup`). " +
        `Underlying: ${err.message}`,
    );
  }
  return createClient(url, anonKey, {
    db: { schema },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

/**
 * Check if an error is a Postgres "relation not found" error (42P01).
 * Used to detect missing tables gracefully.
 *
 * @param {Error} err
 * @returns {boolean}
 */
export function isRelationNotFoundError(err) {
  return err?.code === "42P01" || err?.message?.includes("42P01");
}
