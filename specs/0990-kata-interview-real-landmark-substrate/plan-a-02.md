# Plan 0990-a Part 02 — `fit-map substrate {stage, roster, issue}`

Implements the three new `fit-map substrate` subcommands and the dispatcher
that routes them. The `fit-map auth issue` operator verb is untouched.
Depends on Part 01 (`PRODUCT_LANDMARK_TOKEN` rename + `config.token`).

## Schema reality check (used throughout this part)

The `activity` schema as it exists on `origin/main` (see
`products/map/supabase/migrations/20250101000000_activity_schema.sql`):

- `activity.organization_people` columns: `email`, `name`,
  `github_username`, `discipline`, `level`, `track`, `manager_email`,
  `updated_at`. **No `team` or `role` column.** The kind discriminator
  added in `20260514000000_organization_people_kind.sql` adds `kind`.
- `activity.evidence` joins authorship through
  `evidence(artifact_id) → github_artifacts.artifact_id`, and
  `github_artifacts.email` references `organization_people.email`.
  **There is no `evidence.author_email` column.**
- `activity.getdx_snapshot_team_scores` is the table that carries
  `snapshot_id`, `item_id`, `getdx_team_id`, `score`. **Not
  `team_snapshot_scores`.**

Every SQL/Supabase query below uses these names.

## Step 1 — Register `substrate` and its three subcommands in libcli

- **Modified**: `products/map/bin/fit-map.js` (the libcli `commands`
  array; locate the existing `auth` entry via
  `rg '"auth"' products/map/bin/fit-map.js`)

Add three sibling entries to the `commands` array (one per subcommand)
so libcli's `--help` is per-subcommand and option flags are scoped to
the subcommand that accepts them. The libcli `commands` array supports
space-separated names today (e.g. `"org show"` at fit-landmark.js:75) —
the same shape works here:

```js
{
  name: "substrate stage",
  description:
    "Provision a Landmark substrate (stack + migrate + seed + provision + self-smoke)",
},
{
  name: "substrate roster",
  description:
    "List invariant-satisfying personas from the seeded substrate",
  options: {
    format: { type: "string", description: "Output format (text|json)" },
  },
},
{
  name: "substrate issue",
  description:
    "Atomically write .env (JWT) and .substrate.json (discovery vector) into a target dir",
  options: {
    email: { type: "string", description: "Persona email" },
    cwd: { type: "string", description: "Target dir for the atomic write" },
    ttl: { type: "string", description: "JWT TTL (e.g. 1h, 30d). Default 1h." },
    stash: {
      type: "string",
      description:
        "Optional second path to write the bare JWT to (workflow-private; not for external operators)",
    },
  },
},
```

Verify: `bunx fit-map substrate stage --help` shows the synopsis for
that subcommand only; `bunx fit-map substrate issue --help` shows only
`--email`, `--cwd`, `--ttl`. No accidental `--ttl` leak onto `stage`.

## Step 2 — Wire dispatch for `substrate` in `main()`

- **Modified**: `products/map/bin/fit-map.js`

Add `dispatchSubstrate` alongside the existing `dispatchAuth` (parallel
shape; `config` is module-scoped at the top of the file and stays
accessible to both dispatchers). Route `case "substrate"` in the
`main()` switch.

```js
async function dispatchSubstrate(subcommand, _rest, values) {
  switch (subcommand) {
    case "stage": {
      const { runStageCommand } = await import(
        "../src/commands/substrate-stage.js"
      );
      return runStageCommand({ config });
    }
    case "roster": {
      const supabase = await mapClient();
      const { runRosterCommand } = await import(
        "../src/commands/substrate-roster.js"
      );
      return runRosterCommand({ supabase, options: { format: values.format } });
    }
    case "issue": {
      const supabase = await mapClient();
      const { runSubstrateIssueCommand } = await import(
        "../src/commands/substrate-issue.js"
      );
      return runSubstrateIssueCommand({
        supabase,
        config,
        options: {
          email: values.email,
          cwd: values.cwd,
          ttl: values.ttl,
          stash: values.stash,
        },
      });
    }
    default:
      cli.usageError(`unknown substrate subcommand: ${subcommand || "(none)"}`);
      return 1;
  }
}
```

Add the case in `main()` after `case "auth"`:

```js
case "substrate":
  exitCode = await dispatchSubstrate(subcommand, rest, values);
  break;
```

## Step 3 — Extract `findDataDir` to a reusable module

- **Created**: `products/map/src/lib/data-dir.js`
- **Modified**: `products/map/bin/fit-map.js` (imports the new module
  instead of carrying the local copy)

Move the existing `findDataDir` function from `bin/fit-map.js` to
`src/lib/data-dir.js`. The new module exports `findDataDir(providedPath,
{ fs?, process?, homedir? })`; the existing call sites in `bin/fit-map.js`
pass `providedPath` only and rely on the same `Finder` plumbing as
today. `substrate-stage.js` and any future substrate verb import
`findDataDir` from `../lib/data-dir.js`.

