/**
 * People Validation
 *
 * Node-only CLI validation for local people files. Cross-references
 * discipline, level, and track values against the standard. Does not
 * talk to Supabase.
 */

import { parseYamlPeople, parseCsv } from "../parse-people.js";
import { createDataLoader } from "../../loader.js";

/**
 * Load people from a local file (CSV or YAML).
 * @param {string} filePath - Path to the people file
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs).
 * @returns {Promise<Array<object>>} Array of person objects
 */
export async function loadPeopleFile(filePath, runtime) {
  const content = await runtime.fs.readFile(filePath, "utf-8");

  if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
    return parseYamlPeople(content);
  }

  if (filePath.endsWith(".csv")) {
    return parseCsv(content);
  }

  throw new Error(`Unsupported file format: ${filePath}. Use .yaml or .csv`);
}

/**
 * Collect validation errors for a single person record.
 * @param {object} person
 * @param {{ disciplineIds: Set, levelIds: Set, trackIds: Set }} ids
 * @returns {Array<string>}
 */
function validatePersonRow(person, ids) {
  const rowErrors = [];

  if (!person.email) rowErrors.push("missing email");
  if (!person.name) rowErrors.push("missing name");

  // Service-account rows carry no Pathway job profile. Validate just the
  // shape (email/name above; level-null below) and skip the discipline/
  // level/track checks the human rows go through. The DB check
  // constraint enforces level IS NULL for these rows.
  if (person.kind === "service_account") {
    if (person.level)
      rowErrors.push("service_account rows must have level=null");
    return rowErrors;
  }

  if (!person.discipline) {
    rowErrors.push("missing discipline");
  } else if (!ids.disciplineIds.has(person.discipline)) {
    rowErrors.push(`unknown discipline: ${person.discipline}`);
  }
  if (!person.level) {
    rowErrors.push("missing level");
  } else if (!ids.levelIds.has(person.level)) {
    rowErrors.push(`unknown level: ${person.level}`);
  }
  if (person.track && !ids.trackIds.has(person.track)) {
    rowErrors.push(`unknown track: ${person.track}`);
  }

  return rowErrors;
}

/**
 * Normalize a valid person record for storage.
 * @param {object} person
 * @returns {object}
 */
function normalizePersonRecord(person) {
  const kind = person.kind || "human";
  return {
    email: person.email,
    name: person.name,
    github_username: person.github_username || null,
    discipline: person.discipline,
    level: kind === "service_account" ? null : person.level,
    track: person.track || null,
    manager_email: person.manager_email || null,
    kind,
  };
}

/**
 * Validate people against standard data.
 * Checks that discipline, level, and track values exist in the standard.
 * @param {Array<object>} people - Array of person objects
 * @param {string} dataDir - Path to standard data directory
 * @param {import('@forwardimpact/libutil/runtime').Runtime} runtime - Injected collaborators (fs).
 * @returns {Promise<{valid: Array<object>, errors: Array<{row: number, message: string}>}>}
 */
export async function validatePeople(people, dataDir, runtime) {
  const loader = createDataLoader(runtime);
  const data = await loader.loadAllData(dataDir);

  const ids = {
    disciplineIds: new Set(data.disciplines.map((d) => d.id)),
    levelIds: new Set(data.levels.map((l) => l.id)),
    trackIds: new Set(data.tracks.map((t) => t.id)),
  };

  const valid = [];
  const errors = [];

  for (let i = 0; i < people.length; i++) {
    const rowErrors = validatePersonRow(people[i], ids);
    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, message: rowErrors.join("; ") });
    } else {
      valid.push(normalizePersonRecord(people[i]));
    }
  }

  return { valid, errors };
}
