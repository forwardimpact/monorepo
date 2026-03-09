/**
 * Raw Document Storage for the ELT Pipeline
 *
 * Wraps Supabase Storage operations for the `raw` bucket.
 * All extracted documents are stored here before transformation.
 */

const BUCKET = "raw";

/**
 * Store a raw document in Supabase Storage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path within the raw bucket
 * @param {string|Buffer} content - Document content
 * @param {string} [contentType='application/json']
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function storeRaw(
  supabase,
  path,
  content,
  contentType = "application/json",
) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, content, { contentType, upsert: true });

  if (error) return { stored: false, path, error: error.message };
  return { stored: true, path };
}

/**
 * Read a raw document from Supabase Storage.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} path - Storage path within the raw bucket
 * @returns {Promise<string>}
 */
export async function readRaw(supabase, path) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);

  if (error) throw new Error(`readRaw(${path}): ${error.message}`);
  return await data.text();
}

/**
 * List raw documents under a prefix.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} prefix - Path prefix (e.g., 'github/', 'getdx/snapshots-info/')
 * @returns {Promise<Array<{name: string, created_at: string}>>}
 */
export async function listRaw(supabase, prefix) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { sortBy: { column: "created_at", order: "desc" } });

  if (error) throw new Error(`listRaw(${prefix}): ${error.message}`);
  return data;
}
