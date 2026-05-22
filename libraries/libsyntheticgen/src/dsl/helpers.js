/**
 * DSL AST navigation helpers — pure lookups over the AST shape emitted by
 * `createDslParser().parse(source)`. The substrate persona-enricher consumes
 * these to recover team, department, and scenario context from
 * `data/synthetic/story.dsl` at query time.
 *
 * @module libsyntheticgen/dsl/helpers
 */

/**
 * Find a team block by id.
 *
 * @param {object} ast - parsed terrain AST
 * @param {string} teamId
 * @returns {object|null}
 */
export function findTeamById(ast, teamId) {
  if (!ast || !Array.isArray(ast.teams)) return null;
  return ast.teams.find((t) => t.id === teamId) ?? null;
}

/**
 * Resolve the department block that owns a team. The team carries
 * `department: <id>` (per parser-blocks.js parseTeam).
 *
 * @param {object} ast - parsed terrain AST
 * @param {object} team - team block carrying `department`
 * @returns {object|null}
 */
export function findDepartmentForTeam(ast, team) {
  if (!ast || !team || !team.department) return null;
  if (!Array.isArray(ast.departments)) return null;
  return ast.departments.find((d) => d.id === team.department) ?? null;
}

/**
 * Find the most-recent scenario block whose `affects` clause names the team
 * id. "Most recent" maximises `(timerange_start, id)` under string compare;
 * the DSL emits `YYYY-MM` date tokens which collate correctly under lex
 * order. Ties on `timerange_start` break on `id` ascending (max-id wins).
 *
 * @param {object} ast - parsed terrain AST
 * @param {string} teamId
 * @returns {object|null}
 */
export function findMostRecentScenarioForTeam(ast, teamId) {
  if (!ast) return null;
  const scenarios = Array.isArray(ast.scenarios) ? ast.scenarios : [];
  const affecting = scenarios.filter(
    (s) =>
      Array.isArray(s.affects) && s.affects.some((a) => a.team_id === teamId),
  );
  if (affecting.length === 0) return null;
  let best = affecting[0];
  for (let i = 1; i < affecting.length; i += 1) {
    const cur = affecting[i];
    const a = cur.timerange_start ?? "";
    const b = best.timerange_start ?? "";
    if (a > b || (a === b && (cur.id ?? "") > (best.id ?? ""))) {
      best = cur;
    }
  }
  return best;
}
