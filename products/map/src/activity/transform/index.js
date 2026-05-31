/**
 * Transform Orchestrator
 *
 * Runs all transforms in dependency order.
 * People must be imported before GitHub and GetDX (for email/manager resolution).
 */

import { transformAllGitHub } from "./github.js";
import { transformAllGetDX } from "./getdx.js";
import { transformPeople } from "./people.js";
import { transformEvidence } from "./evidence.js";

/**
 * Run all transforms in dependency order.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (clock).
 * @returns {Promise<{people: object, getdx: object, github: object, evidence: object}>}
 */
export async function transformAll(supabase, runtime) {
  const people = await transformPeople(supabase, runtime);
  const getdx = await transformAllGetDX(supabase, runtime);
  const github = await transformAllGitHub(supabase);
  const evidence = await transformEvidence(supabase);

  return { people, getdx, github, evidence };
}
