/**
 * People Transform
 *
 * Reads stored people files (CSV or YAML) from Supabase Storage and produces
 * structured rows in organization_people table. Deno-safe: no Node-only
 * imports. Used by both the fit-map CLI and the people-upload/transform
 * edge functions.
 */

import { readRaw, listRaw } from "../storage.js";
import { parsePeopleFile } from "../../../../../activity/parse-people.js";

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
