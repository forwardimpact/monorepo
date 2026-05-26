/**
 * Self-smoke for `fit-map substrate stage`. Mints a short-lived JWT for
 * the first invariant-satisfying persona and invokes every
 * `needsSupabase: true` command in fit-landmark's COMMANDS map to confirm
 * the seeded substrate answers every gated command to non-error
 * completion. Three row-class commands (`org team`, `evidence`,
 * `practice`) additionally assert non-empty payloads scoped to the
 * persona.
 */

import { spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";

const ROW_CLASS_KEYS = {
  "org team": "team",
  evidence: "evidence",
  practice: "patterns",
};

// Use the parent process's cwd (the CI checkout root) for bunx spawns so
// fit-landmark resolves via the workspace; a fresh tmpdir would push bunx
// up the filesystem looking for node_modules, hit nothing, and 404 from
// npm. JWT/secret isolation comes from spawn-options env, not cwd.
function fitLandmarkSpawn(argv, extraEnv = {}) {
  return spawnSync("bunx", ["fit-landmark", ...argv], {
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

function fetchManifest() {
  const manifestRes = fitLandmarkSpawn(["_commands"]);
  if (manifestRes.status !== 0) {
    throw new Error(`_commands: ${manifestRes.stderr}`);
  }
  return JSON.parse(manifestRes.stdout);
}

/**
 * Expand the manifest into a flat list of {command, smokeOptions} pairs
 * the smoke loop spawns. Exported for unit-testing the iteration logic.
 * @param {{commands: object, subcommandExpansions: object, flatSmokeOptions: object}} manifest
 * @returns {Array<{command: string, smokeOptions: object}>}
 */
export function buildSmokeList({
  commands,
  subcommandExpansions,
  flatSmokeOptions,
}) {
  const list = [];
  for (const [name, entry] of Object.entries(commands)) {
    if (!entry.needsSupabase) continue;
    if (subcommandExpansions[name]) {
      list.push(...subcommandExpansions[name]);
    } else {
      list.push({ command: name, smokeOptions: flatSmokeOptions[name] ?? {} });
    }
  }
  return list;
}

/**
 * Build the argv array for one smoke invocation. Exported for tests.
 * @param {{command: string, smokeOptions: object}} item
 * @param {object} persona
 * @param {{snapshot_id: string, item_id: string}} discovery
 * @returns {string[]}
 */
export function buildSmokeArgv({ command, smokeOptions }, persona, discovery) {
  const argv = command.split(" ");
  for (const [k, v] of Object.entries(smokeOptions)) {
    argv.push(`--${k}`, expand(v, persona, discovery));
  }
  argv.push("--format", "json");
  return argv;
}

function runSmokeCommand(argv, jwt) {
  const res = fitLandmarkSpawn(argv, { PRODUCT_LANDMARK_TOKEN: jwt });
  if (res.status !== 0) {
    throw new Error(`${argv.join(" ")} exited ${res.status}: ${res.stderr}`);
  }
  return res;
}

/**
 * Run the self-smoke. Throws with a descriptive `[substrate stage: smoke]`-
 * style error on any failure; caller wraps in a phase tag.
 *
 * @param {object} params
 * @param {import("@supabase/supabase-js").SupabaseClient} params.supabase
 * @param {{supabaseJwtSecret: () => string}} params.config
 * @returns {Promise<void>}
 */
export async function runSelfSmoke({ supabase, config }) {
  const { findInvariantSatisfyingPersonas } = await import(
    "./substrate-persona-query.js"
  );
  const { personas, discovery, diagnostic } =
    await findInvariantSatisfyingPersonas({ supabase });
  if (!personas.length) throw new Error(diagnostic);
  const persona = personas[0];

  const secret = config.supabaseJwtSecret();
  const jwt = mintSupabaseJwt({
    email: persona.email,
    secret,
    ttlSeconds: parseDuration("1h"),
  });

  // Spec § Success Criteria rows 1–4: explicit shape check.
  assertJwtShape(jwt, persona.email);
  await assertPersonaIsHuman(supabase, persona.email);
  assertDiscoveryResolves(persona, discovery);

  const manifest = fetchManifest();
  const smokeList = buildSmokeList(manifest);

  for (const item of smokeList) {
    const argv = buildSmokeArgv(item, persona, discovery);
    const res = runSmokeCommand(argv, jwt);
    const rowKey = ROW_CLASS_KEYS[item.command];
    if (rowKey) assertNonEmpty(res.stdout, rowKey);
  }
}

function expand(template, persona, discovery) {
  return template
    .replace("$PERSONA_EMAIL", persona.email)
    .replace("$SNAPSHOT_ID", discovery.snapshot_id)
    .replace("$ITEM_ID", discovery.item_id);
}

/**
 * Verify a JWT's payload carries the Supabase-Auth claims the smoke loop
 * requires (aud, role, email, future exp). Throws on any mismatch.
 * @param {string} jwt
 * @param {string} expectedEmail
 */
export function assertJwtShape(jwt, expectedEmail) {
  const [, payloadB64] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  if (claims.aud !== "authenticated") {
    throw new Error(`JWT aud != authenticated: ${claims.aud}`);
  }
  if (claims.role !== "authenticated") {
    throw new Error(`JWT role != authenticated: ${claims.role}`);
  }
  if (claims.email !== expectedEmail) {
    throw new Error(`JWT email mismatch: ${claims.email}`);
  }
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now()) {
    throw new Error(`JWT exp claim missing or in the past: ${claims.exp}`);
  }
}

/**
 * Confirm an `organization_people` row exists for `email` and carries
 * `kind = "human"`. Throws otherwise.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @param {string} email
 */
export async function assertPersonaIsHuman(supabase, email) {
  const { data, error } = await supabase
    .from("organization_people")
    .select("kind")
    .eq("email", email)
    .maybeSingle();
  if (error) throw new Error(`organization_people: ${error.message}`);
  if (data?.kind !== "human") {
    throw new Error(`persona ${email} kind=${data?.kind}, not human`);
  }
}

/**
 * Verify both the persona row and discovery vector carry the values the
 * smoke loop will substitute into command argv placeholders. The
 * `parent_email` field is the operator-surface name for the persona's
 * organizational parent; the assertion gates "persona has a non-null
 * parent".
 * @param {object} persona
 * @param {{snapshot_id: string, item_id: string}} discovery
 */
export function assertDiscoveryResolves(persona, discovery) {
  if (!persona.email || !persona.parent_email) {
    throw new Error(
      `persona missing email/parent_email: ${JSON.stringify(persona)}`,
    );
  }
  if (!discovery.snapshot_id || !discovery.item_id) {
    throw new Error(
      `discovery vector incomplete: ${JSON.stringify(discovery)}`,
    );
  }
}

/**
 * Assert the named row collection in a JSON stdout payload is non-empty.
 * Exported for tests.
 * @param {string} stdout
 * @param {string} key
 */
export function assertNonEmpty(stdout, key) {
  const parsed = JSON.parse(stdout);
  const v = parsed[key];
  const empty =
    v === undefined ||
    v === null ||
    (Array.isArray(v) && v.length === 0) ||
    (!Array.isArray(v) && typeof v === "object" && Object.keys(v).length === 0);
  if (empty) {
    throw new Error(`row-class non-empty assertion failed for ${key}`);
  }
}