Verify: `bun test products/map/test/activity/` exits 0 — the existing
test surface continues to pass because `findDataDir`'s public behaviour
is preserved.

## Step 4 — Create `substrate-stage.js`

- **Created**: `products/map/src/commands/substrate-stage.js`

Workspace-prep terminal phase. Responsibilities, in order:

| Phase | Action | Failure behaviour |
|---|---|---|
| 1. Stack | `createSupabaseCli().run(["start"])` | Throw `[substrate stage: stack]` |
| 2. URL discovery | `createSupabaseCli().capture(["status", "--output", "json"])` → parse → expose `SUPABASE_URL` via `process.env` for subsequent code that constructs `mapClient` | Throw `[substrate stage: url-discovery]` |
| 3. Migrate | `createSupabaseCli().run(["db", "reset"])` | Throw `[substrate stage: migrate]` |
| 4. Seed | Invoke `activity.seed({ data, supabase })` (same export `fit-map activity seed` uses today) | Throw `[substrate stage: seed]` |
| 5. Provision | Invoke `runProvisionCommand({ supabase })` from `people-provision.js` | Throw `[substrate stage: provision]` |
| 6. Self-smoke | See Step 4b | Throw `[substrate stage: smoke]` |

Pseudocode for `runStageCommand({ config })`:

```js
import path from "node:path";
import { createSupabaseCli } from "../lib/supabase-cli.js";
import { findDataDir } from "../lib/data-dir.js";
import { createMapClient } from "../lib/client.js";
import { runProvisionCommand } from "./people-provision.js";
import * as activity from "./activity.js";
import { runSelfSmoke } from "./substrate-smoke.js";  // Step 4b
import { formatSuccess } from "@forwardimpact/libcli";

export async function runStageCommand({ config }) {
  const cli = createSupabaseCli();

  await runPhase("stack", () => cli.run(["start"]));

  await runPhase("url-discovery", async () => {
    const json = await cli.capture(["status", "--output", "json"]);
    const status = JSON.parse(json);
    // libconfig's #env() reads process.env first; setting these here
    // makes every downstream mapClient + fit-landmark child observe
    // the live local-stack values.
    if (!status.api_url) throw new Error("supabase status: no api_url");
    if (!status.anon_key) throw new Error("supabase status: no anon_key");
    process.env.SUPABASE_URL = status.api_url;
    process.env.SUPABASE_ANON_KEY = status.anon_key;
  });

  await runPhase("migrate", () => cli.run(["db", "reset"]));

  const supabase = await createMapClient({ config });
  const dataRoot = path.dirname(await findDataDir(undefined));
  await runPhase("seed", () => activity.seed({ data: dataRoot, supabase }));
  await runPhase("provision", () => runProvisionCommand({ supabase }));

  if (process.env.SUBSTRATE_FORCE_EMPTY_CORPUS === "true") {
    throw new Error("[substrate stage: smoke] empty corpus (test injection)");
  }
  await runPhase("smoke", () => runSelfSmoke({ supabase, config }));

  process.stdout.write(formatSuccess("Substrate ready") + "\n");
  return 0;
}

async function runPhase(name, fn) {
  try {
    await fn();
  } catch (err) {
    throw new Error(`[substrate stage: ${name}] ${err.message}`);
  }
}
```

The `SUBSTRATE_FORCE_EMPTY_CORPUS` branch supports Part 03 Step 9's
failure-surfacing CI test; the cross-part contract is named here so the
implementer of Part 02 wires it.

### Step 4a — Persona-invariant helper (Supabase JS client, no SQL views)

- **Created**: `products/map/src/commands/substrate-persona-query.js`

Single export `findInvariantSatisfyingPersonas({ supabase })` returning
`{ personas: Array<PersonaRow>, discovery: { snapshot_id, item_id },
diagnostic?: string }`. Because the spec § Out-of-scope row forbids
changes under `products/map/supabase/migrations/`, the helper composes
the result client-side through chained Supabase JS calls — no Postgres
view or RPC.

Algorithm:

