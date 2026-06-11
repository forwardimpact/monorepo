/**
 * Transform Orchestrator
 *
 * Runs all transforms in dependency order.
 * People must be imported before GitHub and GetDX (for email/manager resolution).
 * The artifact-driven evidence producer runs after GitHub (it reads
 * github_artifacts) and before the round-robin producer:
 * artifact-interpreted rows must land first so the round-robin upsert's
 * ON CONFLICT DO NOTHING guards cross-producer key collisions.
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
 * @param {object} [collaborators.mapData] - Standard data; required for the
 *   artifact-driven evidence producer. When omitted, that producer is skipped.
 * @returns {Promise<{people: object, getdx: object, github: object, evidenceArtifact: object, evidence: object}>}
 */
export async function transformAll(supabase, runtime, { mapData } = {}) {
  const people = await transformPeople(supabase, runtime);
  const getdx = await transformAllGetDX(supabase, runtime);
  const github = await transformAllGitHub(supabase);
  let evidenceArtifact = { inserted: 0, skipped: 0, errors: [] };
  if (mapData) {
    evidenceArtifact = await transformEvidenceArtifact(supabase, { mapData });
  }
  const evidence = await transformEvidence(supabase);

  return { people, getdx, github, evidenceArtifact, evidence };
}
