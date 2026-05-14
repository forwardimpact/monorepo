/**
 * `fit-map auth issue --email <e>` — mint a long-lived Supabase-shaped JWT
 * for an existing roster identity.
 *
 * Operator-only verb. Uses the service-role client (which we already need
 * to read `organization_people` and list `auth.users`) to verify both rows
 * exist before signing, then HMACs a JWT against MAP_SUPABASE_JWT_SECRET.
 * Output goes to stdout so the operator can capture it into `.env`, a
 * secret manager, or pipe it to an agent's `LANDMARK_AUTH_TOKEN` setting.
 */

import {
  formatHeader,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";

const DEFAULT_TTL = "8760h"; // 1 year.

async function findAuthUser(supabase, email) {
  // Roster size in the hundreds; one page covers any practical org.
  // listUsers() returns paginated results; iterate to be safe.
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

/**
 * Run the auth-issue command.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{email?: string, ttl?: string}} params.options
 * @returns {Promise<{summary: object, meta: object}>}
 */
export async function runAuthIssueCommand({ supabase, options }) {
  const email = options.email;
  if (!email) {
    throw new Error("auth issue: --email <e> is required");
  }
  const ttlString = options.ttl ?? DEFAULT_TTL;
  const ttlSeconds = parseDuration(ttlString);
  const secret = process.env.MAP_SUPABASE_JWT_SECRET;
  if (!secret) {
    throw new Error(
      "auth issue: MAP_SUPABASE_JWT_SECRET is not set. Run `fit-map " +
        "activity start` (local) or fetch the JWT secret from your Supabase " +
        "project's API settings (hosted) and export it.",
    );
  }

  const { data: row, error: rowErr } = await supabase
    .from("organization_people")
    .select("email,kind")
    .eq("email", email)
    .maybeSingle();
  if (rowErr) throw new Error(`organization_people: ${rowErr.message}`);
  if (!row) {
    throw new Error(
      `auth issue: no organization_people row for ${email}. ` +
        "Run `fit-map people push` first.",
    );
  }

  const authUser = await findAuthUser(supabase, email);
  if (!authUser) {
    throw new Error(
      `auth issue: no auth.users row for ${email}. ` +
        "Run `fit-map people provision` first.",
    );
  }

  const jwt = mintSupabaseJwt({ email, secret, ttlSeconds });
  process.stdout.write(
    formatHeader(`Issued JWT for ${email} (${row.kind}, ttl=${ttlString})`) +
      "\n\n",
  );
  process.stdout.write(jwt + "\n\n");
  process.stdout.write(
    formatBullet(
      "Export: LANDMARK_AUTH_TOKEN=<jwt above>; never commit or echo it.",
      0,
    ) + "\n",
  );
  process.stdout.write(formatSuccess("Done.") + "\n");
  return {
    summary: { email, kind: row.kind, ttlSeconds },
    meta: { ok: true },
  };
}
