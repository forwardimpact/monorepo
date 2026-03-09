/**
 * Transform Orchestrator
 *
 * Runs all transforms in dependency order.
 * People must be imported before GitHub and GetDX (for email/manager resolution).
 */

import { transformAllGitHub } from "./github.js";
import { transformAllGetDX } from "./getdx.js";
import { transformPeople } from "./people.js";

/**
 * Run all transforms in dependency order.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{people: object, getdx: object, github: object}>}
 */
export async function transformAll(supabase) {
  const people = await transformPeople(supabase);
  const getdx = await transformAllGetDX(supabase);
  const github = await transformAllGitHub(supabase);

  return { people, getdx, github };
}
