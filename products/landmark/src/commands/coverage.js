/**
 * `fit-landmark coverage --email <email>`
 *
 * Evidence coverage metrics per person.
 */

import { getPerson } from "@forwardimpact/map/activity/queries/org";
import {
  getArtifacts,
  getUnscoredArtifacts,
} from "@forwardimpact/map/activity/queries/artifacts";

import { EMPTY_STATES } from "../lib/empty-state.js";
import { computeCoverageRatio } from "../lib/evidence-helpers.js";

export const needsSupabase = true;

export async function runCoverageCommand({
  options,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getPerson, getArtifacts, getUnscoredArtifacts };

  if (!options.email) {
    throw new Error("coverage: --email <email> is required");
  }

  const person = await q.getPerson(supabase, options.email);
  if (!person) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.PERSON_NOT_FOUND(options.email),
      },
    };
  }

  const allArtifacts = await q.getArtifacts(supabase, {
    email: options.email,
  });

  if (!allArtifacts || allArtifacts.length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.NO_ARTIFACTS_FOR_PERSON(options.email),
      },
    };
  }

  const unscored = await q.getUnscoredArtifacts(supabase, {
    email: options.email,
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

  return {
    view: {
      email: options.email,
      name: person.name,
      coverage: ratio,
      byType: allByType,
      uncoveredByType,
    },
    meta: { format },
  };
}
