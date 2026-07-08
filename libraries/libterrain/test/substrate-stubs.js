/**
 * Shared Supabase-shaped stub keyed on the three Substrate Contract
 * relations (`people`, `evidence`, `discovery`). A relation seeded `null`
 * responds like a live PostgREST stack whose consumer never defined the
 * view: `{ error: { code: "PGRST205" } }` — how the verbs detect declared
 * absence. Chained `select/eq/order/limit/maybeSingle` calls are tolerated
 * so call patterns from every verb work against the same fixture.
 */

function absentError(table) {
  return {
    code: "PGRST205",
    message: `Could not find the table 'substrate.${table}' in the schema cache`,
  };
}

/**
 * @param {object} [seed]
 * @param {Array} [seed.people] - `substrate.people` rows.
 * @param {Array|null} [seed.evidence] - `substrate.evidence` rows; `null`
 *   marks the relation absent.
 * @param {Array|null} [seed.discovery] - `substrate.discovery` rows; `null`
 *   marks the relation absent.
 * @param {Array} [seed.authUsers] - `auth.admin.listUsers` rows.
 * @returns {object}
 */
export function makeSubstrateStub(seed = {}) {
  const relations = {
    people: seed.people ?? [],
    evidence: seed.evidence === undefined ? [] : seed.evidence,
    discovery: seed.discovery === undefined ? [] : seed.discovery,
  };
  return {
    from(table) {
      if (!(table in relations)) throw new Error(`unexpected table ${table}`);
      const rows = relations[table];
      if (rows === null) {
        const absent = Promise.resolve({
          data: null,
          error: absentError(table),
        });
        const builder = {
          select: () => builder,
          eq: () => builder,
          order: () => builder,
          limit: () => absent,
          maybeSingle: () => absent,
          then: (resolve, reject) => absent.then(resolve, reject),
        };
        return builder;
      }
      let filtered = rows;
      const builder = {
        select() {
          filtered = rows;
          return builder;
        },
        eq(col, val) {
          filtered = filtered.filter((r) => r[col] === val);
          return builder;
        },
        order() {
          return builder;
        },
        limit() {
          return Promise.resolve({ data: filtered, error: null });
        },
        async maybeSingle() {
          return { data: filtered[0] ?? null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: filtered, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    },
    auth: {
      admin: {
        async listUsers() {
          return { data: { users: seed.authUsers ?? [] }, error: null };
        },
      },
    },
  };
}

/**
 * A people set where `mgr@x` satisfies every invariant: she has a manager,
 * manages two directs, authors evidence, and one direct (`dev1@x`) authors
 * evidence too.
 */
export function invariantSatisfyingSeed() {
  return {
    people: [
      {
        email: "top@x",
        name: "Top",
        kind: "human",
        manager_email: null,
        team_id: "team-a",
        team_name: "Team A",
        discipline: "software",
        level: "principal",
        track: "management",
      },
      {
        email: "mgr@x",
        name: "Mgr",
        kind: "human",
        manager_email: "top@x",
        team_id: "team-a",
        team_name: "Team A",
        discipline: "software",
        level: "senior",
        track: "management",
      },
      {
        email: "dev1@x",
        name: "Dev One",
        kind: "human",
        manager_email: "mgr@x",
        team_id: "team-a",
        team_name: "Team A",
        discipline: "software",
        level: "intermediate",
        track: "individual_contributor",
      },
      {
        email: "dev2@x",
        name: "Dev Two",
        kind: "human",
        manager_email: "mgr@x",
        team_id: "team-a",
        team_name: "Team A",
        discipline: "software",
        level: "junior",
        track: "individual_contributor",
      },
      {
        email: "svc@x",
        name: "Service",
        kind: "service_account",
        manager_email: null,
        team_id: null,
        team_name: null,
        discipline: null,
        level: null,
        track: null,
      },
    ],
    evidence: [{ email: "mgr@x" }, { email: "dev1@x" }, { email: "dev1@x" }],
    discovery: [
      { key: "snapshot_id", value: "S1" },
      { key: "item_id", value: "ITEM1" },
    ],
  };
}
