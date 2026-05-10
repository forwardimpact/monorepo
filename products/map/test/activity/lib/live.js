/**
 * Live-Postgres test harness for spec 840.
 *
 * Six new tests need a running Supabase stack (migrate, apply RLS, mint
 * JWTs, exercise the policy matrix). The harness:
 *   - skips when `MAP_SUPABASE_URL` and `MAP_SUPABASE_JWT_SECRET` are unset
 *     (CI runs the suite without booting Supabase)
 *   - applies the RLS migration via `bunx fit-map activity migrate`
 *   - seeds a per-test fixture under the service-role admin client
 *   - tears down by truncating the six RLS'd tables
 *
 * Local invocation:
 *   bunx fit-map activity start && eval "$(bunx fit-map activity status --env)" && bun run test
 */

import { createClient } from "@supabase/supabase-js";

/** Return true when env vars for a running local Supabase stack are set. */
export function isLiveSupabaseAvailable() {
  return Boolean(
    process.env.MAP_SUPABASE_URL && process.env.MAP_SUPABASE_JWT_SECRET,
  );
}

/**
 * Create a service-role-keyed admin client for fixture setup/teardown.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createAdminClient() {
  const url = process.env.MAP_SUPABASE_URL;
  const key = process.env.MAP_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "createAdminClient: MAP_SUPABASE_URL and MAP_SUPABASE_SERVICE_ROLE_KEY required",
    );
  return createClient(url, key, { db: { schema: "activity" } });
}

/**
 * Wrap an async test body in seed→test→truncate.
 *
 * @param {(admin: import("@supabase/supabase-js").SupabaseClient) => Promise<void>} fn
 */
export async function withLiveActivity(fn) {
  const admin = createAdminClient();
  try {
    await fn(admin);
  } finally {
    // Truncate the six RLS'd tables in dependency order.
    const tables = [
      "getdx_snapshot_comments",
      "getdx_snapshot_team_scores",
      "evidence",
      "github_artifacts",
      "getdx_snapshots",
      "organization_people",
    ];
    for (const t of tables) {
      try {
        await admin.from(t).delete().neq("email", "__never__");
      } catch {
        // Last-ditch cleanup; ignore PK shape mismatch.
      }
    }
  }
}
