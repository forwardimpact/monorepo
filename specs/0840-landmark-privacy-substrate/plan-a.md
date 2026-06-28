# Plan 0840-a — Landmark privacy substrate

Implements [spec.md](spec.md) under the architecture in
[design-a.md](design-a.md).

## Approach

Land the substrate bottom-up so each layer is independently testable: enable
Supabase Auth in `config.toml`, add the RLS+retention migration and indexes,
introduce the test JWT helper, build the identity resolver, rewrite
`createLandmarkClient` to take a JWT, wire the dispatcher chokepoint, then add
the two new verbs (`fit-landmark sources`, `fit-map people provision`) and
their docs. Existing commands need only the dispatcher rewiring — their query
modules are untouched because RLS clamps results server-side. Each step ends
in a green test command before the next begins.

Libraries used: `@supabase/supabase-js`
(`auth.admin.{listUsers,createUser,updateUserById}`, `createClient`).
`signTestToken` uses Node built-in `node:crypto` directly.

## Steps

### 1. Enable Supabase Auth and surface its env vars

- **Modified:** `products/map/supabase/config.toml` — replace the existing
  `[auth]` block (currently only `enabled = false`) with the block below; the
  new `[auth.email]` block is appended (no existing `[auth.email]` block to
  merge with):

```toml
[auth]
enabled = true
site_url = "http://localhost:3000"
jwt_expiry = 3600
enable_signup = false

[auth.email]
enable_signup = false
double_confirm_changes = false
enable_confirmations = false
```

- **Modified:** `products/map/src/commands/activity.js` (in `start()`,
  appended to the existing export block):

```js
process.stdout.write(`  export MAP_SUPABASE_ANON_KEY=${status.anon_key}\n`);
process.stdout.write(`  export MAP_SUPABASE_JWT_SECRET=${status.jwt_secret}\n\n`);
```

Verify: `bunx fit-map activity start` prints all four env vars;
`bunx fit-map activity status` reports the Auth service `RUNNING`;
`bun test products/map/test/activity-start.test.js` (added in step 8) asserts
the new export lines.

### 2. RLS + retention migration

- **Created:**
  `products/map/supabase/migrations/20260510000000_landmark_rls.sql`

