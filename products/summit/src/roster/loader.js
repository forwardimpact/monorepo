/**
 * Roster loader orchestration.
 *
 * Dispatches to the YAML parser when a roster file path is provided,
 * or to the Map-sourced loader otherwise. Supabase client construction
 * is injectable for tests.
 */

import { readFile } from "node:fs/promises";
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
 * @param {import("@supabase/supabase-js").SupabaseClient} [options.supabase] -
 *   Optional pre-built Supabase client (tests inject fakes through this).
 * @param {() => import("@supabase/supabase-js").SupabaseClient} [options.createClient] -
 *   Alternative Supabase factory (defaults to `createSummitClient`).
 * @param {(path: string) => Promise<string>} [options.readFile] - Override file reader for tests.
 * @returns {Promise<import("./yaml.js").Roster>}
 */
export async function loadRoster(options = {}) {
  const {
    rosterPath,
    supabase,
    createClient = createSummitClient,
    readFile: read = defaultRead,
  } = options;

  if (rosterPath) {
    const absolute = resolve(rosterPath);
    const content = await read(absolute);
    return parseRosterYaml(content);
  }

  let client = supabase;
  if (!client) {
    try {
      client = createClient();
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

async function defaultRead(path) {
  return readFile(path, "utf8");
}
