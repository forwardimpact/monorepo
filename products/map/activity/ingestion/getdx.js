/**
 * GetDX Snapshot Ingestion
 *
 * Imports GetDX snapshots, teams, and team scores into activity tables.
 * Bridges GetDX teams to the internal org model via manager_email.
 */

/**
 * @typedef {Object} GetDXConfig
 * @property {string} apiToken - GetDX API token
 * @property {string} baseUrl - GetDX API base URL
 */

/**
 * Fetch JSON from the GetDX API.
 * @param {string} endpoint - API endpoint path
 * @param {GetDXConfig} config - API configuration
 * @returns {Promise<Object>} API response
 */
async function fetchGetDX(endpoint, config) {
  const url = new URL(endpoint, config.baseUrl);
  const response = await fetch(url.href, {
    headers: { Authorization: `Bearer ${config.apiToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `GetDX API ${endpoint}: ${response.status} ${response.statusText}`,
    );
  }
  return response.json();
}

/**
 * Import GetDX team catalog into activity.getdx_teams.
 * Populates manager_email by matching manager_id → reference_id → email.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {GetDXConfig} config - GetDX API config
 * @returns {Promise<{imported: number, errors: Array<string>}>}
 */
export async function importTeams(supabase, config) {
  const { teams } = await fetchGetDX("/teams.list", config);

  // Build reference_id → email lookup from org people
  const { data: people } = await supabase
    .from("organization_people")
    .select("email, name");
  const emailByName = new Map(people?.map((p) => [p.name, p.email]) || []);

  const rows = teams.map((team) => ({
    getdx_team_id: team.id,
    name: team.name,
    parent_id: team.parent_id || null,
    manager_id: team.manager_id || null,
    reference_id: team.reference_id || null,
    manager_email: team.manager_name
      ? emailByName.get(team.manager_name) || null
      : null,
    ancestors: team.ancestors || null,
    contributors: team.contributors ?? null,
    last_changed_at: team.last_changed_at || null,
    raw: team,
  }));

  const { error } = await supabase
    .from("getdx_teams")
    .upsert(rows, { onConflict: "getdx_team_id" });

  if (error) {
    return { imported: 0, errors: [error.message] };
  }
  return { imported: rows.length, errors: [] };
}

/**
 * Import GetDX snapshots and their team scores.
 * Fetches snapshot list, diffs against known snapshots, and imports new ones.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {GetDXConfig} config - GetDX API config
 * @returns {Promise<{snapshots: number, scores: number, errors: Array<string>}>}
 */
export async function importSnapshots(supabase, config) {
  const errors = [];

  // Get known snapshots
  const { data: known } = await supabase
    .from("getdx_snapshots")
    .select("snapshot_id, last_result_change_at");
  const knownMap = new Map(
    known?.map((s) => [s.snapshot_id, s.last_result_change_at]) || [],
  );

  // Fetch snapshot list from GetDX
  const { snapshots } = await fetchGetDX("/snapshots.list", config);

  // Find new or updated snapshots, skipping deleted ones
  const toImport = snapshots.filter((s) => {
    if (s.deleted_at) return false;
    const existing = knownMap.get(s.id);
    return !existing || existing !== s.last_result_change_at;
  });

  let snapshotCount = 0;
  let scoreCount = 0;

  for (const snapshot of toImport) {
    // Fetch full snapshot details — response is { ok, snapshot: { team_scores } }
    const detail = await fetchGetDX(
      `/snapshots.info?snapshot_id=${encodeURIComponent(snapshot.id)}`,
      config,
    );

    // Upsert snapshot metadata (sourced from snapshots.list response)
    const { error: snapError } = await supabase.from("getdx_snapshots").upsert(
      {
        snapshot_id: snapshot.id,
        account_id: snapshot.account_id || null,
        scheduled_for: snapshot.scheduled_for || null,
        completed_at: snapshot.completed_at || null,
        completed_count: snapshot.completed_count ?? null,
        total_count: snapshot.total_count ?? null,
        last_result_change_at: snapshot.last_result_change_at || null,
        raw: snapshot,
      },
      { onConflict: "snapshot_id" },
    );

    if (snapError) {
      errors.push(`Snapshot ${snapshot.id}: ${snapError.message}`);
      continue;
    }
    snapshotCount++;

    // Import team scores — each entry is a flat score record with nested snapshot_team
    const teamScores = detail.snapshot?.team_scores || [];
    const scoreRows = teamScores.map((entry) => ({
      snapshot_id: snapshot.id,
      getdx_team_id: entry.snapshot_team?.team_id || null,
      item_id: entry.item_id,
      item_type: entry.item_type || null,
      item_name: entry.item_name || null,
      response_count: entry.response_count ?? null,
      contributor_count: entry.contributor_count ?? null,
      score: entry.score ?? null,
      vs_prev: entry.vs_prev ?? null,
      vs_org: entry.vs_org ?? null,
      vs_50th: entry.vs_50th ?? null,
      vs_75th: entry.vs_75th ?? null,
      vs_90th: entry.vs_90th ?? null,
      snapshot_team: entry.snapshot_team || null,
      raw: entry,
    }));

    if (scoreRows.length > 0) {
      const { error: scoreError } = await supabase
        .from("getdx_snapshot_team_scores")
        .insert(scoreRows);

      if (scoreError) {
        errors.push(
          `Scores for snapshot ${snapshot.id}: ${scoreError.message}`,
        );
      } else {
        scoreCount += scoreRows.length;
      }
    }
  }

  return { snapshots: snapshotCount, scores: scoreCount, errors };
}

/**
 * Run full GetDX import: teams then snapshots.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase - Supabase client
 * @param {GetDXConfig} config - GetDX API config
 * @returns {Promise<{teams: number, snapshots: number, scores: number, errors: Array<string>}>}
 */
export async function importGetDX(supabase, config) {
  const teamResult = await importTeams(supabase, config);
  const snapshotResult = await importSnapshots(supabase, config);

  return {
    teams: teamResult.imported,
    snapshots: snapshotResult.snapshots,
    scores: snapshotResult.scores,
    errors: [...teamResult.errors, ...snapshotResult.errors],
  };
}
