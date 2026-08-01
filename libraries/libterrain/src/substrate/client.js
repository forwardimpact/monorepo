/**
 * Supabase client factory for the substrate verbs. It is the only
 * construction site. It binds `db.schema` to the contract's `substrate`
 * schema. Every query in this module tree then reads contract relations. No
 * query reads a vendor table that happens to share a name (map's
 * `activity.evidence` is the standing example).
 */

import { createClient } from "@supabase/supabase-js";
import { SUBSTRATE_CONTRACT } from "./contract.js";

/**
 * Create a service-role Supabase client bound to the `substrate` schema.
 *
 * @param {object} params
 * @param {{supabaseUrl: () => string, supabaseServiceRoleKey: () => string}} params.config
 *   libconfig accessor bag (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
 * @param {typeof createClient} [params.createClientFn] - Tests inject this.
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
