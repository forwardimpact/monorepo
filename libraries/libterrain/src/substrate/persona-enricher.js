/**
 * Persona-row enricher for the substrate roster/pick verbs.
 *
 * Sources the three DSL-only persona-template fields (`repos`,
 * `department_name`, `scenario`) from `data/synthetic/story.dsl`,
 * augmenting persona rows already carrying the contract scalars and
 * joined team/parent/peer context. AST traversal is delegated to
 * `@forwardimpact/libsyntheticgen`'s public helpers; this module owns
 * only the contract ↔ DSL id coupling and the row-shape contract. The
 * contract's `team_id` is the DSL team id — any vendor-prefix mapping is
 * the consumer view's job, not this module's.
 */

import {
  createDslParser,
  findTeamById,
  findDepartmentForTeam,
  findMostRecentScenarioForTeam,
} from "@forwardimpact/libsyntheticgen";

/**
 * Resolve `data/synthetic/story.dsl` upward from `cwd`, parse it, and
 * return the AST. Returns `null` when the file is absent so the verbs
 * degrade gracefully for consumers with no staged terrain. Wraps parser
 * errors with the file path so the caller sees DSL drift, not a bare
 * parse message.
 *
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs, finder, proc).
 * @param {string} [cwd] - working directory (defaults to `runtime.proc.cwd()`)
 * @returns {Promise<object|null>}
 */
export async function loadStory(runtime, cwd = runtime.proc.cwd()) {
  const dslPath = runtime.finder.findUpward(cwd, "data/synthetic/story.dsl", 5);
  if (!dslPath) return null;
  const source = await runtime.fs.readFile(dslPath, "utf8");
  try {
    return createDslParser().parse(source);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`story.dsl parse failed at ${dslPath}: ${message}`);
  }
}

/**
 * Augment a persona row with three DSL-derived fields. Pure: the same
 * `(row, ast)` always returns the same shape. When the AST is absent or
 * the row carries no resolvable team id, the three DSL fields fall to
 * `null` rather than throwing so the row is still pickable.
 *
 * @param {object} row - persona row from `findInvariantSatisfyingPersonas`
 * @param {object|null} ast - parsed terrain AST from `loadStory()` or `null`
 * @returns {object} the row augmented with `repos`, `department_name`, `scenario`
 */
export function enrichPersonaRow(row, ast) {
  const nulls = { repos: null, department_name: null, scenario: null };
  if (!ast) return { ...row, ...nulls };
  const teamId = row?.team_id;
  if (typeof teamId !== "string" || !teamId) {
    return { ...row, ...nulls };
  }
  const team = findTeamById(ast, teamId);
  if (!team) return { ...row, ...nulls };
  const department = findDepartmentForTeam(ast, team);
  const scenario = findMostRecentScenarioForTeam(ast, teamId);
  return {
    ...row,
    repos: team?.repos ?? null,
    department_name: department?.name ?? null,
    scenario: scenario ?? null,
  };
}