```js
export async function findInvariantSatisfyingPersonas({ supabase }) {
  // 1. Latest snapshot + any item id (corpus-wide discovery values).
  const { data: snaps } = await supabase
    .from("getdx_snapshots")
    .select("snapshot_id, scheduled_for")
    .order("scheduled_for", { ascending: false })
    .limit(1);
  if (!snaps?.length) return { personas: [], diagnostic: "no getdx_snapshots rows" };
  const snapshot_id = snaps[0].snapshot_id;

  const { data: scores } = await supabase
    .from("getdx_snapshot_team_scores")
    .select("item_id")
    .eq("snapshot_id", snapshot_id)
    .limit(1);
  if (!scores?.length) return { personas: [], diagnostic: `no getdx_snapshot_team_scores for snapshot ${snapshot_id}` };
  const item_id = scores[0].item_id;

  // 2. Humans only.
  const { data: humans } = await supabase
    .from("organization_people")
    .select("email,name,discipline,level,track,manager_email")
    .eq("kind", "human");
  if (!humans?.length) return { personas: [], diagnostic: "no kind=human rows" };

  // 3. Build report-count map (persona is manager of N humans).
  const directsByManager = new Map();
  for (const h of humans) {
    if (!h.manager_email) continue;
    directsByManager.set(h.manager_email,
      (directsByManager.get(h.manager_email) ?? 0) + 1);
  }

  // 4. Evidence rows joined through github_artifacts → email.
  //    evidence.artifact_id → github_artifacts.artifact_id → github_artifacts.email.
  const { data: artifacts } = await supabase
    .from("github_artifacts")
    .select("artifact_id, email");
  const artifactToEmail = new Map(
    (artifacts ?? []).map((a) => [a.artifact_id, a.email]));
  const { data: ev } = await supabase
    .from("evidence")
    .select("artifact_id");
  const evidenceCountByEmail = new Map();
  for (const e of ev ?? []) {
    const email = artifactToEmail.get(e.artifact_id);
    if (!email) continue;
    evidenceCountByEmail.set(email,
      (evidenceCountByEmail.get(email) ?? 0) + 1);
  }

  // 5. Practice-pattern proxy: persona is the manager of ≥1 human whose
  //    artifacts produced ≥1 evidence row. Cheapest test: count humans
  //    whose manager_email == persona.email and who carry ≥1 evidence row.
  const practiceCountByManager = new Map();
  for (const h of humans) {
    if (!h.manager_email) continue;
    if ((evidenceCountByEmail.get(h.email) ?? 0) >= 1) {
      practiceCountByManager.set(h.manager_email,
        (practiceCountByManager.get(h.manager_email) ?? 0) + 1);
    }
  }

  // 6. Filter humans against the four spec § Persona corpus invariants:
  //    (a) is manager of ≥1 other row; (b) authored ≥1 evidence row;
  //    (c) manages ≥1 direct with practice-attributable evidence;
  //    (d) discovery values exist (snapshot_id + item_id — already gated above).
  const personas = humans
    .filter((h) =>
      (directsByManager.get(h.email) ?? 0) >= 1 &&
      (evidenceCountByEmail.get(h.email) ?? 0) >= 1 &&
      (practiceCountByManager.get(h.email) ?? 0) >= 1)
    .map((h) => ({
      email: h.email,
      name: h.name,
      discipline: h.discipline,
      level: h.level,
      track: h.track,
      manager_email: h.manager_email,
      manages_count: directsByManager.get(h.email) ?? 0,
      evidence_count: evidenceCountByEmail.get(h.email) ?? 0,
      practice_directs_count: practiceCountByManager.get(h.email) ?? 0,
      snapshot_id,
      item_id,
    }));

  if (!personas.length) {
    // Diagnose which invariant filtered out the most humans.
    const counts = {
      manages: humans.filter((h) =>
        (directsByManager.get(h.email) ?? 0) >= 1).length,
      authors_evidence: humans.filter((h) =>
        (evidenceCountByEmail.get(h.email) ?? 0) >= 1).length,
      practice_directs: humans.filter((h) =>
        (practiceCountByManager.get(h.email) ?? 0) >= 1).length,
    };
    const binding = Object.entries(counts)
      .sort(([, a], [, b]) => a - b)[0][0];
    return {
      personas: [],
      diagnostic:
        `no invariant-satisfying persona — binding constraint: ${binding}`,
    };
  }

  return { personas, discovery: { snapshot_id, item_id } };
}
```

Roster row fields use `discipline`/`level`/`track` (the actual schema
columns) instead of the synthetic `team`/`role`. JTBD-role alignment in
the supervisor's Step 3a uses `discipline` and `level` as the alignment
signal (see Part 03 § SKILL.md edits).

### Step 4b — Self-smoke implementation (gated-command discovery)

- **Created**: `products/map/src/commands/substrate-smoke.js`
- **Created**: `products/landmark/src/lib/commands-manifest.js`
- **Modified**: `products/landmark/bin/fit-landmark.js` (move `COMMANDS`
  source-of-truth into the new library module + add a hidden
  `_commands` verb above the top-level `await createProductConfig`)

Spec § Success Criteria row 5 literally requires iterating the
`COMMANDS` map "at `products/landmark/bin/fit-landmark.js`" with
`needsSupabase: true`, expanded via the libcli `commands` array. To
satisfy this and avoid the design-c constraint of "no internal-import
of the bin file" (the bin has top-level await), extract the data into
a small library module that both the bin and the substrate-smoke
import.

