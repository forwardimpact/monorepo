/**
 * People Transform
 *
 * Reads stored people files (CSV or YAML) from Supabase Storage and produces
 * structured rows in organization_people table. Deno-safe: no Node-only
 * imports. Used by both the fit-map CLI and the people-upload/transform
 * edge functions.
 */

import { readRaw, listRaw } from "../storage.js";
import { parse as parseYaml } from "yaml";

/**
 * Transform the most recent stored people file into DB rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{imported: number, errors: Array<string>}>}
 */
export async function transformPeople(supabase) {
  const files = await listRaw(supabase, "people/");
  if (files.length === 0) return { imported: 0, errors: [] };

  const latest = `people/${files[0].name}`;
  const content = await readRaw(supabase, latest);
  const format = latest.endsWith(".csv") ? "csv" : "yaml";
  const people = parsePeopleFile(content, format);

  return importPeople(supabase, people);
}

/**
 * Parse a people file into an array of person objects.
 * @param {string} content - File content
 * @param {string} format - 'csv' or 'yaml'
 * @returns {Array<object>} Array of person objects
 */
function parsePeopleFile(content, format) {
  if (format === "csv") return parseCsv(content);
  return parseYamlPeople(content);
}

/**
 * Parse a CSV string into an array of objects using the header row as keys.
 * @param {string} csv - CSV content
 * @returns {Array<object>} Array of row objects
 */
function parseCsv(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    return Object.fromEntries(headers.map((h, i) => [h, values[i] || null]));
  });
}

/**
 * Parse a YAML string into an array of person objects.
 * @param {string} content - YAML content
 * @returns {Array<object>} Array of person objects
 */
function parseYamlPeople(content) {
  const data = parseYaml(content);
  return Array.isArray(data) ? data : data.people || [];
}

/**
 * Import people into Supabase.
 * Upserts rows into activity.organization_people.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<object>} people - Person objects
 * @returns {Promise<{imported: number, errors: Array<string>}>}
 */
async function importPeople(supabase, people) {
  const errors = [];
  let imported = 0;

  // Insert in dependency order: people without managers first, then with managers.
  // This avoids foreign key violations on manager_email.
  const withoutManager = people.filter((p) => !p.manager_email);
  const withManager = people.filter((p) => p.manager_email);

  for (const batch of [withoutManager, withManager]) {
    if (batch.length === 0) continue;

    const { error } = await supabase.from("organization_people").upsert(
      batch.map((p) => ({
        email: p.email,
        name: p.name,
        github_username: p.github_username || null,
        discipline: p.discipline,
        level: p.level,
        track: p.track || null,
        manager_email: p.manager_email || null,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "email" },
    );

    if (error) {
      errors.push(error.message);
    } else {
      imported += batch.length;
    }
  }

  return { imported, errors };
}
