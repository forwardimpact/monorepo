/**
 * Shared setup of the Supabase client for fit-map CLI commands.
 *
 * The client reads the Supabase URL and service-role key from libconfig.
 * It never reads them directly from process.env. Callers build a Config
 * with `createProductConfig("map")` in their bin and pass it through.
 */

import { createClient } from "@supabase/supabase-js";

/** Create a Supabase client configured for the activity schema. */
export function createMapClient({ config, schema = "activity" } = {}) {
  if (!config) throw new Error("createMapClient: config required");
  return createClient(config.supabaseUrl(), config.supabaseServiceRoleKey(), {
    db: { schema },
  });
}