**Source-of-truth extraction.** Create
`products/landmark/src/lib/commands-manifest.js`:

```js
// Canonical fit-landmark command manifest. The bin imports this and
// builds its dispatcher COMMANDS map plus its libcli `commands` array
// from the same source; the substrate self-smoke imports it directly.
//
// Each entry mirrors today's `COMMANDS` shape with the addition of an
// optional `smokeOptions` map naming the option flags substrate-stage
// supplies (placeholders expanded at smoke-runtime).
import { runOrgCommand } from "../commands/org.js";
import { runSnapshotCommand } from "../commands/snapshot.js";
import { runMarkerCommand } from "../commands/marker.js";
import { runEvidenceCommand } from "../commands/evidence.js";
import { runReadinessCommand } from "../commands/readiness.js";
import { runTimelineCommand } from "../commands/timeline.js";
import { runCoverageCommand } from "../commands/coverage.js";
import { runPracticeCommand } from "../commands/practice.js";
import { runPracticedCommand } from "../commands/practiced.js";
import { runHealthCommand } from "../commands/health.js";
import { runVoiceCommand } from "../commands/voice.js";
import { runSourcesCommand } from "../commands/sources.js";
import { runLoginCommand } from "../commands/login.js";
import { runLogoutCommand } from "../commands/logout.js";

export const COMMANDS = {
  org: { handler: runOrgCommand, needsSupabase: true },
  snapshot: { handler: runSnapshotCommand, needsSupabase: true },
  marker: { handler: runMarkerCommand, needsSupabase: false },
  evidence: { handler: runEvidenceCommand, needsSupabase: true },
  readiness: { handler: runReadinessCommand, needsSupabase: true },
  timeline: { handler: runTimelineCommand, needsSupabase: true },
  coverage: { handler: runCoverageCommand, needsSupabase: true },
  practice: { handler: runPracticeCommand, needsSupabase: true },
  practiced: { handler: runPracticedCommand, needsSupabase: true },
  health: { handler: runHealthCommand, needsSupabase: true },
  voice: { handler: runVoiceCommand, needsSupabase: true },
  sources: { handler: runSourcesCommand, needsSupabase: true },
  login: { handler: runLoginCommand, needsSupabase: false },
  logout: { handler: runLogoutCommand, needsSupabase: false },
};

// User-visible subcommand expansions for each top-level COMMANDS key
// whose libcli `commands` array entry uses space-separated names. Used
// by the substrate-stage self-smoke to expand `org` → `org show, org
// team`, etc. Each entry names the option flags substrate-stage must
// supply (placeholders: $PERSONA_EMAIL, $SNAPSHOT_ID, $ITEM_ID).
export const SUBCOMMAND_EXPANSIONS = {
  org: [
    { command: "org show", smokeOptions: {} },
    { command: "org team", smokeOptions: { manager: "$PERSONA_EMAIL" } },
  ],
  snapshot: [
    { command: "snapshot list", smokeOptions: {} },
    { command: "snapshot show", smokeOptions: { snapshot: "$SNAPSHOT_ID" } },
    { command: "snapshot trend", smokeOptions: { item: "$ITEM_ID" } },
    { command: "snapshot compare", smokeOptions: { snapshot: "$SNAPSHOT_ID" } },
  ],
};

// For flat (non-`subcommand`-style) command names whose libcli entry is
// a single-word `name`, the smokeOptions live here. Every gated command
// whose handler throws on missing args MUST appear here so the spec
// § Success Criteria row 5 smoke runs to non-error completion. Checked
// command sources:
//   - voice.js: throws if neither --email nor --manager supplied
//   - practiced.js: throws on missing --manager
//   - health.js: no required option
export const FLAT_SMOKE_OPTIONS = {
  evidence: { email: "$PERSONA_EMAIL" },
  practice: { manager: "$PERSONA_EMAIL" },
  practiced: { manager: "$PERSONA_EMAIL" },
  readiness: { email: "$PERSONA_EMAIL" },
  timeline: { email: "$PERSONA_EMAIL" },
  coverage: { email: "$PERSONA_EMAIL" },
  sources: { email: "$PERSONA_EMAIL" },
  voice: { email: "$PERSONA_EMAIL" },
  // health — no required option
};
```

**Bin refactor.** In `products/landmark/bin/fit-landmark.js`:

1. **Move the `_commands` hidden verb above the top-level await.** Place
   the check at the very top of the file, immediately after the
   `import` block and before `const __dirname = …` and the top-level
   `await createProductConfig("landmark")`:

   ```js
   // Hidden manifest export consumed by `fit-map substrate stage`'s
   // self-smoke (spec 0990). Placed before the top-level
   // createProductConfig() await so introspection does not pay the
   // libconfig load cost and is independent of the spawn cwd's .env.
   if (process.argv[2] === "_commands") {
     const { COMMANDS, SUBCOMMAND_EXPANSIONS, FLAT_SMOKE_OPTIONS } =
       await import("../src/lib/commands-manifest.js");
     process.stdout.write(JSON.stringify({
       commands: COMMANDS,
       subcommandExpansions: SUBCOMMAND_EXPANSIONS,
       flatSmokeOptions: FLAT_SMOKE_OPTIONS,
     }) + "\n");
     process.exit(0);
   }
   ```

   The serialised `COMMANDS` map loses its `handler` function references
   (functions don't survive `JSON.stringify`); the smoke only needs
   `needsSupabase` per entry, which serialises fine.

2. **Replace the inline `COMMANDS` constant** at the existing line
   (anchor: `rg "^const COMMANDS = {" products/landmark/bin/
   fit-landmark.js`) with an import from the manifest:

   ```js
   import { COMMANDS } from "../src/lib/commands-manifest.js";
   ```

   The rest of `main()` (the `COMMANDS[command]` lookup and the
   `entry.handler({…})` call) is unchanged because the imported map has
   the same shape including handlers.

3. **Remove the 14 handler imports from `fit-landmark.js`** — anchor
   them via `rg "import \{ run[A-Z][a-zA-Z]+Command \} from" products/
   landmark/bin/fit-landmark.js`. They move to `commands-manifest.js`
   and become dead in the bin once `COMMANDS` is imported. Verify with
   `bun test products/landmark/test/dispatcher.test.js` after the
   refactor — the dispatcher behaviour is preserved end-to-end.

**Smoke implementation** (`substrate-smoke.js`):

```js
import { spawnSync } from "node:child_process";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";

