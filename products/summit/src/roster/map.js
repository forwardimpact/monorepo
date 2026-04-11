/**
 * Load a Summit roster from Map's unified person model.
 *
 * Groups rows from Map's `organization_people` table by `manager_email` —
 * each manager with at least one direct report becomes a reporting team.
 * Team IDs are the lowercased manager email to avoid collisions across
 * domains. Project teams only exist in YAML; this loader produces none.
 */

import { getOrganization } from "@forwardimpact/map/activity/queries/org";

/**
 * @typedef {import("./yaml.js").Roster} Roster
 * @typedef {import("./yaml.js").RosterTeam} RosterTeam
 * @typedef {import("./yaml.js").RosterPerson} RosterPerson
 */

/**
 * Load a roster from Map's activity schema.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {object} [options]
 * @param {(client: import("@supabase/supabase-js").SupabaseClient) => Promise<Array<object>>} [options.fetchOrganization] -
 *   Override the default `getOrganization` call for tests.
 * @returns {Promise<Roster>}
 */
export async function loadRosterFromMap(supabase, options = {}) {
  const fetch = options.fetchOrganization ?? getOrganization;
  const rows = await fetch(supabase);

  const byManager = new Map();
  for (const row of rows) {
    const managerEmail = (row.manager_email ?? "").toLowerCase();
    if (!managerEmail) continue;
    if (!byManager.has(managerEmail)) byManager.set(managerEmail, []);
    byManager.get(managerEmail).push(toRosterPerson(row));
  }

  const teams = new Map();
  for (const [managerEmail, members] of byManager.entries()) {
    teams.set(managerEmail, {
      id: managerEmail,
      type: "reporting",
      members,
      managerEmail,
    });
  }

  return { source: "map", teams, projects: new Map() };
}

function toRosterPerson(row) {
  const job = {
    discipline: row.discipline,
    level: row.level,
  };
  if (row.track) job.track = row.track;
  return {
    name: row.name ?? row.email,
    email: row.email,
    job,
  };
}
