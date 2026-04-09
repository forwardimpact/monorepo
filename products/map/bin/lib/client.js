/**
 * Shared Supabase client wiring for fit-map CLI commands.
 *
 * Reads MAP_SUPABASE_URL and MAP_SUPABASE_SERVICE_ROLE_KEY from env or
 * from explicit options. Throws with a clear message pointing at the
 * activity start output when either is missing.
 */

import { createClient } from "@supabase/supabase-js";

export function createMapClient(opts = {}) {
  const url = opts.url ?? process.env.MAP_SUPABASE_URL;
  const serviceRoleKey =
    opts.serviceRoleKey ?? process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  const schema = opts.schema ?? "activity";

  if (!url) {
    throw new Error(
      "MAP_SUPABASE_URL is not set. Run `fit-map activity start` and " +
        "export the URL it prints.",
    );
  }
  if (!serviceRoleKey) {
    throw new Error(
      "MAP_SUPABASE_SERVICE_ROLE_KEY is not set. Run `fit-map activity " +
        "start` and export the service-role key it prints.",
    );
  }

  return createClient(url, serviceRoleKey, { db: { schema } });
}
