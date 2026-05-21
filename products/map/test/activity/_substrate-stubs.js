/**
 * Shared Supabase-shaped stub used by the substrate test suites. The
 * stub returns rows for each table the substrate persona-query helper
 * reads; chained `select/eq/order/limit` calls are tolerated as no-ops
 * so call patterns from both the roster verb and the underlying helper
 * work against the same fixture.
 */

/**
 * @param {object} [seed]
 * @param {Array} [seed.snapshots]
 * @param {Array} [seed.scores]
 * @param {Array} [seed.humans]
 * @param {Array} [seed.artifacts]
 * @param {Array} [seed.evidence]
 * @param {Array} [seed.teams]
 * @returns {object}
 */
export function makeStub(seed = {}) {
  return {
    from(table) {
      let rows;
      let filter = (rs) => rs;
      switch (table) {
        case "getdx_snapshots":
          rows = seed.snapshots ?? [];
          break;
        case "getdx_snapshot_team_scores":
          rows = seed.scores ?? [];
          break;
        case "organization_people":
          rows = seed.humans ?? [];
          filter = (rs) => rs.filter((r) => r.kind === "human");
          break;
        case "github_artifacts":
          rows = seed.artifacts ?? [];
          break;
        case "evidence":
          rows = seed.evidence ?? [];
          break;
        case "getdx_teams":
          rows = seed.teams ?? [];
          break;
        default:
          throw new Error(`unexpected table ${table}`);
      }
      let filtered = rows;
      const builder = {
        select() {
          filtered = filter(rows);
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
        then(resolve, reject) {
          return Promise.resolve({ data: filtered, error: null }).then(
            resolve,
            reject,
          );
        },
      };
      return builder;
    },
  };
}
