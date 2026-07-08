/**
 * Find personas in a contract-conforming substrate that satisfy every
 * applicable persona invariant. Queries only Substrate Contract relations
 * (`substrate.people`, `substrate.evidence`, `substrate.discovery`) through
 * a client bound to the `substrate` schema; the helper composes the result
 * client-side via chained Supabase JS calls.
 *
 * Invariant sets, applied by what the consumer implements:
 *   structural (always) —
 *     (a) the row's own `manager_email` is non-null, so every persona
 *         carries an org-tree parent, and
 *     (b) the row IS the manager of ≥1 other row (manager_email match).
 *   evidence (when `substrate.evidence` exists) —
 *     (c) the row authored ≥1 evidence row, and
 *     (d) manages ≥1 direct who authored ≥1 evidence row (practice proxy).
 *
 * Absent optional relations degrade declaredly, never silently: the return
 * value's `applied_invariants` names the sets that ran, and `discovery` is
 * `null` when `substrate.discovery` is absent or empty.
 */

/** PostgREST/Postgres error codes meaning "relation does not exist". */
const RELATION_ABSENT_CODES = new Set(["PGRST205", "42P01"]);

function isRelationAbsent(error) {
  return Boolean(error && RELATION_ABSENT_CODES.has(error.code));
}

/**
 * Fold `substrate.discovery` key/value rows into one object (e.g.
 * `{snapshot_id, item_id}`). Returns `null` when the relation is absent or
 * empty — the consumer declared no discovery vector. Any other query error
 * propagates.
 *
 * Shared with `substrate issue`, which copies the folded object into
 * `.substrate.json`.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<Record<string, string>|null>}
 */
export async function loadDiscovery(supabase) {
  const { data, error } = await supabase.from("discovery").select("key,value");
  if (error) {
    if (isRelationAbsent(error)) return null;
    throw new Error(`substrate.discovery: ${error.message}`);
  }
  if (!data?.length) return null;
  const folded = {};
  for (const row of data) folded[row.key] = row.value;
  return folded;
}

/**
 * Count evidence rows per author email from `substrate.evidence`. Returns
 * `null` when the relation is absent — the evidence invariants do not apply.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<Map<string, number>|null>}
 */
async function loadEvidenceCounts(supabase) {
  const { data, error } = await supabase.from("evidence").select("email");
  if (error) {
    if (isRelationAbsent(error)) return null;
    throw new Error(`substrate.evidence: ${error.message}`);
  }
  const counts = new Map();
  for (const row of data ?? []) {
    if (!row.email) continue;
    counts.set(row.email, (counts.get(row.email) ?? 0) + 1);
  }
  return counts;
}

function countDirectsByManager(humans) {
  const m = new Map();
  for (const h of humans) {
    if (!h.manager_email) continue;
    m.set(h.manager_email, (m.get(h.manager_email) ?? 0) + 1);
  }
  return m;
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
  };
  if (evidenceCountByEmail) {
    counts.authors_evidence = humans.filter(
      (h) => (evidenceCountByEmail.get(h.email) ?? 0) >= 1,
    ).length;
    counts.practice_directs = humans.filter(
      (h) => (practiceCountByManager.get(h.email) ?? 0) >= 1,
    ).length;
  }
  return Object.entries(counts).sort(([, a], [, b]) => a - b)[0][0];
}

function peerProjection(p) {
  return { email: p.email, name: p.name, level: p.level };
}

function buildPeerMaps(humans) {
  const peopleByEmail = new Map();
  const peersByTeamId = new Map();
  for (const h of humans) {
    peopleByEmail.set(h.email, h);
    if (h.team_id == null) continue;
    const arr = peersByTeamId.get(h.team_id) ?? [];
    arr.push(h);
    peersByTeamId.set(h.team_id, arr);
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
    peopleByEmail,
    peersByTeamId,
    directsByManager,
    evidenceCountByEmail,
    practiceCountByManager,
  },
) {
  const allPeers = (peersByTeamId.get(h.team_id) ?? []).filter(
    (p) => p.email !== h.email,
  );
  const parentRow = peopleByEmail.get(h.manager_email);
  return {
    email: h.email,
    name: h.name,
    discipline: h.discipline,
    level: h.level,
    track: h.track,
    parent_email: h.manager_email,
    team_id: h.team_id,
    team_name: h.team_name ?? null,
    parent: parentRow ? peerProjection(parentRow) : null,
    teammates: allPeers.slice(0, 3).map(peerProjection),
    teammates_truncated: allPeers.length > 3,
    manages_count: directsByManager.get(h.email) ?? 0,
    evidence_count: evidenceCountByEmail?.get(h.email) ?? 0,
    practice_directs_count: practiceCountByManager?.get(h.email) ?? 0,
  };
}

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Client bound to the `substrate` schema.
 * @returns {Promise<{
 *   personas: Array<object>,
 *   discovery: Record<string, string>|null,
 *   applied_invariants: string[],
 *   diagnostic?: string,
 * }>}
 */
export async function findInvariantSatisfyingPersonas({ supabase }) {
  const { data: humans, error } = await supabase
    .from("people")
    .select(
      "email,name,kind,manager_email,team_id,team_name,discipline,level,track",
    )
    .eq("kind", "human");
  if (error) throw new Error(`substrate.people: ${error.message}`);

  const evidenceCountByEmail = await loadEvidenceCounts(supabase);
  const discovery = await loadDiscovery(supabase);
  const applied_invariants = evidenceCountByEmail
    ? ["structural", "evidence"]
    : ["structural"];

  if (!humans?.length) {
    return {
      personas: [],
      discovery,
      applied_invariants,
      diagnostic: "no kind=human rows",
    };
  }

  const directsByManager = countDirectsByManager(humans);
  const practiceCountByManager = evidenceCountByEmail
    ? countPracticeDirectsByManager(humans, evidenceCountByEmail)
    : null;
  const { peopleByEmail, peersByTeamId } = buildPeerMaps(humans);

  const personas = humans
    .filter(
      (h) =>
        (h.manager_email ?? null) !== null &&
        (directsByManager.get(h.email) ?? 0) >= 1 &&
        (!evidenceCountByEmail ||
          ((evidenceCountByEmail.get(h.email) ?? 0) >= 1 &&
            (practiceCountByManager.get(h.email) ?? 0) >= 1)),
    )
    .map((h) =>
      buildPersonaRow(h, {
        peopleByEmail,
        peersByTeamId,
        directsByManager,
        evidenceCountByEmail,
        practiceCountByManager,
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
      discovery,
      applied_invariants,
      diagnostic: `no invariant-satisfying persona — binding constraint: ${binding}`,
    };
  }

  return { personas, discovery, applied_invariants };
}
