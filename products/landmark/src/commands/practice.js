/**
 * `fit-landmark practice [--skill <id>] [--manager <email>]`
 *
 * Show practice-pattern aggregates for manager-defined teams.
 */

import { getPracticePatterns } from "@forwardimpact/map/activity/queries/evidence";

import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = true;

export async function runPracticeCommand({
  options,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getPracticePatterns };

  const filterOpts = {};
  if (options.skill) filterOpts.skillId = options.skill;
  if (options.manager) filterOpts.managerEmail = options.manager;

  const patterns = await q.getPracticePatterns(supabase, filterOpts);

  if (!patterns || patterns.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_EVIDENCE },
    };
  }

  return {
    view: { patterns, filters: filterOpts },
    meta: { format },
  };
}
