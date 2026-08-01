/**
 * Transform Orchestrator
 *
 * Runs all transforms in dependency order.
 * Import people before GitHub and GetDX (for email/manager resolution).
 * The artifact-driven evidence producer runs after GitHub (it reads
 * github_artifacts) and before the round-robin producer. The
 * artifact-interpreted rows must land first. The round-robin upsert's
 * ON CONFLICT DO NOTHING then guards cross-producer key collisions.
 */

import { transformAllGitHub } from "./github.js";
import { transformAllGetDX } from "./getdx.js";
import { transformPeople } from "./people.js";
import { transformEvidenceArtifact } from "./evidence-artifact.js";
import { transformEvidence } from "./evidence.js";

/**
 * Run all transforms in dependency order.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (clock).
 * @param {object} [collaborators]
 * @param {object} [collaborators.mapData] - Standard data. The
 *   artifact-driven evidence producer needs it. When you omit it, that
 *   producer does not run. `evidenceArtifact` then carries
 *   `producerRan: false` and `missingCollaborator: "mapData"` alongside the
 *   zero counts. When you supply it, `evidenceArtifact` carries
 *   `producerRan: true` with the producer's counts.
 * @returns {Promise<{people: object, getdx: object, github: object, evidenceArtifact: object, evidence: object}>}
 */
export async function transformAll(supabase, runtime, { mapData } = {}) {
  const people = await transformPeople(supabase, runtime);
  const getdx = await transformAllGetDX(supabase, runtime);
  const github = await transformAllGitHub(supabase);
  let evidenceArtifact;
  if (mapData) {
    const result = await transformEvidenceArtifact(supabase, { mapData });
    evidenceArtifact = { ...result, producerRan: true };
  } else {
    evidenceArtifact = {
      inserted: 0,
      skipped: 0,
      errors: [],
      producerRan: false,
      missingCollaborator: "mapData",
    };
  }
  const evidence = await transformEvidence(supabase);

  return { people, getdx, github, evidenceArtifact, evidence };
}
