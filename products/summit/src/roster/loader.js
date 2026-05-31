/**
 * Roster loader orchestration.
 *
 * Dispatches to the YAML parser when a roster file path is provided,
 * or to the Map-sourced loader otherwise. Supabase client construction
 * is injectable for tests.
 */

import { resolve } from "node:path";

import { parseRosterYaml } from "./yaml.js";
import { loadRosterFromMap } from "./map.js";
import {
  createSummitClient,
  SupabaseUnavailableError,
} from "../lib/supabase.js";

/**
 * Load a Summit roster from either a YAML file or Map's activity schema.
 *
 * @param {object} options
 * @param {string} [options.rosterPath] - Path to a `summit.yaml` file.
 * @param {object} [options.config] - libconfig Config to pass to createSummitClient.
 * @param {import("@supabase/supabase-js").SupabaseClient} [options.supabase] -
 *   Optional pre-built Supabase client (tests inject fakes through this).
 * @param {(opts: object) => import("@supabase/supabase-js").SupabaseClient} [options.createClient] -
 *   Alternative Supabase factory (defaults to `createSummitClient`).
 * @param {object} [options.fs] - Injected async fs surface (`runtime.fs`); its
 *   `readFile` is used when no explicit `readFile` override is supplied.
 * @param {(path: string) => Promise<string>} [options.readFile] - Override file reader for tests.
 * @returns {Promise<import("./yaml.js").Roster>}
 */
export async function loadRoster(options = {}) {
  const {
    rosterPath,
    config,
    supabase,
    createClient = createSummitClient,
    fs,
    readFile: read = fs ? (path) => fs.readFile(path, "utf8") : undefined,
  } = options;

  if (rosterPath) {
    if (!read) {
      throw new Error(
        "summit: loadRoster requires an `fs` collaborator or a `readFile` override to read a roster file.",
      );
    }
    const absolute = resolve(rosterPath);
    const content = await read(absolute);
    return parseRosterYaml(content);
  }

  let client = supabase;
  if (!client) {
    try {
      client = await createClient({ config });
    } catch (e) {
      if (e instanceof SupabaseUnavailableError) {
        throw new Error(
          "summit: No roster found. Provide --roster path or configure Map's organization_people table.",
          { cause: e },
        );
      }
      throw e;
    }
  }

  return loadRosterFromMap(client);
}