```sql
-- Revoke prior grants on the six RLS'd tables only. Tables not in
-- the slice (e.g. activity.getdx_teams, activity.github_events) are
-- left untouched so the panel-flagged blast radius stays bounded.
REVOKE ALL ON
  activity.organization_people, activity.evidence,
  activity.github_artifacts, activity.getdx_snapshot_comments,
  activity.getdx_snapshot_team_scores, activity.getdx_snapshots
  FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA activity REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA activity REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- Re-grant SELECT to authenticated on the six RLS'd tables only.
GRANT SELECT ON activity.organization_people, activity.evidence,
  activity.github_artifacts, activity.getdx_snapshot_comments,
  activity.getdx_snapshot_team_scores, activity.getdx_snapshots
  TO authenticated;

ALTER TABLE activity.organization_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.github_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.getdx_snapshot_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.getdx_snapshot_team_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity.getdx_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY landmark_select ON activity.organization_people
  FOR SELECT TO authenticated
  USING (email = (SELECT auth.email()) OR manager_email = (SELECT auth.email()));

CREATE POLICY landmark_select ON activity.github_artifacts
  FOR SELECT TO authenticated
  USING (
    email = (SELECT auth.email()) OR EXISTS (
      SELECT 1 FROM activity.organization_people op
      WHERE op.email = github_artifacts.email
        AND op.manager_email = (SELECT auth.email())
    )
  );

CREATE POLICY landmark_select ON activity.evidence
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM activity.github_artifacts ga
    WHERE ga.artifact_id = evidence.artifact_id
  ));

CREATE POLICY landmark_select ON activity.getdx_snapshot_comments
  FOR SELECT TO authenticated
  USING (
    email = (SELECT auth.email()) OR EXISTS (
      SELECT 1 FROM activity.organization_people op
      WHERE op.email = getdx_snapshot_comments.email
        AND op.manager_email = (SELECT auth.email())
    )
  );

CREATE POLICY landmark_select ON activity.getdx_snapshot_team_scores
  FOR SELECT TO authenticated
  USING (getdx_team_id IN (
    SELECT getdx_team_id FROM activity.organization_people
    WHERE email = (SELECT auth.email()) OR manager_email = (SELECT auth.email())
  ));

CREATE POLICY landmark_select ON activity.getdx_snapshots
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_evidence_artifact_id
  ON activity.evidence(artifact_id);
CREATE INDEX IF NOT EXISTS idx_github_artifacts_email
  ON activity.github_artifacts(email);

-- Retention metadata.
COMMENT ON TABLE activity.organization_people IS '';
COMMENT ON TABLE activity.evidence IS
  'retention.window=P180D retention.clock=created_at';
COMMENT ON TABLE activity.github_artifacts IS
  'retention.window=P180D retention.clock=occurred_at';
COMMENT ON TABLE activity.getdx_snapshot_comments IS
  'retention.window=P730D retention.clock=timestamp';
COMMENT ON TABLE activity.getdx_snapshot_team_scores IS
  'retention.window=P730D retention.clock=imported_at';
COMMENT ON TABLE activity.getdx_snapshots IS
  'retention.window=P730D retention.clock=imported_at';

CREATE OR REPLACE FUNCTION activity._validate_retention_blob(t TEXT, blob TEXT)
RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
  win TEXT; clk TEXT; ok BOOL;
BEGIN
  IF blob IS NULL OR blob = '' THEN
    -- Empty admitted only for organization_people (null-window class).
    IF t <> 'organization_people' THEN
      RAISE EXCEPTION 'retention metadata missing for activity.%', t;
    END IF;
    RETURN;
  END IF;
  win := substring(blob FROM 'retention\.window=(P[0-9]+[DWMY])');
  clk := substring(blob FROM 'retention\.clock=([a-z_][a-z0-9_]*)');
  IF t = 'organization_people' AND win IS NULL AND clk IS NULL THEN
    RETURN;
  END IF;
  IF win IS NULL OR clk IS NULL THEN
    RAISE EXCEPTION 'retention metadata malformed for activity.%: %', t, blob;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'activity' AND table_name = t AND column_name = clk
  ) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'retention.clock=% references missing column on activity.%', clk, t;
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION activity.retention_blob(p_table TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT obj_description(format('activity.%I', p_table)::regclass, 'pg_class')
  WHERE p_table IN ('organization_people','evidence','github_artifacts',
    'getdx_snapshot_comments','getdx_snapshot_team_scores','getdx_snapshots');
$$;
GRANT EXECUTE ON FUNCTION activity.retention_blob(TEXT) TO authenticated, service_role;

-- Source inventory snapshot-id union, used by `fit-landmark sources`.
-- SECURITY INVOKER so RLS clamps inside the UNION; declared explicitly.
CREATE OR REPLACE FUNCTION activity.snapshot_ids_for_person(p_email TEXT)
RETURNS TABLE (snapshot_id TEXT)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT DISTINCT snapshot_id FROM activity.getdx_snapshot_comments
    WHERE email = p_email
  UNION
  SELECT DISTINCT s.snapshot_id FROM activity.getdx_snapshot_team_scores s
    JOIN activity.organization_people op
      ON op.getdx_team_id = s.getdx_team_id
    WHERE op.email = p_email;
$$;
GRANT EXECUTE ON FUNCTION activity.snapshot_ids_for_person(TEXT)
  TO authenticated, service_role;

DO $$
DECLARE
  rec RECORD;
  blob TEXT;
BEGIN
  FOR rec IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'activity' AND c.relname IN
      ('organization_people','evidence','github_artifacts',
       'getdx_snapshot_comments','getdx_snapshot_team_scores','getdx_snapshots')
  LOOP
    blob := obj_description(format('activity.%I', rec.relname)::regclass, 'pg_class');
    PERFORM activity._validate_retention_blob(rec.relname, blob);
  END LOOP;
END $$;
```

Verify: `bunx fit-map activity migrate` succeeds;
`bun test products/map/test/activity/migration-rls.test.js` (added in step 8)
passes; `psql` shows `relrowsecurity = true` on all six tables and the per-table
`COMMENT` blobs round-trip.

### 3. Test JWT helper

- **Created:** `products/landmark/test/lib/sign-test-token.js`

```js
import { createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";

const b64url = (b) => Buffer.from(b).toString("base64url");

export function signTestToken({ email, secret = process.env.MAP_SUPABASE_JWT_SECRET, ttlSeconds = 900 }) {
  if (!secret) throw new Error("signTestToken: MAP_SUPABASE_JWT_SECRET not set");
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(JSON.stringify({
    role: "authenticated", aud: "authenticated",
    email, sub: randomUUID(), iss: "supabase",
    iat: now, exp: now + ttlSeconds,
  }));
  const sig = createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}
```

Containment: never imported from `products/landmark/src/`. Step 8 adds a
guard test that greps `src/` for the helper path.

Verify: `bun test products/landmark/test/lib/sign-test-token.test.js` (added in
step 8) decodes the token and asserts the claim shape.

### 4. Identity resolver

- **Created:** `products/landmark/src/lib/identity.js`

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export class IdentityUnresolvedError extends Error {
  constructor(reason) {
    super(`Authentication required: ${reason}`);
    this.code = "LANDMARK_IDENTITY_UNRESOLVED";
  }
}

