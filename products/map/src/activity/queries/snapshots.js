/**
 * Snapshot Queries
 *
 * Query functions for GetDX snapshots and team scores.
 */

/**
 * List all snapshots in scheduled_for order (most recent first).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @returns {Promise<Array<Object>>} Snapshots
 */
export async function listSnapshots(supabase) {
  const { data, error } = await supabase
    .from("getdx_snapshots")
    .select("*")
    .order("scheduled_for", { ascending: false });

  if (error) throw new Error(`listSnapshots: ${error.message}`);
  return data;
}

/**
 * Get team scores for a snapshot, with an optional filter for a manager's
 * team.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} snapshotId - Snapshot ID
 * @param {Object} [options]
 * @param {string} [options.managerEmail] - Filter to this manager's GetDX team
 * @returns {Promise<Array<Object>>} Team scores
 */
export async function getSnapshotScores(supabase, snapshotId, options = {}) {
  let query = supabase
    .from("getdx_snapshot_team_scores")
    .select("*")
    .eq("snapshot_id", snapshotId);

  if (options.managerEmail) {
    const { data: team } = await supabase.rpc("get_team", {
      root_email: options.managerEmail,
    });
    const emails = (team || []).map((p) => p.email);
    const { data: people } = await supabase
      .from("organization_people")
      .select("getdx_team_id")
      .in("email", emails)
      .not("getdx_team_id", "is", null);
    const teamIds = [...new Set((people || []).map((p) => p.getdx_team_id))];
    if (teamIds.length === 0) return [];
    query = query.in("getdx_team_id", teamIds);
  }

  const { data, error } = await query.order("item_id");

  if (error) throw new Error(`getSnapshotScores: ${error.message}`);
  return data;
}

/**
 * Get score trajectory for an item (driver) across snapshots.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} itemId - Driver/item ID
 * @param {Object} [options]
 * @param {string} [options.managerEmail] - Filter to this manager's GetDX team
 * @returns {Promise<Array<Object>>} Scores across snapshots in scheduled_for order
 */
export async function getItemTrend(supabase, itemId, options = {}) {
  let query = supabase
    .from("getdx_snapshot_team_scores")
    .select("*, getdx_snapshots!inner(scheduled_for)")
    .eq("item_id", itemId);

  if (options.managerEmail) {
    const { data: team } = await supabase.rpc("get_team", {
      root_email: options.managerEmail,
    });
    const emails = (team || []).map((p) => p.email);
    const { data: people } = await supabase
      .from("organization_people")
      .select("getdx_team_id")
      .in("email", emails)
      .not("getdx_team_id", "is", null);
    const teamIds = [...new Set((people || []).map((p) => p.getdx_team_id))];
    if (teamIds.length === 0) return [];
    query = query.in("getdx_team_id", teamIds);
  }

  const { data, error } = await query.order("getdx_snapshots(scheduled_for)", {
    ascending: true,
  });

  if (error) throw new Error(`getItemTrend: ${error.message}`);
  return data;
}

/**
 * Get scores with comparative metrics for a snapshot.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {string} snapshotId - Snapshot ID
 * @param {Object} [options]
 * @param {string} [options.managerEmail] - Filter to this manager's GetDX team
 * @returns {Promise<Array<Object>>} Scores with vs_prev, vs_org, vs_50th, vs_75th, vs_90th
 */
export async function getSnapshotComparison(
  supabase,
  snapshotId,
  options = {},
) {
  // Reuse getSnapshotScores. The table already includes comparative fields
  return getSnapshotScores(supabase, snapshotId, options);
}
