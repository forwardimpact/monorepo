/**
 * People Validation
 *
 * Node-only CLI validation for local people files. Cross-references
 * discipline, level, and track values against the framework. Does not
 * talk to Supabase.
 */

import { parseYamlPeople, parseCsv } from "../parse-people.js";
import { createDataLoader } from "../../src/loader.js";

/**
 * Load people from a local file (CSV or YAML).
 * @param {string} filePath - Path to the people file
 * @returns {Promise<Array<object>>} Array of person objects
 */
export async function loadPeopleFile(filePath) {
  const { readFile } = await import("fs/promises");
  const content = await readFile(filePath, "utf-8");

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYamlPeople(content);
  }

  if (filePath.endsWith(".csv")) {
    return parseCsv(content);
  }

  throw new Error(`Unsupported file format: ${filePath}. Use .yaml or .csv`);
}

/**
 * Validate people against framework data.
 * Checks that discipline, level, and track values exist in the framework.
 * @param {Array<object>} people - Array of person objects
 * @param {string} dataDir - Path to framework data directory
 * @returns {Promise<{valid: Array<object>, errors: Array<{row: number, message: string}>}>}
 */
export async function validatePeople(people, dataDir) {
  const loader = createDataLoader();
  const data = await loader.loadAllData(dataDir);

  const disciplineIds = new Set(data.disciplines.map((d) => d.id));
  const levelIds = new Set(data.levels.map((l) => l.id));
  const trackIds = new Set(data.tracks.map((t) => t.id));

  const valid = [];
  const errors = [];

  for (let i = 0; i < people.length; i++) {
    const person = people[i];
    const rowErrors = [];

    if (!person.email) {
      rowErrors.push("missing email");
    }
    if (!person.name) {
      rowErrors.push("missing name");
    }
    if (!person.discipline) {
      rowErrors.push("missing discipline");
    } else if (!disciplineIds.has(person.discipline)) {
      rowErrors.push(`unknown discipline: ${person.discipline}`);
    }
    if (!person.level) {
      rowErrors.push("missing level");
    } else if (!levelIds.has(person.level)) {
      rowErrors.push(`unknown level: ${person.level}`);
    }
    if (person.track && !trackIds.has(person.track)) {
      rowErrors.push(`unknown track: ${person.track}`);
    }

    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, message: rowErrors.join("; ") });
    } else {
      valid.push({
        email: person.email,
        name: person.name,
        github_username: person.github_username || null,
        discipline: person.discipline,
        level: person.level,
        track: person.track || null,
        manager_email: person.manager_email || null,
      });
    }
  }

  return { valid, errors };
}

