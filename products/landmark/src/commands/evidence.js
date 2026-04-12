/**
 * `fit-landmark evidence [--skill <id>] [--email <email>]`
 *
 * Show marker-linked evidence by skill with Guide's rationale.
 */

import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import {
  getArtifacts,
  getUnscoredArtifacts,
} from "@forwardimpact/map/activity/queries/artifacts";

import { EMPTY_STATES } from "../lib/empty-state.js";
import {
  groupEvidenceBySkill,
  computeCoverageRatio,
} from "../lib/evidence-helpers.js";

export const needsSupabase = true;

export async function runEvidenceCommand({
  options,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getEvidence, getArtifacts, getUnscoredArtifacts };
  const filterOpts = {};
  if (options.skill) filterOpts.skillId = options.skill;
  if (options.email) filterOpts.email = options.email;

  const evidenceRows = await q.getEvidence(supabase, filterOpts);

  if (!evidenceRows || evidenceRows.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_EVIDENCE },
    };
  }

  const grouped = groupEvidenceBySkill(evidenceRows);

  // Coverage line
  let coverage = null;
  if (options.email) {
    const allArtifacts = await q.getArtifacts(supabase, {
      email: options.email,
    });
    const unscored = await q.getUnscoredArtifacts(supabase, {
      email: options.email,
    });
    coverage = computeCoverageRatio(allArtifacts, unscored);
  }

  return {
    view: {
      evidence: Object.fromEntries(grouped),
      coverage,
      filters: filterOpts,
    },
    meta: { format },
  };
}
