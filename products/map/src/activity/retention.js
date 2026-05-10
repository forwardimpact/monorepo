/**
 * Per-table retention metadata reader.
 *
 * Reads the COMMENT blob added by the landmark RLS migration via the
 * activity.retention_blob(table) SQL helper and parses the
 * `retention.window=<ISO>` and `retention.clock=<column>` tokens.
 *
 * Cached for one CLI invocation; tests call clearRetentionCache() between
 * cases.
 */

const TOKEN = /retention\.(window|clock)=([A-Za-z0-9_]+)/g;

/**
 * Read the parsed retention metadata for an activity table.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} table - Activity table name (unqualified).
 * @returns {Promise<{window: string|null, clock: string|null}>}
 */
export async function readRetention(supabase, table) {
  if (readRetention._cache?.has(table)) return readRetention._cache.get(table);
  const { data, error } = await supabase.rpc("retention_blob", {
    p_table: table,
  });
  if (error) throw new Error(`readRetention: ${error.message}`);
  const blob = data ?? "";
  const out = { window: null, clock: null };
  for (const m of blob.matchAll(TOKEN)) out[m[1]] = m[2];
  if (!readRetention._cache) readRetention._cache = new Map();
  readRetention._cache.set(table, out);
  return out;
}

/** Clear the per-process retention cache. Test-only. */
export function clearRetentionCache() {
  readRetention._cache?.clear();
}
