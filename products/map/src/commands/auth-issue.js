/**
 * `fit-map auth issue --email <e>` — mint a long-lived Supabase-shaped JWT
 * for an existing roster identity.
 *
 * Operator-only verb. Uses the service-role client (which we already need
 * to read `organization_people` and list `auth.users`) to verify both rows
 * exist before signing, then HMACs a JWT against SUPABASE_JWT_SECRET.
 * Output goes to stdout so the operator can capture it into `.env`, a
 * secret manager, or pipe it to an agent's `PRODUCT_LANDMARK_TOKEN` setting.
 */

import {
  formatHeader,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";
import { findAuthUser } from "../lib/auth-helpers.js";

const DEFAULT_TTL = "8760h"; // 1 year.

/**
 * Run the auth-issue command.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{supabaseJwtSecret: () => string}} params.config
 * @param {{email?: string, ttl?: string}} params.options
 * @returns {Promise<{summary: object, meta: object}>}
 */
export async function runAuthIssueCommand({ supabase, config, options }) {
  const email = options.email;
  if (!email) {
    throw new Error("auth issue: --email <e> is required");
  }
  const ttlString = options.ttl ?? DEFAULT_TTL;
  const ttlSeconds = parseDuration(ttlString);
  let secret;
  try {
    secret = config.supabaseJwtSecret();
  } catch (err) {
    throw new Error(
      "auth issue: SUPABASE_JWT_SECRET is not set. Run `just env-setup` " +
        "(local) or fetch the JWT secret from your Supabase project's API " +
        `settings (hosted) and export it. Underlying: ${err.message}`,
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
      "Export: PRODUCT_LANDMARK_TOKEN=<jwt above>; never commit or echo it.",
      0,
    ) + "\n",
  );
  process.stdout.write(formatSuccess("Done.") + "\n");
  return {
    summary: { email, kind: row.kind, ttlSeconds },
    meta: { ok: true },
  };
}
