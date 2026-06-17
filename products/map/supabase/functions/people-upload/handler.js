import { extractPeopleFile } from "../_shared/activity/extract/people.js";
import { transformPeople } from "../_shared/activity/transform/people.js";

/**
 * Store a people-file upload, then import it.
 *
 * Both phases read the injected clock: `extractPeopleFile` names the stored file
 * by timestamp, and `transformPeople` timestamps the imported rows. Threading
 * the runtime into both is what fixes the live failure on every upload.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ clock: { now: () => number } }} runtime
 * @param {string} body - Raw file content.
 * @param {string} format - 'csv' or 'yaml'.
 * @returns {Promise<object>} Response body.
 */
export async function handlePeopleUpload(supabase, runtime, body, format) {
  const extractResult = await extractPeopleFile(
    supabase,
    body,
    format,
    runtime,
  );
  if (!extractResult.stored) {
    return { ok: false, stored: false, error: extractResult.error };
  }
  const { imported, errors } = await transformPeople(supabase, runtime);
  return {
    ok: errors.length === 0,
    stored: true,
    path: extractResult.path,
    imported,
    errors,
  };
}
