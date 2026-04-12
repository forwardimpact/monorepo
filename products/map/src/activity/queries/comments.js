/**
 * Snapshot Comments Queries
 *
 * Query functions for GetDX snapshot comments (engineer voice).
 */

/**
 * Get snapshot comments with optional filters.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Object} [options]
 * @param {string} [options.snapshotId] - Filter by snapshot
 * @param {string} [options.email] - Filter by respondent email
 * @param {string} [options.managerEmail] - Filter to this manager's team
 * @returns {Promise<Array<Object>>} Comments
 */
export async function getSnapshotComments(supabase, options = {}) {
  let query = supabase
    .from("getdx_snapshot_comments")
    .select("*, getdx_snapshots(scheduled_for)")
    .order("timestamp", { ascending: false });

  if (options.snapshotId) {
    query = query.eq("snapshot_id", options.snapshotId);
  }

  if (options.email) {
    query = query.eq("email", options.email);
  }

  if (options.managerEmail) {
    const { data: teams } = await supabase
      .from("getdx_teams")
      .select("getdx_team_id")
      .eq("manager_email", options.managerEmail);
    const teamIds = (teams ?? []).map((t) => t.getdx_team_id);
    if (teamIds.length === 0) return [];
    query = query.in("team_id", teamIds);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
