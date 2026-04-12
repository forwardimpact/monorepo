/**
 * GetDX Transform
 *
 * Reads stored GetDX API response documents from Supabase Storage and produces
 * structured rows in getdx_snapshots, getdx_teams, and
 * getdx_snapshot_team_scores tables.
 * Idempotent where possible (upsert on teams and snapshots, insert on scores).
 */

import { readRaw, listRaw } from "../storage.js";

/**
 * Transform stored GetDX API responses into DB rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{teams: number, snapshots: number, scores: number, errors: Array<string>}>}
 */
export async function transformAllGetDX(supabase) {
  const errors = [];
  let teamCount = 0;
  let snapshotCount = 0;
  let scoreCount = 0;

  // Transform teams from the most recent teams-list document
  const teamsFiles = await listRaw(supabase, "getdx/teams-list/");
  if (teamsFiles.length > 0) {
    const latestTeams = `getdx/teams-list/${teamsFiles[0].name}`;
    const teamsResult = await transformTeams(supabase, latestTeams);
    teamCount = teamsResult.imported;
    errors.push(...teamsResult.errors);
  }

  // Transform snapshots from the most recent snapshots-list document
  const snapshotsFiles = await listRaw(supabase, "getdx/snapshots-list/");
  if (snapshotsFiles.length > 0) {
    const latestSnapshots = `getdx/snapshots-list/${snapshotsFiles[0].name}`;
    const snapshotsResult = await transformSnapshots(supabase, latestSnapshots);
    snapshotCount = snapshotsResult.snapshots;
    errors.push(...snapshotsResult.errors);
  }

  // Transform team scores from all snapshots-info documents
  const infoFiles = await listRaw(supabase, "getdx/snapshots-info/");
  for (const file of infoFiles) {
    const scoresResult = await transformSnapshotScores(
      supabase,
      `getdx/snapshots-info/${file.name}`,
    );
    scoreCount += scoresResult.scores;
    errors.push(...scoresResult.errors);
  }

  // Transform snapshot comments
  let commentCount = 0;
  const commentsFiles = await listRaw(supabase, "getdx/snapshots-comments/");
  for (const file of commentsFiles) {
    const commentsResult = await transformSnapshotComments(
      supabase,
      `getdx/snapshots-comments/${file.name}`,
    );
    commentCount += commentsResult.comments;
    errors.push(...commentsResult.errors);
  }

  // Transform initiatives from the most recent initiatives-list document
  let initiativeCount = 0;
  const initiativesFiles = await listRaw(supabase, "getdx/initiatives-list/");
  if (initiativesFiles.length > 0) {
    const latestInitiatives = `getdx/initiatives-list/${initiativesFiles[0].name}`;
    const initiativesResult = await transformInitiatives(
      supabase,
      latestInitiatives,
    );
    initiativeCount = initiativesResult.initiatives;
    errors.push(...initiativesResult.errors);
  }

  return {
    teams: teamCount,
    snapshots: snapshotCount,
    scores: scoreCount,
    comments: commentCount,
    initiatives: initiativeCount,
    errors,
  };
}

/**
 * Transform a stored teams-list document into getdx_teams rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path
 * @returns {Promise<{imported: number, errors: Array<string>}>}
 */
async function transformTeams(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path));
  const teams = raw.teams || [];

  // Build name → email lookup from org people
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

  if (error) return { imported: 0, errors: [error.message] };
  return { imported: rows.length, errors: [] };
}

/**
 * Transform a stored snapshots-list document into getdx_snapshots rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path
 * @returns {Promise<{snapshots: number, errors: Array<string>}>}
 */
async function transformSnapshots(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path));
  const snapshots = (raw.snapshots || []).filter((s) => !s.deleted_at);
  const errors = [];
  let count = 0;

  for (const snapshot of snapshots) {
    const { error } = await supabase.from("getdx_snapshots").upsert(
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

    if (error) errors.push(`Snapshot ${snapshot.id}: ${error.message}`);
    else count++;
  }

  return { snapshots: count, errors };
}

/**
 * Transform a stored snapshots-info document into getdx_snapshot_team_scores rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path
 * @returns {Promise<{scores: number, errors: Array<string>}>}
 */