export async function runSelfSmoke({ supabase, config }) {
  const { findInvariantSatisfyingPersonas } = await import(
    "./substrate-persona-query.js");
  const { personas, discovery, diagnostic } =
    await findInvariantSatisfyingPersonas({ supabase });
  if (!personas.length) throw new Error(diagnostic);
  const persona = personas[0];

  // Mint a short-lived JWT (1h is the smallest unit parseDuration
  // accepts; libsecret's regex is /^(\d+)([hdy])$/, no minutes).
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

  // Discover gated commands by spawning the hidden _commands verb on
  // fit-landmark. The verb returns COMMANDS + expansions from the
  // canonical commands-manifest.js — same data the bin's dispatcher
  // reads, so no drift is possible.
  const manifestRes = spawnSync("bunx", ["fit-landmark", "_commands"], {
    encoding: "utf8",
    // Pin spawn cwd to a fresh tmpdir so the stage step's cwd .env
    // cannot leak into the spawn's libconfig. The _commands branch
    // exits before createProductConfig runs anyway, but the smoke's
    // gated-command spawns below need this guarantee too.
    cwd: await freshTmpdir(),
  });
  if (manifestRes.status !== 0)
    throw new Error(`_commands: ${manifestRes.stderr}`);
  const { commands, subcommandExpansions, flatSmokeOptions } =
    JSON.parse(manifestRes.stdout);

  // Build the user-visible smoke list from the COMMANDS map filtered
  // to needsSupabase: true, expanded via subcommandExpansions for
  // space-separated names. This is the spec § Success Criteria row 5
  // verification surface.
  const smokeList = [];
  for (const [name, entry] of Object.entries(commands)) {
    if (!entry.needsSupabase) continue;
    if (subcommandExpansions[name]) {
      smokeList.push(...subcommandExpansions[name]);
    } else {
      smokeList.push({
        command: name,
        smokeOptions: flatSmokeOptions[name] ?? {},
      });
    }
  }

  // Run each smoke command. Spawn cwd is a fresh tmpdir so the
  // spawned fit-landmark's libconfig reads no stale .env.
  const spawnCwd = await freshTmpdir();
  for (const { command, smokeOptions } of smokeList) {
    const argv = command.split(" ");
    for (const [k, v] of Object.entries(smokeOptions)) {
      argv.push(`--${k}`, expand(v, persona, discovery));
    }
    argv.push("--format", "json");
    // Smoke spawn inherits SUPABASE_URL + SUPABASE_ANON_KEY from
    // process.env (set in the url-discovery phase) and is given the
    // freshly-minted JWT. fit-landmark's createLandmarkClient needs
    // both supabaseUrl() and supabaseAnonKey() to construct the anon
    // client that resolveIdentity then authenticates.
    const res = spawnSync("bunx", ["fit-landmark", ...argv], {
      encoding: "utf8",
      env: { ...process.env, PRODUCT_LANDMARK_TOKEN: jwt },
      cwd: spawnCwd,
    });
    if (res.status !== 0)
      throw new Error(`${argv.join(" ")} exited ${res.status}: ${res.stderr}`);

    // Three row-class smokes (org team, evidence, practice) must
    // return non-empty payloads. Per the formatters at
    // products/landmark/src/formatters/{org,evidence,practice}.js the
    // JSON shape is { ...view, meta } — top-level keys are 'team',
    // 'evidence', 'patterns' respectively.
    if (command === "org team") assertNonEmpty(res.stdout, "team");
    if (command === "evidence") assertNonEmpty(res.stdout, "evidence");
    if (command === "practice") assertNonEmpty(res.stdout, "patterns");
  }
}

