/**
 * `fit-map auth issue --email <e>` mints a long-lived Supabase-shaped JWT
 * for an existing roster identity.
 *
 * Operator-only verb. The command uses the service-role client to verify
 * that both rows exist. We already need that client to read
 * `organization_people` and to list `auth.users`. The command then HMACs a
 * JWT against JWT_SECRET.
 * The output goes to stdout. The operator can capture it into `.env` or a
 * secret manager. The operator can also pipe it to an agent's
 * `PRODUCT_LANDMARK_TOKEN` setting.
 */

import {
  formatHeader,
  formatSuccess,
  formatBullet,
} from "@forwardimpact/libcli";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";
import { findAuthUser } from "@forwardimpact/libterrain/substrate";

const DEFAULT_TTL = "8760h"; // 1 year.

/**
 * Run the auth-issue command.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{supabaseJwtSecret: () => string}} params.config
 * @param {{email?: string, ttl?: string}} params.options
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (proc).
 * @returns {Promise<{summary: object, meta: object}>}
 */
export async function runAuthIssueCommand({
  supabase,
  config,
  options,
  runtime,
}) {
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
      "auth issue: JWT_SECRET is not set. " +
        "Fetch the JWT secret from your Supabase project Settings → API " +
        "(or, for monorepo contributors, run `just env-setup`). " +
        `Underlying: ${err.message}`,
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
        "Run `fit-terrain substrate provision` first.",
    );
  }

  const jwt = mintSupabaseJwt({ email, secret, ttlSeconds }, runtime);
  runtime.proc.stdout.write(
    formatHeader(`Issued JWT for ${email} (${row.kind}, ttl=${ttlString})`) +
      "\n\n",
  );
  runtime.proc.stdout.write(jwt + "\n\n");
  runtime.proc.stdout.write(
    formatBullet(
      "Export: PRODUCT_LANDMARK_TOKEN=<jwt above>. Never commit or echo it.",
      0,
    ) + "\n",
  );
  runtime.proc.stdout.write(formatSuccess("Done.") + "\n");
  return {
    summary: { email, kind: row.kind, ttlSeconds },
    meta: { ok: true },
  };
}
