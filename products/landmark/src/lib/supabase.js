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
 * @param {string} [opts.url] - Override for MAP_SUPABASE_URL.
 * @param {string} [opts.anonKey] - Override for MAP_SUPABASE_ANON_KEY.
 * @param {string} [opts.schema] - Database schema (default: "activity").
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createLandmarkClient({
  jwt,
  url = process.env.MAP_SUPABASE_URL,
  anonKey = process.env.MAP_SUPABASE_ANON_KEY,
  schema = "activity",
} = {}) {
  if (!url || !anonKey)
    throw new SupabaseUnavailableError(
      "MAP_SUPABASE_URL / MAP_SUPABASE_ANON_KEY not set. Run `fit-map activity start` and export the URL + anon key it prints.",
    );
  if (!jwt)
    throw new SupabaseUnavailableError(
      "missing JWT — resolveIdentity must run first",
    );
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