async function transformSnapshotScores(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path));
  const teamScores = raw.snapshot?.team_scores || [];
  const errors = [];

  // Derive snapshot_id from the path (filename is {snapshot_id}.json)
  const snapshotId = path.split("/").pop().replace(".json", "");

  const scoreRows = teamScores.map((entry) => ({
    snapshot_id: snapshotId,
    getdx_team_id: entry.snapshot_team?.team_id || "unknown",
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
    const { error } = await supabase
      .from("getdx_snapshot_team_scores")
      .upsert(scoreRows, {
        onConflict: "snapshot_id,getdx_team_id,item_id",
      });

    if (error) {
      errors.push(`Scores for ${snapshotId}: ${error.message}`);
      return { scores: 0, errors };
    }
  }

  return { scores: scoreRows.length, errors };
}

/**
 * Transform a stored snapshots-comments document into getdx_snapshot_comments rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path
 * @returns {Promise<{comments: number, errors: Array<string>}>}
 */
async function transformSnapshotComments(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path));
  const comments = raw.comments || [];
  const errors = [];

  // Derive snapshot_id from the path (filename is {snapshot_id}.json)
  const snapshotId = path.split("/").pop().replace(".json", "");

  // Build email → team lookup
  const { data: people } = await supabase
    .from("organization_people")
    .select("email, manager_email");
  const managerByEmail = new Map(
    (people || []).map((p) => [p.email, p.manager_email]),
  );

  const { data: teams } = await supabase
    .from("getdx_teams")
    .select("getdx_team_id, manager_email");
  const teamByManager = new Map(
    (teams || []).map((t) => [t.manager_email, t.getdx_team_id]),
  );

  const rows = comments.map((comment) => {
    const email = comment.email || null;
    const commentId =
      comment.id ||
      `${snapshotId}::${email ?? "anon"}::${comment.timestamp ?? Date.now()}`;

    // Derive team_id from email → manager → team
    let teamId = null;
    if (email) {
      const managerEmail = managerByEmail.get(email);
      if (managerEmail) {
        teamId = teamByManager.get(managerEmail) || null;
      }
    }

    return {
      comment_id: commentId,
      snapshot_id: snapshotId,
      email,
      team_id: teamId,
      text: comment.text || "",
      timestamp: comment.timestamp || new Date().toISOString(),
      raw: comment,
    };
  });

  if (rows.length > 0) {
    const { error } = await supabase
      .from("getdx_snapshot_comments")
      .upsert(rows, { onConflict: "comment_id" });

    if (error) {
      errors.push(`Comments for ${snapshotId}: ${error.message}`);
      return { comments: 0, errors };
    }
  }

  return { comments: rows.length, errors };
}

/**
 * Transform a stored initiatives-list document into getdx_initiatives rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path
 * @returns {Promise<{initiatives: number, errors: Array<string>}>}
 */
async function transformInitiatives(supabase, path) {
  const raw = JSON.parse(await readRaw(supabase, path));
  const initiatives = raw.initiatives || [];
  const errors = [];

  const rows = initiatives.map(buildInitiativeRow);

  if (rows.length > 0) {
    // Use raw upsert — Supabase JS doesn't support COALESCE in upsert,
    // so we preserve completed_at by checking client-side.
    for (const row of rows) {
      const { data: existing } = await supabase
        .from("getdx_initiatives")
        .select("completed_at")
        .eq("id", row.id)
        .maybeSingle();

      // Preserve earliest completed_at
      if (existing?.completed_at) {
        row.completed_at = existing.completed_at;
      }

      const { error } = await supabase
        .from("getdx_initiatives")
        .upsert(row, { onConflict: "id" });

      if (error) {
        errors.push(`Initiative ${row.id}: ${error.message}`);
      }
    }
  }

  return { initiatives: rows.length - errors.length, errors };
}

/** Derive completed_at from raw initiative data. */
function deriveCompletedAt(init) {
  if (init.completed_at) return init.completed_at;
  const allPassed =
    init.passed_checks != null &&
    init.total_checks != null &&
    init.passed_checks === init.total_checks &&
    init.total_checks > 0;
  return allPassed ? new Date().toISOString() : null;
}

/** Build a database row from a raw GetDX initiative object. */
function buildInitiativeRow(init) {
  return {
    id: init.id,
    name: init.name || "(unnamed)",
    description: init.description || null,
    scorecard_id: init.scorecard_id || null,
    owner_email: init.owner_email || null,
    due_date: init.due_date || null,
    priority: init.priority || null,
    passed_checks: init.passed_checks ?? null,
    total_checks: init.total_checks ?? null,
    completion_pct: init.completion_pct ?? null,
    tags: init.tags || null,
    completed_at: deriveCompletedAt(init),
    raw: init,
  };
}