export function resolveIdentity(env = process.env) {
  const jwt = env.LANDMARK_AUTH_TOKEN;
  if (!jwt) throw new IdentityUnresolvedError(
    "LANDMARK_AUTH_TOKEN is not set. The Landmark CLI requires an authenticated caller — see `fit-landmark` --help for the issuance flow follow-up."
  );
  const parts = jwt.split(".");
  if (parts.length !== 3) throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is not a JWT");
  let claims;
  try { claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); }
  catch { throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN payload is not valid JSON"); }
  if (!claims.email) throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN missing email claim");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now())
    throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN is expired");
  // Defense in depth: when MAP_SUPABASE_JWT_SECRET is available (test
  // harness, local dev) verify the HMAC ourselves before trusting any
  // claim. Production engineer-side callers will not have the secret;
  // for them the contract is that `email` is opaque until the first
  // PostgREST round-trip succeeds — never log or branch on it before.
  if (env.MAP_SUPABASE_JWT_SECRET) {
    const expected = createHmac("sha256", env.MAP_SUPABASE_JWT_SECRET)
      .update(`${parts[0]}.${parts[1]}`).digest();
    const actual = Buffer.from(parts[2], "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
      throw new IdentityUnresolvedError("LANDMARK_AUTH_TOKEN signature does not verify");
  }
  return { email: claims.email, jwt };
}
```

Verify: `bun test products/landmark/test/lib/identity.test.js` (added in step 8)
covers missing, malformed, expired, no-email, forged-signature (with secret
present), and happy paths. When the secret is absent, signature verification is
left to Postgres at request time and the `email` claim is treated as opaque per
the comment.

### 5. Authenticated Supabase client

- **Modified:** `products/landmark/src/lib/supabase.js`

```js
import { createClient } from "@supabase/supabase-js";

export class SupabaseUnavailableError extends Error {
  constructor(reason) {
    super(`Supabase connection unavailable: ${reason}`);
    this.code = "LANDMARK_SUPABASE_UNAVAILABLE";
  }
}

export function createLandmarkClient({ jwt, url = process.env.MAP_SUPABASE_URL,
    anonKey = process.env.MAP_SUPABASE_ANON_KEY, schema = "activity" } = {}) {
  if (!url || !anonKey) throw new SupabaseUnavailableError(
    "MAP_SUPABASE_URL / MAP_SUPABASE_ANON_KEY not set. Run `fit-map activity start` and export the URL + anon key it prints."
  );
  if (!jwt) throw new SupabaseUnavailableError("missing JWT — resolveIdentity must run first");
  return createClient(url, anonKey, {
    db: { schema },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
}

export function isRelationNotFoundError(err) {
  return err?.code === "42P01" || err?.message?.includes("42P01");
}
```

Criterion 3a chokepoint: no `MAP_SUPABASE_SERVICE_ROLE_KEY` reference remains.

Verify: `grep -r MAP_SUPABASE_SERVICE_ROLE_KEY products/landmark/src/` returns
no matches; `bun test products/landmark/test/lib/supabase.test.js` (added in
step 8).

### 6. Dispatcher rewiring

- **Modified:** `products/landmark/src/lib/context.js`

```js
import { loadMapData, resolveFormat } from "./cli.js";
import { createLandmarkClient } from "./supabase.js";

export async function buildContext({ dataDir, options, needsSupabase, identity }) {
  const mapData = await loadMapData(dataDir);
  const supabase = needsSupabase ? createLandmarkClient({ jwt: identity.jwt }) : null;
  const format = resolveFormat(options);
  return { mapData, supabase, format, options, identity };
}
```

- **Modified:** `products/landmark/bin/fit-landmark.js` — add `resolveIdentity`
  import and the chokepoint in `main()`. Before/after the existing block:

```js
// before
import { SupabaseUnavailableError } from "../src/lib/supabase.js";
// ...
try {
  const dataDir = resolveDataDir(values);
  const ctx = await buildContext({
    dataDir, options: values, needsSupabase: entry.needsSupabase,
  });

// after
import { SupabaseUnavailableError } from "../src/lib/supabase.js";
import { resolveIdentity, IdentityUnresolvedError } from "../src/lib/identity.js";
// ...
try {
  const dataDir = resolveDataDir(values);
  let identity = null;
  if (entry.needsSupabase) identity = resolveIdentity();
  const ctx = await buildContext({
    dataDir, options: values, needsSupabase: entry.needsSupabase, identity,
  });
```

And in the existing `catch` block (`bin/fit-landmark.js:268-275`), prepend the
`IdentityUnresolvedError` branch:

```js
} catch (error) {
  if (error instanceof IdentityUnresolvedError) {
    cli.error(error.message); process.exit(4);
  }
  if (error instanceof SupabaseUnavailableError) {
    cli.error(error.message); process.exit(3);
  }
  cli.error(error.message); process.exit(1);
}
```

Verify: `bun test products/landmark/test/dispatcher.test.js` (added in step 8)
asserts exit codes 0/3/4 by spawning the binary via
`node:child_process.spawnSync`; manual smoke
`LANDMARK_AUTH_TOKEN= fit-landmark voice --email a@b` exits 4,
`fit-landmark marker x` exits 0.

### 7. New verbs

#### 7a. `fit-landmark sources`

- **Modified:** `products/landmark/src/lib/empty-state.js` — append:

```js
NO_SOURCES_FOR_PERSON: (email) =>
  `No sources retained for ${email} that you can see.`,
```

- **Created:** `products/map/src/activity/retention.js` (consumed by
  `sources.js` in this same step) and the matching entry in
  `products/map/package.json` `exports`:

```json
"./activity/retention": "./src/activity/retention.js"
```

```js
const TOKEN = /retention\.(window|clock)=([A-Za-z0-9_]+)/g;

export async function readRetention(supabase, table) {
  if (readRetention._cache?.has(table)) return readRetention._cache.get(table);
  const { data, error } = await supabase.rpc("retention_blob", { p_table: table });
  if (error) throw new Error(`readRetention: ${error.message}`);
  const blob = data ?? "";
  const out = { window: null, clock: null };
  for (const m of blob.matchAll(TOKEN)) out[m[1]] = m[2];
  if (!readRetention._cache) readRetention._cache = new Map();
  readRetention._cache.set(table, out);
  return out;
}

export function clearRetentionCache() { readRetention._cache?.clear(); }
```

`retention_blob` and `_validate_retention_blob` are added by the migration
in step 2.

- **Created:** `products/landmark/src/commands/sources.js` — exports
  `runSourcesCommand({ args, options, supabase })` returning `{ view, meta }`
  per design § Interfaces (`view.items[]` is the design's `items[]` field).

```js
import { readRetention } from "@forwardimpact/map/activity/retention";
import { EMPTY_STATES } from "../lib/empty-state.js";

export const needsSupabase = true;

const CLASSES = [
  { id: "organization_people", label: "Profile",
    plan: async (_s, e) => ({ table: "organization_people", filter: q => q.eq("email", e) }) },
  { id: "evidence", label: "Evidence",
    plan: async (_s, e) => ({ table: "evidence", select: "created_at,github_artifacts!inner(email)",
      filter: q => q.eq("github_artifacts.email", e) }) },
  { id: "github_artifacts", label: "GitHub artifacts",
    plan: async (_s, e) => ({ table: "github_artifacts", filter: q => q.eq("email", e) }) },
  { id: "getdx_snapshot_comments", label: "GetDX comments",
    plan: async (_s, e) => ({ table: "getdx_snapshot_comments", filter: q => q.eq("email", e) }) },
  { id: "getdx_snapshot_team_scores", label: "GetDX team scores",
    plan: async (s, e) => {
      const { data, error } = await s.from("organization_people")
        .select("getdx_team_id").eq("email", e).maybeSingle();
      if (error) throw error;
      const t = data?.getdx_team_id;
      return t ? { table: "getdx_snapshot_team_scores", filter: q => q.eq("getdx_team_id", t) } : null;
    } },
  { id: "getdx_snapshots", label: "GetDX snapshot cycles",
    plan: async (s, e) => {
      // One PostgREST round-trip via the SQL helper added in step 2.
      const { data, error } = await s.rpc("snapshot_ids_for_person", { p_email: e });
      if (error) throw error;
      const ids = (data ?? []).map(r => r.snapshot_id);
      return ids.length ? { table: "getdx_snapshots", filter: q => q.in("snapshot_id", ids) } : null;
    } },
];

export async function runSourcesCommand({ args: _args, options, supabase, format }) {
  const email = options.email;
  if (!email) throw new Error("sources: --email <e> is required");
  const items = [];
  for (const cls of CLASSES) {
    const plan = await cls.plan(supabase, email);
    if (!plan) continue;
    const ret = await readRetention(supabase, cls.id);
    const clock = ret.clock ?? "imported_at";
    const sel = plan.select ?? `${clock}`;
    const asc = plan.filter(supabase.from(plan.table).select(sel, { count: "exact" })
      .order(clock, { ascending: true }).limit(1));
    const desc = plan.filter(supabase.from(plan.table).select(sel)
      .order(clock, { ascending: false }).limit(1));
    // Surface auth/PostgREST errors as exceptions — never let a 401/403
    // collapse into a silent zero-row read indistinguishable from RLS empty.
    const [ascRes, descRes] = await Promise.all([asc, desc]);
    if (ascRes.error) throw ascRes.error;
    if (descRes.error) throw descRes.error;
    const { data: oldRows, count } = ascRes;
    const { data: newRows } = descRes;
    if (!count) continue;
    const oldest = oldRows[0]?.[clock] ?? null;
    const newest = newRows[0]?.[clock] ?? null;
    const falloff = ret.window && oldest ? addIso(oldest, ret.window) : null;
    items.push({ id: cls.id, label: cls.label, count, oldest, newest,
      window: ret.window, falloff });
  }
  if (!items.length) {
    return { view: null, meta: { format, emptyState: EMPTY_STATES.NO_SOURCES_FOR_PERSON(email) } };
  }
  return { view: { email, items }, meta: { format } };
}

function addIso(ts, p) {
  // Parses ISO 8601 P\d+[DWMY] subset declared in the migration grammar.
  const m = /^P(\d+)([DWMY])$/.exec(p);
  if (!m) return null;
  const d = new Date(ts); const n = Number(m[1]);
  if (m[2] === "D") d.setUTCDate(d.getUTCDate() + n);
  if (m[2] === "W") d.setUTCDate(d.getUTCDate() + 7 * n);
  if (m[2] === "M") d.setUTCMonth(d.getUTCMonth() + n);
  if (m[2] === "Y") d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.toISOString();
}
```

The `activity.snapshot_ids_for_person` SQL helper is shipped in the
step 2 migration (see above) so step 7's `bun test` can resolve the
RPC without re-touching the migration file. The Landmark client's
`db.schema = "activity"` makes
`supabase.rpc("snapshot_ids_for_person", …)` resolve to the
`activity.`-qualified function above.

- **Created:** `products/landmark/src/formatters/sources.js` —
  text/json/markdown exports mirroring `org.js` formatter shape, keyed off
  `result.items[]`.
- **Modified:** `products/landmark/src/formatters/index.js` — add `sources`
  to the imports and the `formatters` registry object.
- **Modified:** `products/landmark/bin/fit-landmark.js` — add
  `runSourcesCommand` import, add `sources: { handler: runSourcesCommand,
  needsSupabase: true }` to `COMMANDS`, add the `sources` row to the
  `commands` array with `options: { email: { type: "string", description:
  "Email to inventory sources for" } }`, append the example
  `"fit-landmark sources --email self@example.com"`, and add the
  documentation entry from step 9.

Verify: `bun test products/landmark/test/sources.test.js` (added in step 8)
covers populated, zero, scope-clamped, and falloff cases.

#### 7b. `fit-map people provision`

- **Created:** `products/map/src/commands/people-provision.js` — exports
  `runProvisionCommand({ supabase })` returning `{ meta, summary }` per
  design § Interfaces. The function expects a service-role-keyed client;
  `dispatchPeople` calls `mapClient(values)` which delegates to
  `createMapClient` in `products/map/src/lib/client.js:24-29` — that helper
  throws on a missing `MAP_SUPABASE_SERVICE_ROLE_KEY`, so the operator
  credential boundary is enforced by env-var presence, not by anything in
  this file. `auth.admin.*` calls bypass the client's `db.schema = "activity"`
  setting; the `from("organization_people")` read does honor it. Keeping
  `db.schema = "activity"` is a contract this verb relies on.

```js
import { formatHeader, formatSuccess, formatBullet } from "@forwardimpact/libcli";

const BAN_FOREVER = "876000h"; // ≈100 years; gotrue parses to a future banned_until.

async function listAuthUsers(supabase) {
  const out = new Map();
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    if (!data.users.length) break;
    for (const u of data.users) out.set(u.email, u);
    if (data.users.length < 1000) break;
    page += 1;
  }
  return out;
}

export async function runProvisionCommand({ args: _args, options: _options, supabase }) {
  process.stdout.write(formatHeader("Provisioning auth.users from organization_people") + "\n\n");
  const { data: roster, error } = await supabase.from("organization_people").select("email");
  if (error) throw new Error(`organization_people: ${error.message}`);
  const rosterEmails = new Set(roster.map(r => r.email));
  const authUsers = await listAuthUsers(supabase);

  const summary = { created: 0, restored: 0, decommissioned: 0, unchanged: 0 };
  for (const email of rosterEmails) {
    const existing = authUsers.get(email);
    if (!existing) {
      const { error } = await supabase.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw new Error(`createUser ${email}: ${error.message}`);
      summary.created += 1;
    } else if (existing.banned_until && new Date(existing.banned_until) > new Date()) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, { ban_duration: "none" });
      if (error) throw new Error(`unban ${email}: ${error.message}`);
      summary.restored += 1;
    } else {
      summary.unchanged += 1;
    }
  }
  const fiftyYears = 50 * 365 * 24 * 60 * 60 * 1000;
  for (const [email, user] of authUsers) {
    if (rosterEmails.has(email)) continue;
    if (user.banned_until && new Date(user.banned_until) > new Date()) continue;
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, { ban_duration: BAN_FOREVER });
    if (error) throw new Error(`ban ${email}: ${error.message}`);
    // gotrue's parsing of duration values >8760h is undocumented in older
    // releases; assert the resulting banned_until lands ≥50 years out so
    // a silent parse downgrade fails loudly rather than letting a still-
    // active account masquerade as decommissioned.
    const until = data?.user?.banned_until ? new Date(data.user.banned_until).getTime() : 0;
    if (until - Date.now() < fiftyYears) {
      throw new Error(`ban ${email}: banned_until=${data?.user?.banned_until ?? "<missing>"} is < 50yr — refusing to silently downgrade decommission`);
    }
    summary.decommissioned += 1;
  }
  // Operator-facing verb: presenter is intentionally inlined (header,
  // bullets, success line stream straight to stdout) while still
  // returning { summary, meta } for callers/tests to assert on. This
  // departs from the design § Interfaces "presenter is separate" rule
  // for the engineer-facing read verbs because operator output is part
  // of the verb's contract — `provision` is invoked interactively and
  // a silent pass would be a regression. The return shape lets tests
  // assert on `summary.{created,restored,decommissioned,unchanged}`
  // without depending on stdout capture.
  for (const [k, v] of Object.entries(summary))
    process.stdout.write(formatBullet(`${k}: ${v}`, 0) + "\n");
  process.stdout.write("\n" + formatSuccess("Reconciliation complete") + "\n");
  return { summary, meta: { ok: true } };
}
```

- **Modified:** `products/map/bin/fit-map.js`:
  - `dispatchPeople` adds the `provision` case:

```js
case "provision": {
  const supabase = await mapClient(values);
  const { runProvisionCommand } = await import("../src/commands/people-provision.js");
  await runProvisionCommand({ args: rest, options: values, supabase });
  return 0;
}
```

- `commands[]` row for `people` updates `args` to
  `<validate|push|provision> [file]`.
- Update the `people` `description` to mention `provision`.

Verify: `bun test products/map/test/activity/people-provision.test.js` (added in
step 8) covers create / idempotent re-run / decommission / re-add lifecycle,
asserting `id` stability across the no-op and re-add paths and that
`banned_until` is >50 years out for decommissioned rows.

### 8. Tests

Create or extend the following test files. Each has its own `bun test` target;
all are run by the existing top-level `bun run test`.

| New / extended | Coverage |
| --- | --- |
| `products/map/test/activity/migration-rls.test.js` (new) | criterion 1 (`pg_class.relrowsecurity`); criterion 2 anon zero-rows (note: `getdx_snapshots` is denied by the `GRANT` layer, the other five by RLS — the test exercises both layers via PostgREST as anon); retention `COMMENT` round-trip; index existence; criterion 6 (mutate one `COMMENT`, **call `clearRetentionCache()`**, re-read via `retention.js` — the cache is per-process and would otherwise return stale state). |
| `products/map/test/activity/rls-scope.test.js` (new) | criterion 2/4 — three callers (engineer A, manager M with reports A+B, engineer C under M'≠M) hit each of the six tables; assert per-row-class admit/deny matrix. Uses `signTestToken` to mint per-caller JWTs. **Fixture must include** at least one `getdx_snapshot_comments.email IS NULL` row and one `github_artifacts.email IS NULL` row; both must be invisible to every authenticated caller (the panel risk on null-attributed rows). |
| `products/map/test/activity/people-provision.test.js` (new) | criterion 10/11 — seeds N rows, runs `provision`, asserts `auth.admin.listUsers()` returns N matching active users; second run is no-op (count, ids, active state unchanged); remove → run → A is banned; second remove run no-op; re-add → A active again with same id. |
| `products/landmark/test/lib/identity.test.js` (new) | resolver branches (missing, malformed, expired, no email, happy). |
| `products/landmark/test/lib/sign-test-token.test.js` (new) | helper round-trips header+claims; signature is HMAC-SHA256 over `MAP_SUPABASE_JWT_SECRET`. |
| `products/landmark/test/lib/supabase.test.js` (new) | `createLandmarkClient` fails fast on missing url/anon/jwt; sets the `Authorization` header. |
| `products/landmark/test/lib/no-service-role-in-src.test.js` (new) | criterion 3a: greps `products/landmark/src/` **and `products/landmark/bin/`** for `MAP_SUPABASE_SERVICE_ROLE_KEY` and `auth.admin.` — both must be zero across both directories. Greps the same paths for any import string containing `/test/` (covers `sign-test-token` and any future test-only helper, robust against renames). |
| `products/landmark/test/dispatcher.test.js` (new) | criterion 3b — `spawnSync(process.execPath, ["bin/fit-landmark.js", "voice", "--email", "a@b"], { env: {} })` exits 4 and writes the auth-required message; same harness with `marker x` exits 0; with `LANDMARK_AUTH_TOKEN` set but `MAP_SUPABASE_URL` unset exits 3. The "no Supabase query before error" half is enforced structurally — `resolveIdentity` runs before `buildContext`, which is the only construction site for the client. |
| `products/map/test/activity-start.test.js` (new) | step 1 patch — invokes `start()` with a stubbed `supabaseCli` returning a known `status` JSON; asserts the printed block contains all four `MAP_SUPABASE_*` exports in order. (The existing `products/map/test/supabase-cli.test.js` covers the supabase-cli wrapper, not `activity.start()` printing.) |
| `products/landmark/test/sources.test.js` (new) | criterion 5 — populated classes appear with five fields; zero-count classes omitted; criterion 6 retention mutation reflected; criterion 7 — out-of-scope email returns `NO_SOURCES_FOR_PERSON`. |
| `products/landmark/test/regression-scope.test.js` (new) | criterion 9 — committed golden fixtures (`products/landmark/test/golden/{voice,evidence,readiness,coverage,timeline}-self.json`) capture the result of each `--email <self>` command **before** step 2 lands. The capture script `products/landmark/test/golden/capture.mjs` (also new) takes a pinned ref (defaulting to the spec's parent commit on `main`, recorded in `golden/CAPTURE_REF`) and runs each command via `git worktree add ../pre-0840 <ref>`, **never** `git stash` — stash is not reproducible after the migration lands. The script writes JSON deterministically (sort keys, freeze timestamps to the fixture seed). The runtime test re-runs each command under an Engineer-scope JWT bound to the same fixture self, asserts the criterion-9 tolerance shape (rows present, field values equal; row ordering, header timestamps, and error wording ignored), and **fails closed** if the worktree path is missing or `CAPTURE_REF` does not match the goldens' header sha. Re-running the capture in CI is opt-in via `--regenerate`. |
| `products/map/test/activity/integration.test.js` (extended) | criterion 8 (behavioral half) — end-to-end seed → migrate → `activity verify` passes against the migrated schema. |
| `products/map/test/activity/service-role-still-used.test.js` (new) | criterion 8 (static-inspection half) — greps `products/map/src/` for `MAP_SUPABASE_SERVICE_ROLE_KEY`; must be ≥ 1 reference (today: `products/map/src/lib/client.js:14-15`). Locks in that ingestion is *not* migrated to anon-keyed clients by accident in a future refactor. |
| `products/landmark/test/empty-state.test.js` (extended) | `EMPTY_STATES.NO_SOURCES_FOR_PERSON` is a function; calling it with an email returns a string that contains the email. |

**Live-Postgres harness contract.** Existing tests under
`products/map/test/activity/` use synthetic data and do not boot Supabase;
the `Test` workflow (`.github/workflows/check-test.yml`) does not start it
either. Six of the new test files (`migration-rls`, `rls-scope`,
`people-provision`, `sources`, `regression-scope`, `dispatcher` — the live
half) need a running stack. The contract:

1. Each live test starts with a guard:

   ```js
   if (!process.env.MAP_SUPABASE_URL || !process.env.MAP_SUPABASE_JWT_SECRET) {
     test.skip("requires `bunx fit-map activity start` env exports — skipping in CI");
     return;
   }
   ```

   so the suite passes in CI today.

2. **New:** `products/map/test/activity/lib/live.js` — exports
   `withLiveActivity(fn)`, which: (a) runs `bunx fit-map activity migrate`
   to apply the new RLS migration in the running stack; (b) runs
   `bunx fit-map activity seed --data <fixture>` against a per-test
   fixture under `products/map/test/fixtures/rls/`; (c) calls `fn(supabase)`
   with a service-role-keyed admin client for setup; (d) tears down by
   truncating the six tables. `migration-rls.test.js`, `rls-scope.test.js`,
   `people-provision.test.js`, and `sources.test.js` all wrap their cases
   in `withLiveActivity`.

3. **Local invocation:**
   `bunx fit-map activity start && eval "$(bunx fit-map activity status --env)" && bun run test`.
   (The `--env` flag printing a sourceable export block is a sub-task of step 1
   — already covered by the four `MAP_SUPABASE_*` exports.)

4. **CI invocation (follow-up, not blocking slice 1):** A separate workflow
   `check-test-live.yml` boots Supabase via `supabase/setup-cli` action
   before `bun run test`, exporting the same env vars. Tracked as a TODO
   in the PR body — not introduced here because this slice is the first
   one with live tests at all and the workflow shape is its own design
   discussion. Until that lands, criteria 1–11 are verified locally per
   the step 10 sweep; CI verifies only the unit-test half (identity,
   sign-test-token, supabase, no-service-role-in-src, empty-state,
   activity-start).

Verify: `bun run test` green; `bun run check` green; `bun run format`.

### 9. Docs

`products/map/src/activity/retention.js` is created in step 7a; the
`retention_blob` and `_validate_retention_blob` SQL helpers are added by
the step 2 migration. This step adds only the engineer- and operator-facing
documentation and the skill/CLI links into them.

- **Created:** `websites/fit/docs/products/engineering-data-sources/index.md` —
  engineer-facing guide to `fit-landmark sources --email <self>`. Covers the
  retained classes, retention windows, fall-off semantics ("projection, not
  guarantee of deletion"), and the auth prerequisite.
- **Created:** `websites/fit/docs/products/provisioning-engineers/index.md` —
  operator-facing guide to `fit-map people provision`. Covers the operator
  credential boundary (service-role required), idempotency, decommissioning
  semantics, and the engineer-side login follow-up.
- **Modified:** `.claude/skills/fit-landmark/SKILL.md` `## Documentation` —
  append, in the **same order** the CLI uses:

