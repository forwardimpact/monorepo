/**
 * `fit-landmark org show|team` — organization directory views.
 */

import {
  getOrganization,
  getTeam,
} from "@forwardimpact/map/activity/queries/org";

import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = true;

/**
 * @param {object} params
 * @param {string[]} params.args
 * @param {object} params.options
 * @param {object} params.supabase
 * @param {string} params.format
 * @param {object} [params.queries] - Injectable query module for testing.
 */
export async function runOrgCommand({
  args,
  options,
  supabase,
  format,
  queries,
}) {
  const q = queries ?? { getOrganization, getTeam };
  const [sub] = args;

  switch (sub) {
    case "show":
      return showOrganization({ supabase, format, q });
    case "team":
      return showTeam({
        supabase,
        managerEmail: options.manager,
        format,
        q,
      });
    default:
      throw new Error('org: expected "show" or "team" subcommand');
  }
}

async function showOrganization({ supabase, format, q }) {
  const people = await q.getOrganization(supabase);
  if (!people || people.length === 0) {
    return {
      view: null,
      meta: { format, emptyState: EMPTY_STATES.NO_ORGANIZATION },
    };
  }
  return { view: { people }, meta: { format } };
}

async function showTeam({ supabase, managerEmail, format, q }) {
  if (!managerEmail) {
    throw new Error("org team: --manager <email> is required");
  }
  const members = await q.getTeam(supabase, managerEmail);
  if (!members || members.length === 0) {
    return {
      view: null,
      meta: {
        format,
        emptyState: EMPTY_STATES.MANAGER_NOT_FOUND(managerEmail),
      },
    };
  }
  return { view: { team: members, managerEmail }, meta: { format } };
}
