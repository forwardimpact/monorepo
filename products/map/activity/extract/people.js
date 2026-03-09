/**
 * People Extract
 *
 * Stores the uploaded CSV or YAML people file as-is in Supabase Storage.
 */

import { storeRaw } from "../storage.js";

/**
 * Extract: store a raw people file upload.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} content - File content (CSV or YAML)
 * @param {string} format - 'csv' or 'yaml'
 * @returns {Promise<{stored: boolean, path: string, error?: string}>}
 */
export async function extractPeopleFile(supabase, content, format) {
  const timestamp = new Date().toISOString();
  const ext = format === "csv" ? "csv" : "yaml";
  const contentType = format === "csv" ? "text/csv" : "application/x-yaml";
  const path = `people/${timestamp}.${ext}`;
  return storeRaw(supabase, path, content, contentType);
}
