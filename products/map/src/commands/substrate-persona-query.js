/**
 * Find personas in the seeded substrate that satisfy every spec 990
 * § Persona-corpus invariant. The helper composes the result client-side
 * via chained Supabase JS calls — no Postgres view or RPC, because spec
 * § Out-of-scope forbids changes under `products/map/supabase/migrations/`.
 *
 * Invariants required of a chosen persona row:
 *   (a) IS the manager of at least one other row (manager_email match),
 *       so `org team --manager <persona-email>` returns a non-empty payload.
 *   (b) Has authored at least one evidence row (joined via
 *       github_artifacts → email).
 *   (c) Manages at least one direct who has authored ≥1 evidence row
 *       (practice-pattern proxy: practice --manager <persona-email>
 *       returns ≥1 row).
 *   (d) Corpus carries ≥1 organization snapshot id and ≥1 driver/item id
 *       (the discovery vector).
 */

async function loadDiscovery(supabase) {
  const { data: snaps } = await supabase
    .from("getdx_snapshots")
    .select("snapshot_id, scheduled_for")
    .order("scheduled_for", { ascending: false })
    .limit(1);
  if (!snaps?.length) {
    return { diagnostic: "no getdx_snapshots rows" };
  }
  const snapshot_id = snaps[0].snapshot_id;
  const { data: scores } = await supabase
    .from("getdx_snapshot_team_scores")
    .select("item_id")
    .eq("snapshot_id", snapshot_id)
    .limit(1);
  if (!scores?.length) {
    return {
      diagnostic: `no getdx_snapshot_team_scores for snapshot ${snapshot_id}`,
    };
  }
  return { snapshot_id, item_id: scores[0].item_id };
}

function countDirectsByManager(humans) {
  const m = new Map();
  for (const h of humans) {
    if (!h.manager_email) continue;
    m.set(h.manager_email, (m.get(h.manager_email) ?? 0) + 1);
  }
  return m;
}

async function loadEvidenceCounts(supabase) {
  const { data: artifacts } = await supabase
    .from("github_artifacts")
    .select("artifact_id, email");
  const artifactToEmail = new Map(
    (artifacts ?? []).map((a) => [a.artifact_id, a.email]),
  );
  const { data: ev } = await supabase.from("evidence").select("artifact_id");
  const counts = new Map();
  for (const e of ev ?? []) {
    const email = artifactToEmail.get(e.artifact_id);
    if (!email) continue;
    counts.set(email, (counts.get(email) ?? 0) + 1);
  }
  return counts;
}

function countPracticeDirectsByManager(humans, evidenceCountByEmail) {
  const m = new Map();
  for (const h of humans) {
    if (!h.manager_email) continue;
    if ((evidenceCountByEmail.get(h.email) ?? 0) >= 1) {
      m.set(h.manager_email, (m.get(h.manager_email) ?? 0) + 1);
    }
  }
  return m;
}

function diagnoseBindingConstraint(
  humans,
  directsByManager,
  evidenceCountByEmail,
  practiceCountByManager,
) {
  const counts = {
    manages: humans.filter((h) => (directsByManager.get(h.email) ?? 0) >= 1)
      .length,
    authors_evidence: humans.filter(
      (h) => (evidenceCountByEmail.get(h.email) ?? 0) >= 1,
    ).length,
    practice_directs: humans.filter(
      (h) => (practiceCountByManager.get(h.email) ?? 0) >= 1,
    ).length,
  };
  return Object.entries(counts).sort(([, a], [, b]) => a - b)[0][0];
}

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @returns {Promise<{
 *   personas: Array<object>,
 *   discovery?: { snapshot_id: string, item_id: string },
 *   diagnostic?: string,
 * }>}
 */
export async function findInvariantSatisfyingPersonas({ supabase }) {
  const discovery = await loadDiscovery(supabase);
  if (discovery.diagnostic) {
    return { personas: [], diagnostic: discovery.diagnostic };
  }
  const { snapshot_id, item_id } = discovery;

  const { data: humans } = await supabase
    .from("organization_people")
    .select("email,name,discipline,level,track,manager_email")
    .eq("kind", "human");
  if (!humans?.length) {
    return { personas: [], diagnostic: "no kind=human rows" };
  }

  const directsByManager = countDirectsByManager(humans);
  const evidenceCountByEmail = await loadEvidenceCounts(supabase);
  const practiceCountByManager = countPracticeDirectsByManager(
    humans,
    evidenceCountByEmail,
  );

  const personas = humans
    .filter(
      (h) =>
        (directsByManager.get(h.email) ?? 0) >= 1 &&
        (evidenceCountByEmail.get(h.email) ?? 0) >= 1 &&
        (practiceCountByManager.get(h.email) ?? 0) >= 1,
    )
    .map((h) => ({
      email: h.email,
      name: h.name,
      discipline: h.discipline,
      level: h.level,
      track: h.track,
      manager_email: h.manager_email,
      manages_count: directsByManager.get(h.email) ?? 0,
      evidence_count: evidenceCountByEmail.get(h.email) ?? 0,
      practice_directs_count: practiceCountByManager.get(h.email) ?? 0,
      snapshot_id,
      item_id,
    }));

  if (!personas.length) {
    const binding = diagnoseBindingConstraint(
      humans,
      directsByManager,
      evidenceCountByEmail,
      practiceCountByManager,
    );
    return {
      personas: [],
      diagnostic: `no invariant-satisfying persona — binding constraint: ${binding}`,
    };
  }

  return { personas, discovery: { snapshot_id, item_id } };
}
