/**
 * People Extract
 *
 * Stores the uploaded CSV or YAML people file as-is in Supabase Storage.
 */

import { isoTimestamp } from "@forwardimpact/libutil";
import { storeRaw } from "../storage.js";

/**
 * Extract: store a raw people file upload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} content - File content (CSV or YAML)
 * @param {string} format - 'csv' or 'yaml'
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (clock).
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function extractPeopleFile(supabase, content, format, runtime) {
  const timestamp = isoTimestamp(runtime.clock.now());
  const ext = format === "csv" ? "csv" : "yaml";
  const contentType = format === "csv" ? "text/csv" : "application/x-yaml";
  const path = `people/${timestamp}.${ext}`;
  return storeRaw(supabase, path, content, contentType);
}
