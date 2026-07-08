/**
 * Reconcile Supabase `auth.users` against the contract roster
 * (`substrate.people`) via the admin API, and look up individual auth
 * users by email. The contract's auth model: email identities, RLS keyed
 * on `auth.email()`, service-role key for provisioning.
 */

import {
  formatHeader,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";

const BAN_FOREVER = "876000h"; // ≈100 years; gotrue parses to a future banned_until.

/**
 * Look up a Supabase `auth.users` row by email via the admin API.
 * Iterates pages so it works on rosters larger than the API's page size.
 *
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} email
 * @returns {Promise<object | null>} The matching user row, or null if absent.
 */
export async function findAuthUser(supabase, email) {
  // listUsers() is paginated; iterate so rosters larger than one page
  // still resolve.
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const match = data.users.find((u) => u.email === email);
    if (match) return match;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}

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
    for (const u of data.users) {
      // Skip auth.users rows without an email — non-roster identities
      // (phone-auth users, pre-confirmed test seeds) the reconciler has
      // no opinion on. They are not product callers because RLS keys
      // off auth.email().
      if (typeof u.email !== "string" || !u.email) continue;
      out.set(u.email, u);
    }
    if (data.users.length < 1000) break;
    page += 1;
  }
  return out;
}

const FIFTY_YEARS_MS = 50 * 365 * 24 * 60 * 60 * 1000;

function isCurrentlyBanned(user, nowMs) {
  return Boolean(user.banned_until && Date.parse(user.banned_until) > nowMs);
}

async function reconcileRosterRow(supabase, email, existing, summary, nowMs) {
  if (!existing) {
    const { error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    summary.created += 1;
    return;
  }
  if (isCurrentlyBanned(existing, nowMs)) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      ban_duration: "none",
    });
    if (error) throw new Error(`unban ${email}: ${error.message}`);
    summary.restored += 1;
    return;
  }
  summary.unchanged += 1;
}

async function decommissionUser(supabase, email, user, nowMs) {
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    ban_duration: BAN_FOREVER,
  });
  if (error) throw new Error(`ban ${email}: ${error.message}`);
  // gotrue's parsing of duration values >8760h is undocumented in older
  // releases; assert the resulting banned_until lands ≥50 years out so a
  // silent parse downgrade fails loudly rather than letting a still-active
  // account masquerade as decommissioned. NaN (missing / unparseable
  // banned_until) is treated as 0 — never as a passing comparison.
  const parsed = data?.user?.banned_until
    ? Date.parse(data.user.banned_until)
    : 0;
  const until = Number.isFinite(parsed) ? parsed : 0;
  if (until - nowMs < FIFTY_YEARS_MS) {
    throw new Error(
      `ban ${email}: banned_until=${
        data?.user?.banned_until ?? "<missing>"
      } is < 50yr — refusing to silently downgrade decommission`,
    );
  }
}

/**
 * Reconcile `auth.users` against the `substrate.people` roster: create an
 * `auth.users` row for every roster email, restore rows previously banned,
 * and decommission rows whose roster entry has been removed by setting
 * `banned_until` ≥100 years out.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Service-role client bound to the `substrate` schema.
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (proc, clock).
 * @returns {Promise<{summary: object, meta: object}>}
 */
export async function runProvision({ supabase, runtime }) {
  const nowMs = runtime.clock.now();
  runtime.proc.stdout.write(
    formatHeader("Provisioning auth.users from substrate.people") + "\n\n",
  );
  const { data: roster, error } = await supabase.from("people").select("email");
  if (error) throw new Error(`substrate.people: ${error.message}`);
  const rosterEmails = new Set(roster.map((r) => r.email));
  const authUsers = await listAuthUsers(supabase);

  const summary = { created: 0, restored: 0, decommissioned: 0, unchanged: 0 };
  for (const email of rosterEmails) {
    await reconcileRosterRow(
      supabase,
      email,
      authUsers.get(email),
      summary,
      nowMs,
    );
  }
  for (const [email, user] of authUsers) {
    if (rosterEmails.has(email)) continue;
    if (isCurrentlyBanned(user, nowMs)) continue;
    await decommissionUser(supabase, email, user, nowMs);
    summary.decommissioned += 1;
  }
  for (const [k, v] of Object.entries(summary))
    runtime.proc.stdout.write(formatBullet(`${k}: ${v}`, 0) + "\n");
  runtime.proc.stdout.write(
    "\n" + formatSuccess("Reconciliation complete") + "\n",
  );
  return { summary, meta: { ok: true } };
}