function expand(template, persona, discovery) {
  return template
    .replace("$PERSONA_EMAIL", persona.email)
    .replace("$SNAPSHOT_ID", discovery.snapshot_id)
    .replace("$ITEM_ID", discovery.item_id);
}

async function freshTmpdir() {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  return await fs.mkdtemp(path.join(os.tmpdir(), "substrate-smoke-"));
}

function assertJwtShape(jwt, expectedEmail) {
  const [, payloadB64] = jwt.split(".");
  const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  if (claims.aud !== "authenticated")
    throw new Error(`JWT aud != authenticated: ${claims.aud}`);
  if (claims.role !== "authenticated")
    throw new Error(`JWT role != authenticated: ${claims.role}`);
  if (claims.email !== expectedEmail)
    throw new Error(`JWT email mismatch: ${claims.email}`);
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= Date.now())
    throw new Error(`JWT exp claim missing or in the past: ${claims.exp}`);
}

async function assertPersonaIsHuman(supabase, email) {
  const { data, error } = await supabase
    .from("organization_people")
    .select("kind").eq("email", email).maybeSingle();
  if (error) throw new Error(`organization_people: ${error.message}`);
  if (data?.kind !== "human")
    throw new Error(`persona ${email} kind=${data?.kind}, not human`);
}

function assertDiscoveryResolves(persona, discovery) {
  if (!persona.email || !persona.manager_email) {
    throw new Error(`persona missing email/manager_email: ${
      JSON.stringify(persona)}`);
  }
  if (!discovery.snapshot_id || !discovery.item_id) {
    throw new Error(`discovery vector incomplete: ${
      JSON.stringify(discovery)}`);
  }
}

function assertNonEmpty(stdout, key) {
  const parsed = JSON.parse(stdout);
  const v = parsed[key];
  if (Array.isArray(v) ? v.length === 0 :
      (v === undefined || v === null ||
       (typeof v === "object" && Object.keys(v).length === 0))) {
    throw new Error(`row-class non-empty assertion failed for ${key}`);
  }
}
```

## Step 5 — Create `substrate-roster.js`

- **Created**: `products/map/src/commands/substrate-roster.js`

Calls `findInvariantSatisfyingPersonas({ supabase })`. Emits a JSON
object (when `--format json`) or a one-row-per-line text table:

```json
{
  "personas": [
    {
      "email": "athena@bionova.example",
      "name": "Athena Vega",
      "discipline": "platform-engineering",
      "level": "Senior",
      "track": "leadership",
      "manager_email": "zeus@bionova.example",
      "manages_count": 7,
      "evidence_count": 23,
      "practice_directs_count": 5,
      "snapshot_id": "2026-Q1",
      "item_id": "task_completion"
    }
  ],
  "selection_metadata": {
    "signals": ["memory_diversification", "jtbd_role_alignment"]
  }
}
```

Exit codes:

- `0` — `personas.length >= 1`
- non-zero with stderr carrying the helper's `diagnostic` string when empty

## Step 6 — Create `substrate-issue.js`

- **Created**: `products/map/src/commands/substrate-issue.js`
- **Created**: `products/map/src/lib/auth-helpers.js` (shared
  `findAuthUser` extraction — required, not optional)
- **Modified**: `products/map/src/commands/auth-issue.js` (import
  `findAuthUser` from the shared helper instead of carrying the local
  copy)

### Auth-helpers extraction (mandatory)

Extract `findAuthUser` from `auth-issue.js` to `src/lib/auth-helpers.js`
verbatim. The `auth-issue.js` file imports it back. This is mandatory —
both `auth-issue.js` and `substrate-issue.js` need the function and the
plan must commit to one shape.

### `substrate-issue.js`

Atomically writes two files under `--cwd <path>`. Optionally also writes
the bare JWT to a third path supplied via `--stash <path>` — used by
the kata-interview workflow (Part 03) to surface the JWT into the
workflow's private `$RUNNER_TEMP` so a post-run log scan has a tamper-
resistant source for the JWT value to grep for. The stash path is
mode 0600 like the other writes.

To survive partial crashes, write both `.env`/`.substrate.json` temp
files first, then rename in fixed order (`.env` first, `.substrate.json`
second). The stash write (if `--stash` supplied) happens last, after
both renames succeed; on any rename failure, attempt cleanup of leftover
temp files before rethrowing:

```js
import path from "node:path";
import fs from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { mintSupabaseJwt, parseDuration } from "@forwardimpact/libsecret";
import { findAuthUser } from "../lib/auth-helpers.js";
import { formatSuccess } from "@forwardimpact/libcli";

