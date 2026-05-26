/**
 * Live-Postgres test harness for the RLS policy suite.
 *
 * Tests need a running Supabase stack (migrate, apply RLS, mint JWTs,
 * exercise the policy matrix). The harness:
 *   - skips when `SUPABASE_URL` and `SUPABASE_JWT_SECRET` are unset
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
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_JWT_SECRET);
}

/**
 * Create a service-role-keyed admin client for fixture setup/teardown.
 *
 * @returns {import("@supabase/supabase-js").SupabaseClient}
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "createAdminClient: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required",
    );
  return createClient(url, key, { db: { schema: "activity" } });
}

// Each RLS'd table is truncated by deleting rows that do not match a PK
// sentinel — the sentinel column varies per table because not every table
// has an `email` column. Using a per-table identity column avoids the
// "filter column does not exist" failure mode the panel flagged.
const TABLE_PK_SENTINEL = [
  {
    table: "getdx_snapshot_comments",
    column: "comment_id",
    value: "__never__",
  },
  {
    table: "getdx_snapshot_team_scores",
    column: "snapshot_id",
    value: "__never__",
  },
  { table: "evidence", column: "artifact_id", value: "__never__" },
  { table: "github_artifacts", column: "artifact_id", value: "__never__" },
  { table: "getdx_snapshots", column: "snapshot_id", value: "__never__" },
  { table: "organization_people", column: "email", value: "__never__" },
];

let migrationApplied = false;

async function ensureMigrationApplied() {
  if (migrationApplied) return;
  // Skip the per-test migrate cost when the harness has already run it
  // once in this process. Local invocation flow:
  //   bunx fit-map activity start
  //   bunx fit-map activity migrate
  //   bun run test
  // — so the migrate command is idempotent and cheap to skip.
  const { migrate } = await import("../../../src/commands/activity.js");
  await migrate();
  migrationApplied = true;
}

// Team sentinels used by tests that seed organization_people with a
// non-null `getdx_team_id`. organization_people's FK to getdx_teams is
// strict (no `MATCH SIMPLE` escape hatch), so without these rows the
// inserts fail silently under the admin client and downstream RLS reads
// see an empty fixture — masquerading as a scope-clamp bug. The four
// ids are upserted once per process and survive the per-test teardown
// (getdx_teams is not in TABLE_PK_SENTINEL).
const TEAM_SENTINELS = ["t", "t2", "team-1", "team-2"];

async function ensureTeamSentinelsSeeded(admin) {
  await admin.from("getdx_teams").upsert(
    TEAM_SENTINELS.map((id) => ({
      getdx_team_id: id,
      name: `test sentinel ${id}`,
      raw: {},
    })),
    { onConflict: "getdx_team_id" },
  );
}

/**
 * Wrap an async test body in (lazy migrate)→seed→test→truncate.
 *
 * @param {(admin: import("@supabase/supabase-js").SupabaseClient) => Promise<void>} fn
 */
export async function withLiveActivity(fn) {
  await ensureMigrationApplied();
  const admin = createAdminClient();
  await ensureTeamSentinelsSeeded(admin);
  try {
    await fn(admin);
  } finally {
    for (const { table, column, value } of TABLE_PK_SENTINEL) {
      try {
        await admin.from(table).delete().neq(column, value);
      } catch {
        // Last-ditch cleanup; ignore PK shape mismatch.
      }
    }
  }
}