```markdown
- [List Engineering Data Sources](https://www.forwardimpact.team/docs/products/engineering-data-sources/index.md)
  — list the activity rows retained about an engineer and their fall-off dates.
```

- **Modified:** `.claude/skills/fit-map/SKILL.md` `## Documentation` — append:

```markdown
- [Provision Engineer Auth Users](https://www.forwardimpact.team/docs/products/provisioning-engineers/index.md)
  — reconcile `auth.users` against the roster so identity-derived RLS works.
```

- **Modified:** `products/landmark/bin/fit-landmark.js`
  `definition.documentation` — append:

```js
{ title: "List Engineering Data Sources",
  url: "https://www.forwardimpact.team/docs/products/engineering-data-sources/index.md",
  description: "List the activity rows retained about an engineer and their fall-off dates." },
```

- **Modified:** `products/map/bin/fit-map.js` `definition.documentation` —
  append:

```js
{ title: "Provision Engineer Auth Users",
  url: "https://www.forwardimpact.team/docs/products/provisioning-engineers/index.md",
  description: "Reconcile auth.users against the roster so identity-derived RLS works." },
```

Verify: `bun run context:fix` regenerates catalog rows; `bun run check` is
green.

### 10. Final integration sweep

Run the full sequence end-to-end against a fresh local stack to surface any
plan gaps before the panel:

```sh
bunx fit-map activity stop || true
bunx fit-map activity start
bunx fit-map activity seed --data ./data
bunx fit-map people provision
LANDMARK_AUTH_TOKEN=$(node -e 'import("./products/landmark/test/lib/sign-test-token.js").then(m=>process.stdout.write(m.signTestToken({email:"alice@example.com"})))') \
  bunx fit-landmark sources --email alice@example.com
bun run test
bun run check
```

Verify: each command exits 0; `sources` output lists at least three
populated classes with falloff dates; `bun run test` and `bun run check` are
green.

## Risks

| Risk | Why it's not visible from the plan | Mitigation |
| --- | --- | --- |
| `[auth] enabled = true` requires `supabase` CLI to pull the GoTrue Auth image; first-run is slow on CI runners with cold caches. | First-time activation under `bunx fit-map activity start`. | Step 10 sweep timeboxes the cold start; CI workflow already caches `~/.supabase`. If it bites, add an explicit `auth.image` pin in `config.toml`. |
| `auth.email()` returns `NULL` when the JWT is signed but the email claim is absent or the Postgres GUC `request.jwt.claims` is unset under direct `psql` connections (test harness path). | RLS test fixtures will silently return zero rows under a `psql` connection that does not set `request.jwt.claims`. | The `rls-scope.test.js` fixture goes through the PostgREST endpoint with `Authorization: Bearer <jwt>`, not raw `psql`. Documented in the test file header. |
| `get_team` with `SECURITY INVOKER` + RLS bottoms out at depth 1 — grand-reports drop. Pre-change Manager queries that walked the full subtree shrink to direct reports. | Behavior is intentional per design's behavior-changes table, but downstream consumers (`org team --manager`, `practice --manager`, etc.) may have callers depending on transitive walks. | Captured by criterion 9 regression test for `--email` paths and called out in the design's behavior-changes table for `--manager` paths; release notes must surface the change. |
| `auth.admin.listUsers()` paginates at 50 by default; `876000h` is parsed by `gotrue` as ≈100 years, but the parser is undocumented for values >`8760h` in older releases. | Supabase JS client masks the round-trip detail. | Pin `@supabase/supabase-js` ≥ 2.105 (already present). The version pin alone is not enough — the parser lives in `gotrue` (server-side), so `runProvisionCommand` asserts at runtime that `banned_until` lands ≥ 50 years out and aborts with a loud error if it does not (see step 7b body). `people-provision.test.js` exercises the same assertion. |
| Migration runs against schemas that have already been seeded with non-attributed `getdx_snapshot_comments` (`email IS NULL`) rows — those become invisible to all `authenticated` callers (intentional per design), but downstream aggregations may produce numbers that no longer match pre-change. | Behavior change is intentional per design but quietly affects rollups. | Plain-text bullet in PR body; criterion 9 test catches mismatches against pre-change fixtures. |
| `fit-codegen --all` regenerates proto stubs; this slice does not touch protos but a stale `generated/` checkout could mask a breakage. | Codegen runs at SessionStart but worktrees can skip it (per recurring pattern in staff-engineer summary). | Step 10 sweep runs `bun run check` which transitively requires generated artifacts; failure mode is loud. |

## Execution

Sequential — every step depends on the prior. Step 10 is the only step that
could parallelize, but it is purely verification.

Single agent: `staff-engineer` via `kata-implement`. No part of this plan is
better routed to `technical-writer` because the doc pages in step 9 are
tightly coupled to the CLI surface introduced in step 7 — splitting risks
drift between CLI `documentation[]` and skill `## Documentation`. TW remains
the right reviewer post-merge for prose polish.

— Staff Engineer 🛠️