export async function runSubstrateIssueCommand({ supabase, config, options }) {
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
  if (!row) throw new Error(
    `substrate issue: no organization_people row for ${email}`);
  if (row.kind !== "human") throw new Error(
    `substrate issue: ${email} is kind=${row.kind}, not human (substrate is for engineer personas only; the operator surface for service-account JWTs is \`fit-map auth issue\`)`);

  const authUser = await findAuthUser(supabase, email);
  if (!authUser) throw new Error(
    `substrate issue: no auth.users row for ${email}`);

  const secret = config.supabaseJwtSecret();
  const jwt = mintSupabaseJwt({ email, secret, ttlSeconds });

  // Discovery: latest snapshot + any item id (matches
  // findInvariantSatisfyingPersonas's source of truth).
  const { snapshot_id, item_id } = await resolveDiscoveryVector(supabase);

  const envPath = path.join(cwd, ".env");
  const subPath = path.join(cwd, ".substrate.json");
  const tag = `${process.pid}-${randomBytes(4).toString("hex")}`;
  const envTmp = `${envPath}.tmp-${tag}`;
  const subTmp = `${subPath}.tmp-${tag}`;
  try {
    await fs.writeFile(envTmp, `PRODUCT_LANDMARK_TOKEN=${jwt}\n`,
      { mode: 0o600 });
    await fs.chmod(envTmp, 0o600);
    // Spec § Persona-corpus invariant (a): the persona IS the manager
    // of ≥1 other row (verified by findInvariantSatisfyingPersonas).
    // `org team --manager <X>` and `practice --manager <X>` therefore
    // take the PERSONA's own email — not the persona's own manager.
    // The .substrate.json `manager_email` is the value any agent
    // command consuming "the discovery vector's manager email" reads.
    await fs.writeFile(subTmp, JSON.stringify({
      persona_email: email,
      manager_email: email,  // persona is itself the manager
      snapshot_id, item_id,
      generated_at: new Date().toISOString(),
    }, null, 2) + "\n", { mode: 0o600 });
    await fs.chmod(subTmp, 0o600);

    await fs.rename(envTmp, envPath);
    await fs.rename(subTmp, subPath);
  } finally {
    // Best-effort cleanup if either rename failed mid-way.
    for (const orphan of [envTmp, subTmp]) {
      try { await fs.unlink(orphan); } catch { /* expected after rename */ }
    }
  }

  // Optional stash: write the bare JWT to a workflow-protected path so
  // a post-run log scan can read the value without touching the agent's
  // cwd (which the agent has Write/Edit tools over). Workflow contract
  // only — never used by external operators or the dev path.
  if (stash) {
    await fs.writeFile(stash, jwt + "\n", { mode: 0o600 });
    await fs.chmod(stash, 0o600);
  }

  process.stdout.write(formatSuccess(`Issued substrate for ${email}`) + "\n");
  return 0;
}

