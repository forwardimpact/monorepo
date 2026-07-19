/**
 * `fit-landmark coverage --email <email>`
 *
 * Evidence coverage metrics per person.
 */

import { getPerson } from "@forwardimpact/map/activity/queries/org";
import { getEvidence } from "@forwardimpact/map/activity/queries/evidence";
import {
  getArtifacts,
  getUnscoredArtifacts,
} from "@forwardimpact/map/activity/queries/artifacts";

import { EMPTY_STATES } from "../lib/empty-state.js";
import {
  computeCoverageRatio,
  groupEvidenceByProvenance,
} from "../lib/evidence-helpers.js";
import { resolveSubjectEmail } from "../lib/identity.js";

export const needsSupabase = true;

/** Fetch artifact counts and compute the ratio of scored-to-total evidence for a person. */
export async function runCoverageCommand({
  options,
  identity,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? {
    getPerson,
    getArtifacts,
    getUnscoredArtifacts,
    getEvidence,
  };

  const email = resolveSubjectEmail(options, identity);

  const person = await q.getPerson(supabase, email);
  if (!person) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.PERSON_NOT_FOUND(email),
      },
    };
  }

  const allArtifacts = await q.getArtifacts(supabase, {
    email,
  });

  if (!allArtifacts || allArtifacts.length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.NO_ARTIFACTS_FOR_PERSON(email),
      },
    };
  }

  const unscored = await q.getUnscoredArtifacts(supabase, {
    email,
  });

  const ratio = computeCoverageRatio(allArtifacts, unscored);

  // Group uncovered by type
  const uncoveredByType = {};
  for (const a of unscored) {
    const type = a.artifact_type ?? "unknown";
    uncoveredByType[type] = (uncoveredByType[type] ?? 0) + 1;
  }

  // Group all by type
  const allByType = {};
  for (const a of allArtifacts) {
    const type = a.artifact_type ?? "unknown";
    allByType[type] = (allByType[type] ?? 0) + 1;
  }

  const evidenceRows = await q.getEvidence(supabase, { email });
  const byProvenance = groupEvidenceByProvenance(evidenceRows ?? []);

  return {
    view: {
      email,
      name: person.name,
      coverage: ratio,
      byType: allByType,
      uncoveredByType,
      byProvenance,
    },
    meta: { format },
  };
}
