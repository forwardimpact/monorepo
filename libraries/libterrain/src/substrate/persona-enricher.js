/**
 * Persona-row enricher for the substrate roster/pick verbs.
 *
 * This module sources the three DSL-only persona-template fields (`repos`,
 * `department_name`, `scenario`) from `data/synthetic/story.dsl`. It
 * augments persona rows that already carry the contract scalars and the
 * joined team/parent/peer context. It delegates AST traversal to
 * `@forwardimpact/libsyntheticgen`'s public helpers. It owns only the
 * contract ↔ DSL id coupling and the row-shape contract. The contract's
 * `team_id` is the DSL team id. The consumer view maps any vendor prefix.
 * This module does not.
 */

import {
  createDslParser,
  findTeamById,
  findDepartmentForTeam,
  findMostRecentScenarioForTeam,
} from "@forwardimpact/libsyntheticgen";

/**
 * Resolve `data/synthetic/story.dsl` upward from `cwd`. Parse it. Return
 * the AST. Returns `null` when the file is absent so the verbs degrade
 * gracefully for consumers with no staged terrain. Wraps parser errors with
 * the file path. The caller then sees DSL drift. A bare parse message does
 * not reach the caller.
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
 * Augment a persona row with three DSL-derived fields. The function is pure.
 * The same `(row, ast)` always returns the same shape. When the AST is
 * absent or the row carries no resolvable team id, the three DSL fields
 * fall to `null`. The function does not throw, so the row is still
 * pickable.
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
