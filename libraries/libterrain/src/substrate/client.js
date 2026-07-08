/**
 * Supabase client factory for the substrate verbs — the only construction
 * site. Binding `db.schema` to the contract's `substrate` schema here means
 * every query in this module tree reads contract relations, never a vendor
 * table that happens to share a name (map's `activity.evidence` is the
 * standing example).
 */

import { createClient } from "@supabase/supabase-js";
import { SUBSTRATE_CONTRACT } from "./contract.js";

/**
 * Create a service-role Supabase client bound to the `substrate` schema.
 *
 * @param {object} params
 * @param {{supabaseUrl: () => string, supabaseServiceRoleKey: () => string}} params.config
 *   libconfig accessor bag (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
 * @param {typeof createClient} [params.createClientFn] - Injected for tests.
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createSubstrateClient({
  config,
  createClientFn = createClient,
}) {
  if (!config) throw new Error("createSubstrateClient: config required");
  return createClientFn(config.supabaseUrl(), config.supabaseServiceRoleKey(), {
    db: { schema: SUBSTRATE_CONTRACT.schema },
  });
}
