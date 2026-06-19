import { extractGetDX } from "../_shared/activity/extract/getdx.js";
import { transformAllGetDX } from "../_shared/activity/transform/getdx.js";

/**
 * Fetch from GetDX, store the raw responses, then transform them.
 *
 * Both phases read the injected clock: `extractGetDX` timestamps the stored
 * documents, and `transformAllGetDX` timestamps snapshot-comment evidence.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ clock: { now: () => number } }} runtime
 * @param {{ apiToken: string, baseUrl: string }} config
 * @returns {Promise<object>} Response body.
 */
export async function handleGetDXSync(supabase, runtime, config) {
  const extract = await extractGetDX(supabase, config, runtime);
  const transform = await transformAllGetDX(supabase, runtime);
  const ok = extract.errors.length === 0 && transform.errors.length === 0;
  return {
    ok,
    extract: { files: extract.files, errors: extract.errors },
    transform,
  };
}
