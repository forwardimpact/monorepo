/**
 * `fit-map people provision` — reconcile auth.users against the roster.
 *
 * Operator-only verb that uses the service-role-keyed client (the same
 * credential `fit-map people push` consumes) to call Supabase's
 * `auth.admin.*` API. Creates an `auth.users` row for every
 * `activity.organization_people.email`, restores rows previously banned,
 * and decommissions rows whose roster entry has been removed by setting
 * `banned_until` ≥100 years out.
 */

import {
  formatHeader,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";

const BAN_FOREVER = "876000h"; // ≈100 years; gotrue parses to a future banned_until.

async function listAuthUsers(supabase) {
  const out = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    if (!data.users.length) break;
    for (const u of data.users) out.set(u.email, u);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return out;
}

const FIFTY_YEARS_MS = 50 * 365 * 24 * 60 * 60 * 1000;

function isCurrentlyBanned(user) {
  return Boolean(user.banned_until && new Date(user.banned_until) > new Date());
}

async function reconcileRosterRow(supabase, email, existing, summary) {
  if (!existing) {
    const { error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    summary.created += 1;
    return;
  }
  if (isCurrentlyBanned(existing)) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      ban_duration: "none",
    });
    if (error) throw new Error(`unban ${email}: ${error.message}`);
    summary.restored += 1;
    return;
  }
  summary.unchanged += 1;
}

async function decommissionUser(supabase, email, user) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    ban_duration: BAN_FOREVER,
  });
  if (error) throw new Error(`ban ${email}: ${error.message}`);
  // gotrue's parsing of duration values >8760h is undocumented in older
  // releases; assert the resulting banned_until lands ≥50 years out so a
  // silent parse downgrade fails loudly rather than letting a still-active
  // account masquerade as decommissioned.
  const until = data?.user?.banned_until
    ? new Date(data.user.banned_until).getTime()
    : 0;
  if (until - Date.now() < FIFTY_YEARS_MS) {
    throw new Error(
      `ban ${email}: banned_until=${
        data?.user?.banned_until ?? "<missing>"
      } is < 50yr — refusing to silently downgrade decommission`,
    );
  }
}

/**
 * Run the people-provision command.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase - Service-role client.
 * @returns {Promise<{summary: object, meta: object}>}
 */
export async function runProvisionCommand({ supabase }) {
  process.stdout.write(
    formatHeader("Provisioning auth.users from organization_people") + "\n\n",
  );
  const { data: roster, error } = await supabase
    .from("organization_people")
    .select("email");
  if (error) throw new Error(`organization_people: ${error.message}`);
  const rosterEmails = new Set(roster.map((r) => r.email));
  const authUsers = await listAuthUsers(supabase);

  const summary = { created: 0, restored: 0, decommissioned: 0, unchanged: 0 };
  for (const email of rosterEmails) {
    await reconcileRosterRow(supabase, email, authUsers.get(email), summary);
  }
  for (const [email, user] of authUsers) {
    if (rosterEmails.has(email)) continue;
    if (isCurrentlyBanned(user)) continue;
    await decommissionUser(supabase, email, user);
    summary.decommissioned += 1;
  }
  for (const [k, v] of Object.entries(summary))
    process.stdout.write(formatBullet(`${k}: ${v}`, 0) + "\n");
  process.stdout.write("\n" + formatSuccess("Reconciliation complete") + "\n");
  return { summary, meta: { ok: true } };
}
