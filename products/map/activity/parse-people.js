/**
 * Shared People File Parsers
 *
 * Deno-compatible (no fs import, receives content strings).
 * Used by both the CLI validator and the Supabase edge function.
 */

import { parse as parseYaml } from "yaml";

/**
 * Parse a YAML people file into an array of person objects.
 * Accepts a top-level array, a `people:` wrapper, or a `roster:` wrapper.
 * @param {string} content
 * @returns {Array<object>}
 */
export function parseYamlPeople(content) {
  const data = parseYaml(content);
  if (Array.isArray(data)) return data;
  const rows = data.people || data.roster || [];
  return rows.map((row) => ({
    ...row,
    github_username: row.github_username || row.github || null,
  }));
}

/**
 * Parse a CSV string into an array of objects using the header row as keys.
 * @param {string} csv
 * @returns {Array<object>}
 */
export function parseCsv(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || null]));
  });
}

/**
 * Parse a people file by format.
 * @param {string} content
 * @param {'csv'|'yaml'} format
 * @returns {Array<object>}
 */
export function parsePeopleFile(content, format) {
  if (format === "csv") return parseCsv(content);
  return parseYamlPeople(content);
}