async function resolveDiscoveryVector(supabase) {
  // Mirror findInvariantSatisfyingPersonas's snapshot/item lookup.
  const { data: snaps } = await supabase
    .from("getdx_snapshots")
    .select("snapshot_id")
    .order("scheduled_for", { ascending: false })
    .limit(1);
  if (!snaps?.length) throw new Error("no getdx_snapshots rows");
  const snapshot_id = snaps[0].snapshot_id;
  const { data: scores } = await supabase
    .from("getdx_snapshot_team_scores")
    .select("item_id").eq("snapshot_id", snapshot_id).limit(1);
  if (!scores?.length) throw new Error(
    `no getdx_snapshot_team_scores for snapshot ${snapshot_id}`);
  return { snapshot_id, item_id: scores[0].item_id };
}
```

The `kind !== "human"` rejection is intentional and differs from
`fit-map auth issue`'s permissive behaviour: the substrate path is for
engineer personas only, and the operator's service-account-token path
remains the existing `fit-map auth issue` verb. The error message names
the alternative.

The atomic-write recovery contract: if `fs.rename(envTmp, envPath)`
succeeds and `fs.rename(subTmp, subPath)` fails, the `.env` file is
on disk but `.substrate.json` is missing. The caller (kata-interview
supervisor in Part 03) detects this mismatch when it reads
`.substrate.json` and re-issues. This is acceptable for the
agent-CWD-is-fresh-per-run case (the workflow's `mktemp -d`); the
implementation does NOT attempt to roll back a successful rename.

## Step 7 — Wire the new test directories into the root test script

- **Modified**: `package.json` (the `"test"` script)

The root `"test"` script today scans `./tests ./libraries ./products
./services` only. Substrate-stage tests live under `products/map/test/`,
which is already in scope, but the workflow-shape and SKILL-shape tests
added in Part 03 land under `.github/workflows/test/` and
`.claude/skills/kata-interview/test/`. Extend the find scope to those
**two specific paths** — not the entire `.claude/skills/` tree (a wider
scope would silently pick up tests from any third-party skill landed in
the repo):

```jsonc
// package.json
"test": "find ./tests ./libraries ./products ./services ./.github/workflows/test ./.claude/skills/kata-interview/test -name '*.test.js' -not -path '*/node_modules/*' | xargs bun test"
```

Verify: `bun run test` discovers the new test files added in Part 03
once that part lands. For Part 02, this change is a no-op (no tests at
those paths exist yet) and the find scope simply expands.

## Step 8 — Tests

Tests created in this part. Each file is < 250 lines and uses fake
supabase + spawn fixtures.

| Test | Created file | Asserts |
|---|---|---|
| Stage phases fire in order | `products/map/test/activity/substrate-stage.test.js` | Phase-tagged errors thrown by stubbed phases carry the phase name; each phase's stub is invoked once in stack → url-discovery → migrate → seed → provision → smoke order; `SUBSTRATE_FORCE_EMPTY_CORPUS=true` short-circuits to the smoke-phase throw |
| Persona invariant predicate | `products/map/test/activity/substrate-persona-query.test.js` | Four invariants combine; a row missing any one is filtered out; empty result returns the binding-constraint diagnostic naming which invariant filtered most |
| Self-smoke JWT shape + persona-kind + discovery | `products/map/test/activity/substrate-smoke.test.js` | `assertJwtShape` rejects on missing/wrong aud/role/email/exp; `assertPersonaIsHuman` rejects on `kind=service_account`; gated-command iteration spawns each `GATED_COMMANDS` entry once; row-class non-empty assertions fire for `org team`, `evidence`, `practice` |
| Commands-manifest source-of-truth | `products/landmark/test/lib/commands-manifest.test.js` | Imports `COMMANDS`, `SUBCOMMAND_EXPANSIONS`, `FLAT_SMOKE_OPTIONS` from `commands-manifest.js`; asserts every `needsSupabase: true` key in `COMMANDS` is covered by exactly one of `SUBCOMMAND_EXPANSIONS[key]` or `FLAT_SMOKE_OPTIONS[key]` (or has no required smoke options); **additionally** parses `products/landmark/bin/fit-landmark.js`'s libcli `commands` array (read as text + regex-extract `name:` values; or expose `definition.commands` from a tiny exported function) and asserts every entry with `needsSupabase: true` for its top-level command appears either in `SUBCOMMAND_EXPANSIONS[topLevel]` (for space-separated names like `"snapshot show"`) or as the `topLevel` itself in `FLAT_SMOKE_OPTIONS` (for flat names) — guards both directions of drift between the dispatcher table, the libcli surface, and the smoke list |
| `_commands` verb emits manifest | `products/landmark/test/lib/commands-verb.test.js` | Spawn `node bin/fit-landmark.js _commands` from a tmpdir; assert stdout parses as `{ commands, subcommandExpansions, flatSmokeOptions }`; assert the spawn exits 0 even when no `config/` or `.env` is reachable (verifies the hidden verb sits above the top-level `createProductConfig` await) |
| Roster emits JSON shape | `products/map/test/activity/substrate-roster.test.js` | `--format json` returns `{ personas, selection_metadata }`; exit 0 on non-empty, non-zero on empty (with diagnostic on stderr) |
| Issue writes both files atomically | `products/map/test/activity/substrate-issue.test.js` | Both files written; mode 0600 on each; content parses as JSON / `KEY=VALUE`; mocked `fs.rename` failure on the second file leaves the first file on disk and cleans up the second's tmp file; mocked failure on the first file leaves no files at the target paths and cleans up both tmp files |
| Issue rejects non-human kind | (same file) | A persona row with `kind=service_account` throws with the named error and names `fit-map auth issue` as the alternative |
| Issue with `--stash` writes JWT to stash path | (same file) | `--stash <tmp>` causes a third file at `<tmp>` containing just the JWT (mode 0600); omitting `--stash` writes only the two `--cwd` files |

Verify: `bun test products/map/test/activity/substrate-*.test.js
products/landmark/test/lib/commands-manifest.test.js
products/landmark/test/lib/commands-verb.test.js` exits 0 with ~20
tests passing.

## Step 9 — Run full check suite

```sh
bun run check  # lint + jsdoc + format + harness + context
bun run test   # extended find scope from Step 7
bun test products/map/test/activity/
bun test products/landmark/test/  # Part 01 surface still green
```

Verify: all green. PR description names the three subcommands, the
shared `findAuthUser` helper, the new `_commands` introspection verb
plus its canonical `products/landmark/src/lib/commands-manifest.js`
source-of-truth file, and the rows from spec § In-scope the new
surface satisfies (Workspace state, Persona corpus, Discovery vector,
Gated-command coverage, Failure surfacing).
