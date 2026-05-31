/**
 * `fit-map substrate issue --email <e> --cwd <p>` — workflow-facing verb
 * that atomically writes the Landmark substrate for a chosen persona
 * into a target directory.
 *
 * Two files land under `--cwd`:
 *   - `.env` — `PRODUCT_LANDMARK_TOKEN=<jwt>` (one line, mode 0600)
 *   - `.substrate.json` — discovery vector (persona email, manager,
 *     snapshot id, item id; mode 0600)
 *
 * An optional `--stash <path>` flag writes the bare JWT to a third
 * workflow-private path (used by kata-interview.yml so a post-run log
 * scan has a tamper-resistant source for the JWT to grep for; the agent
 * has no access to `$RUNNER_TEMP`). Mode 0600.
 *
 * Rejects `kind != "human"` rows on purpose — service-account JWTs are
 * issued via `fit-map auth issue`. The substrate path is for engineer
 * personas only.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { isoTimestamp } from "@forwardimpact/libutil";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";
import { findAuthUser } from "../lib/auth-helpers.js";
import { formatSuccess } from "@forwardimpact/libcli";

/**
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{supabaseJwtSecret: () => string}} params.config
 * @param {{email?: string, cwd?: string, ttl?: string, stash?: string}} params.options
 * @param {import('@forwardimpact/libutil/runtime').Runtime} params.runtime - Injected collaborators (fs, proc, clock).
 * @returns {Promise<number>}
 */
export async function runSubstrateIssueCommand({
  supabase,
  config,
  options,
  runtime,
}) {
  const fs = runtime.fs;
  const { email, cwd, ttl, stash } = options;
  if (!email) throw new Error("substrate issue: --email <e> is required");
  if (!cwd) throw new Error("substrate issue: --cwd <path> is required");
  const ttlSeconds = parseDuration(ttl ?? "1h");

  const { data: row, error: rowErr } = await supabase
    .from("organization_people")
    .select("email,kind,manager_email")
    .eq("email", email)
    .maybeSingle();
  if (rowErr) throw new Error(`organization_people: ${rowErr.message}`);
  if (!row) {
    throw new Error(`substrate issue: no organization_people row for ${email}`);
  }
  if (row.kind !== "human") {
    throw new Error(
      `substrate issue: ${email} is kind=${row.kind}, not human ` +
        "(substrate is for engineer personas only; the operator surface " +
        "for service-account JWTs is `fit-map auth issue`)",
    );
  }

  const authUser = await findAuthUser(supabase, email);
  if (!authUser) {
    throw new Error(`substrate issue: no auth.users row for ${email}`);
  }

  const secret = config.supabaseJwtSecret();
  const jwt = mintSupabaseJwt({ email, secret, ttlSeconds });

  const { snapshot_id, item_id } = await resolveDiscoveryVector(supabase);

  const envPath = path.join(cwd, ".env");
  const subPath = path.join(cwd, ".substrate.json");
  const tag = `${runtime.proc.pid}-${randomBytes(4).toString("hex")}`;
  const envTmp = `${envPath}.tmp-${tag}`;
  const subTmp = `${subPath}.tmp-${tag}`;
  try {
    await fs.writeFile(envTmp, `PRODUCT_LANDMARK_TOKEN=${jwt}\n`, {
      mode: 0o600,
    });
    await fs.chmod(envTmp, 0o600);
    // Spec § Persona-corpus invariant (a): the persona IS the manager of
    // ≥1 other row (verified by findInvariantSatisfyingPersonas), so
    // `org team --manager <X>` and `practice --manager <X>` take the
    // persona's OWN email — not the persona's own manager.
    await fs.writeFile(
      subTmp,
      JSON.stringify(
        {
          persona_email: email,
          manager_email: email,
          snapshot_id,
          item_id,
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

async function resolveDiscoveryVector(supabase) {
  const { data: snaps } = await supabase
    .from("getdx_snapshots")
    .select("snapshot_id")
    .order("scheduled_for", { ascending: false })
    .limit(1);
  if (!snaps?.length) throw new Error("no getdx_snapshots rows");
  const snapshot_id = snaps[0].snapshot_id;
  const { data: scores } = await supabase
    .from("getdx_snapshot_team_scores")
    .select("item_id")
    .eq("snapshot_id", snapshot_id)
    .limit(1);
  if (!scores?.length) {
    throw new Error(
      `no getdx_snapshot_team_scores for snapshot ${snapshot_id}`,
    );
  }
  return { snapshot_id, item_id: scores[0].item_id };
}
