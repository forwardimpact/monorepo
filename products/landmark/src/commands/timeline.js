/**
 * `fit-landmark timeline --email <email> [--skill <id>]`
 *
 * Individual growth timeline: aggregate evidence by quarter per skill.
 */

import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import {
  getArtifacts,
  getUnscoredArtifacts,
} from "@forwardimpact/map/activity/queries/artifacts";

import { EMPTY_STATES } from "../lib/empty-state.js";
import {
  computeCoverageRatio,
  highestLevelPerSkillPerQuarter,
} from "../lib/evidence-helpers.js";
import { resolveSubjectEmail } from "../lib/identity.js";

export const needsSupabase = true;

/** Query evidence for a person and aggregate the highest proficiency level per skill per quarter. */
export async function runTimelineCommand({
  options,
  identity,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getEvidence, getArtifacts, getUnscoredArtifacts };

  const email = resolveSubjectEmail(options, identity);

  const filterOpts = { email };
  if (options.skill) filterOpts.skillId = options.skill;

  const evidenceRows = await q.getEvidence(supabase, filterOpts);

  if (!evidenceRows || evidenceRows.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_EVIDENCE },
    };
  }

  const timeline = highestLevelPerSkillPerQuarter(evidenceRows);

  // Same zero-artifact semantics as readiness: null coverage = "no
  // signal"; the below-floor banner needs a measured ratio.
  const allArtifacts =
    (await q.getArtifacts(supabase, { email: options.email })) ?? [];
  let coverage = null;
  if (allArtifacts.length > 0) {
    const unscored = await q.getUnscoredArtifacts(supabase, {
      email: options.email,
    });
    coverage = computeCoverageRatio(allArtifacts, unscored);
  }

  return {
    view: { email: options.email, timeline, coverage },
    meta: { format },
  };
}
