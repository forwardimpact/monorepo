/**
 * `fit-terrain substrate issue --email <e> --cwd <p> --token-env <NAME>` —
 * mint a persona JWT and atomically write the substrate file set into a
 * target directory.
 *
 * Files under `--cwd`:
 *   - `.env` — `<NAME>=<jwt>` (one line, mode 0600). `--token-env` is
 *     required with no default, so no product literal survives in this
 *     library; the caller owns the variable name.
 *   - `.substrate.json` — the folded `substrate.discovery` key/values
 *     (spread, not nested) plus `persona_email`, `manager_email`, and
 *     `generated_at` (mode 0600). An absent or empty discovery relation
 *     yields an identity-only file — declared degradation.
 *
 * An optional `--stash <path>` writes the bare JWT to a third
 * caller-private path (mode 0600) so a post-run log scan has a
 * tamper-resistant source to grep for.
 *
 * Rejects `kind != "human"` rows on purpose — the substrate path is for
 * personas only, per `substrate.people`'s kind column.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { isoTimestamp } from "@forwardimpact/libutil";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";
import { findAuthUser } from "../substrate/auth-users.js";
import { loadDiscovery } from "../substrate/persona-query.js";
import { formatSuccess } from "@forwardimpact/libcli";

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase -
 *   Client bound to the `substrate` schema.
 * @param {{supabaseJwtSecret: () => string}} params.config
 * @param {{email?: string, cwd?: string, tokenEnv?: string, ttl?: string, stash?: string}} params.options
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs, proc, clock).
 * @returns {Promise<number>}
 */
export async function runSubstrateIssue({
  supabase,
  config,
  options,
  runtime,
}) {
  const fs = runtime.fs;
  const { email, cwd, tokenEnv, ttl, stash } = options;
  if (!email) throw new Error("substrate issue: --email <e> is required");
  if (!cwd) throw new Error("substrate issue: --cwd <path> is required");
  if (!tokenEnv) {
    throw new Error("substrate issue: --token-env <NAME> is required");
  }
  const ttlSeconds = parseDuration(ttl ?? "1h");

  const { data: row, error: rowErr } = await supabase
    .from("people")
    .select("email,kind,manager_email")
    .eq("email", email)
    .maybeSingle();
  if (rowErr) throw new Error(`substrate.people: ${rowErr.message}`);
  if (!row) {
    throw new Error(`substrate issue: no substrate.people row for ${email}`);
  }
  if (row.kind !== "human") {
    throw new Error(
      `substrate issue: ${email} is kind=${row.kind}, not human ` +
        "(substrate.people kind=human rows are the persona surface; " +
        "service identities are not issuable here)",
    );
  }

  const authUser = await findAuthUser(supabase, email);
  if (!authUser) {
    throw new Error(`substrate issue: no auth.users row for ${email}`);
  }

  const secret = config.supabaseJwtSecret();
  const jwt = mintSupabaseJwt({ email, secret, ttlSeconds }, runtime);

  const discovery = await loadDiscovery(supabase);

  const envPath = path.join(cwd, ".env");
  const subPath = path.join(cwd, ".substrate.json");
  const tag = `${runtime.proc.pid}-${randomBytes(4).toString("hex")}`;
  const envTmp = `${envPath}.tmp-${tag}`;
  const subTmp = `${subPath}.tmp-${tag}`;
  try {
    await fs.writeFile(envTmp, `${tokenEnv}=${jwt}\n`, { mode: 0o600 });
    await fs.chmod(envTmp, 0o600);
    // Structural invariant (b): the persona IS the manager of ≥1 other row
    // (verified by findInvariantSatisfyingPersonas), so manager-scoped
    // queries take the persona's OWN email — not the persona's own manager.
    await fs.writeFile(
      subTmp,
      JSON.stringify(
        {
          persona_email: email,
          manager_email: email,
          ...(discovery ?? {}),
          generated_at: isoTimestamp(runtime.clock.now()),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    await fs.chmod(subTmp, 0o600);

    await fs.rename(envTmp, envPath);
    await fs.rename(subTmp, subPath);
  } finally {
    // Best-effort cleanup if either rename failed mid-way.
    for (const orphan of [envTmp, subTmp]) {
      try {
        await fs.unlink(orphan);
      } catch {
        // expected after successful rename
      }
    }
  }

  if (stash) {
    await fs.writeFile(stash, jwt + "\n", { mode: 0o600 });
    await fs.chmod(stash, 0o600);
  }

  runtime.proc.stdout.write(
    formatSuccess(`Issued substrate for ${email}`) + "\n",
  );
  return 0;
}
