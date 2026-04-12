/**
 * `fit-landmark timeline --email <email> [--skill <id>]`
 *
 * Individual growth timeline: aggregate evidence by quarter per skill.
 */

import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";

import { EMPTY_STATES } from "../lib/empty-state.js";
import { highestLevelPerSkillPerQuarter } from "../lib/evidence-helpers.js";

export const needsSupabase = true;

export async function runTimelineCommand({
  options,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getEvidence };

  if (!options.email) {
    throw new Error("timeline: --email <email> is required");
  }

  const filterOpts = { email: options.email };
  if (options.skill) filterOpts.skillId = options.skill;

  const evidenceRows = await q.getEvidence(supabase, filterOpts);

  if (!evidenceRows || evidenceRows.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_EVIDENCE },
    };
  }

  const timeline = highestLevelPerSkillPerQuarter(evidenceRows);

  return {
    view: { email: options.email, timeline },
    meta: { format },
  };
}
