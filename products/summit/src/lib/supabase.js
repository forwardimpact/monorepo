/**
 * Supabase client factory for Summit.
 *
 * The factory reads the Supabase URL and the service-role key through
 * libconfig. It never reads them directly from process.env. Callers build
 * a Config with `createProductConfig("summit")` in their bin. They pass it
 * through handler options.
 */

/** Signals that the factory could not connect to Supabase because credentials or configuration are missing. */
export class SupabaseUnavailableError extends Error {
  /** Create a SupabaseUnavailableError with the underlying failure reason. */
  constructor(reason) {
    super(`Supabase connection unavailable: ${reason}`);
    this.code = "SUMMIT_SUPABASE_UNAVAILABLE";
  }
}

/**
 * Create a Supabase client for Map's activity schema.
 *
 * @param {object} [opts]
 * @param {object} opts.config - libconfig Config that carries the Supabase
 *   URL and the service-role key.
 * @param {string} [opts.schema] - Database schema (default: "activity").
 * @returns {Promise<import("@supabase/supabase-js").SupabaseClient>}
 */
export async function createSummitClient({ config, schema = "activity" } = {}) {
  if (!config)
    throw new SupabaseUnavailableError(
      "config required. Pass createProductConfig('summit') from the entrypoint",
    );
  let url, key;
  try {
    url = config.supabaseUrl();
    key = config.supabaseServiceRoleKey();
  } catch (err) {
    throw new SupabaseUnavailableError(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set. " +
        "Pass --roster <path> for a file-based roster. " +
        "You can also set the env vars from your Supabase project Settings → API " +
        "(monorepo contributors can run `just env-setup`). " +
        `Underlying: ${err.message}`,
    );
  }

  let createClient;
  try {
    ({ createClient } = await import("@supabase/supabase-js"));
  } catch {
    throw new Error(
      "Supabase features require @supabase/supabase-js. " +
        "Install with: npm install @supabase/supabase-js",
    );
  }

  return createClient(url, key, { db: { schema } });
}
