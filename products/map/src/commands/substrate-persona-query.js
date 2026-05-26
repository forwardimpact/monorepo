/**
 * Find personas in the seeded substrate that satisfy every persona-corpus
 * invariant. The helper composes the result client-side via chained Supabase
 * JS calls — no Postgres view or RPC, because changes under
 * `products/map/supabase/migrations/` are out of scope.
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
 *   Plus: the row's own `manager_email` is non-null, so every roster row
 *   carries an org-tree parent (no top-of-tree rows leak through the
 *   operator surface as `parent_email: null`).
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
  // parent_email_known is listed first so it wins ties: when no human has
  // a parent, every downstream constraint that depends on manager_email
  // also reads 0, and the parent_email_known filter is the binding root.
  const counts = {
    parent_email_known: humans.filter((h) => h.manager_email != null).length,
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

async function loadTeamsById(supabase) {
  const { data: teams } = await supabase
    .from("getdx_teams")
    .select("getdx_team_id,name");
  return new Map((teams ?? []).map((t) => [t.getdx_team_id, { name: t.name }]));
}

function peerProjection(p) {
  return {
    email: p.email,
    name: p.name,
    github_username: p.github_username,
    level: p.level,
  };
}

function buildPeerMaps(humans) {
  const peopleByEmail = new Map();
  const peersByTeamId = new Map();
  for (const h of humans) {
    peopleByEmail.set(h.email, h);
    if (h.getdx_team_id == null) continue;
    const arr = peersByTeamId.get(h.getdx_team_id) ?? [];
    arr.push(h);
    peersByTeamId.set(h.getdx_team_id, arr);
  }
  for (const [id, arr] of peersByTeamId) {
    arr.sort((a, b) => (a.email < b.email ? -1 : a.email > b.email ? 1 : 0));
    peersByTeamId.set(id, arr);
  }
  return { peopleByEmail, peersByTeamId };
}

function buildPersonaRow(
  h,
  {
    teamsById,
    peopleByEmail,
    peersByTeamId,
    directsByManager,
    evidenceCountByEmail,
    practiceCountByManager,
    snapshot_id,
    item_id,
  },
) {
  const allPeers = (peersByTeamId.get(h.getdx_team_id) ?? []).filter(
    (p) => p.email !== h.email,
  );
  const parentRow = peopleByEmail.get(h.manager_email);
  return {
    email: h.email,
    name: h.name,
    github_username: h.github_username,
    discipline: h.discipline,
    level: h.level,
    track: h.track,
    parent_email: h.manager_email,
    getdx_team_id: h.getdx_team_id,
    team_name: teamsById.get(h.getdx_team_id)?.name ?? null,
    parent: parentRow ? peerProjection(parentRow) : null,
    teammates: allPeers.slice(0, 3).map(peerProjection),
    teammates_truncated: allPeers.length > 3,
    manages_count: directsByManager.get(h.email) ?? 0,
    evidence_count: evidenceCountByEmail.get(h.email) ?? 0,
    practice_directs_count: practiceCountByManager.get(h.email) ?? 0,
    snapshot_id,
    item_id,
  };
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
    .select(
      "email,name,github_username,discipline,level,track,manager_email,getdx_team_id",
    )
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
  const teamsById = await loadTeamsById(supabase);
  const { peopleByEmail, peersByTeamId } = buildPeerMaps(humans);

  const personas = humans
    .filter(
      (h) =>
        (h.manager_email ?? null) !== null &&
        (directsByManager.get(h.email) ?? 0) >= 1 &&
        (evidenceCountByEmail.get(h.email) ?? 0) >= 1 &&
        (practiceCountByManager.get(h.email) ?? 0) >= 1,
    )
    .map((h) =>
      buildPersonaRow(h, {
        teamsById,
        peopleByEmail,
        peersByTeamId,
        directsByManager,
        evidenceCountByEmail,
        practiceCountByManager,
        snapshot_id,
        item_id,
      }),
    );

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
