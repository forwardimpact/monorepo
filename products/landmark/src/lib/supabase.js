/**
 * Supabase client factory for Landmark.
 *
 * Mirrors the env-var contract used by Summit's createSummitClient.
 */

import { createClient } from "@supabase/supabase-js";

export class SupabaseUnavailableError extends Error {
  constructor(reason) {
    super(`Supabase connection unavailable: ${reason}`);
    this.code = "LANDMARK_SUPABASE_UNAVAILABLE";
  }
}

/**
 * Create a Supabase client configured for Map's activity schema.
 *
 * @param {object} [opts]
 * @param {string} [opts.url] - Override for MAP_SUPABASE_URL.
 * @param {string} [opts.serviceRoleKey] - Override for MAP_SUPABASE_SERVICE_ROLE_KEY.
 * @param {string} [opts.schema] - Database schema (default: "activity").
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createLandmarkClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const key = opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url || !key) {
    throw new SupabaseUnavailableError(
      "MAP_SUPABASE_URL / MAP_SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Run `fit-map activity start` and export the URL + key it prints.",
    );
  }

  return createClient(url, key, { db: { schema } });
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
