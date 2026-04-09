# 350 — Map Activity Layer: End-to-End

Finish the Map activity layer so an external leadership user who runs
`npm install @forwardimpact/map` can stand up a fully populated activity
database and keep it in sync — without writing any Node scripts, without
hand-editing edge functions, and without reaching back into the monorepo.

Builds on [spec 051](../051-map-elt/spec.md), which established the ELT boundary
and the raw-storage bucket layout. This spec completes that pipeline at the
edges: the edge functions, the CLI, the tests, and the docs all catch up to the
helpers 051 put in place.

## Why

Map ships two layers: a **framework layer** (YAML files validated by
`fit-map validate`) and an **activity layer** (a Supabase project that stores
the organization roster, GitHub artifacts, GetDX snapshots, and marker
evidence). The framework layer is complete. The activity layer is not.

Documentation work on `website/docs/getting-started/leadership/index.md`
surfaced seven independent gaps that collectively make the activity layer
unusable as-shipped.

### 1. Three of four edge functions do not complete their job

Three Supabase edge functions ship in the npm package and deploy via
`supabase functions deploy`. None of them leave the activity database in the
state a user would reasonably expect after calling them:

- `products/map/supabase/functions/getdx-sync/index.ts` fetches from the GetDX
  API and stores the raw JSON under `raw/getdx/**`. It stops there. Nothing
  populates `getdx_teams`, `getdx_snapshots`, or `getdx_snapshot_team_scores`. A
  user who calls this function sees "no errors" and an empty database.
- `products/map/supabase/functions/people-upload/index.ts` accepts a POST,
  stores the body under `raw/people/<timestamp>.<ext>`, and returns 200.
  `organization_people` is never written.
- `products/map/supabase/functions/transform/index.ts` is a stub (27 lines
  total, most of them comments). It returns a zero-count result object
  regardless of what is in raw storage.

Only `products/map/supabase/functions/github-webhook/index.ts` completes the
extract-and-transform cycle; it is the sole edge function currently referenced
by the leadership getting-started guide.

### 2. The CLI lies about what `people import` does

`products/map/bin/fit-map.js:271-295` defines `fit-map people import <file>`.
The name implies the roster lands in the database. The implementation only loads
the file, validates it against the framework, and prints a count — it never
opens a Supabase connection. A user following the command name expects their
roster imported. They get a validation report.

### 3. No CLI surface for any activity workflow

Every activity-layer operation the leadership guide walks through — pushing
people, syncing GetDX, reprocessing transforms, verifying the database, or even
starting the local Supabase stack — is currently documented as an inline Node
script or a raw `supabase` CLI invocation. `fit-map`'s command table stops at
`validate`, `generate-index`, `export`, and `people import`.

The guide cannot be made honest until `fit-map` grows the commands. The activity
layer cannot be adopted incrementally until the same commands drive it from
CI/cron.

### 4. GitHub extraction logic is duplicated

A shared entry point and three per-event-type helpers exist in two parallel
implementations:

- `products/map/supabase/functions/github-webhook/index.ts:90-174` (Deno,
  TypeScript) defines `extractArtifacts` with helpers `extractPR`,
  `extractReview`, `extractCommits`.
- `products/map/activity/transform/github.js:107-201` (Node, JavaScript) defines
  `extractArtifacts` with helpers `extractPullRequestArtifacts`,
  `extractReviewArtifacts`, `extractCommitArtifacts`.

The helpers have already drifted: the names differ, the Deno version uses
`Record<string, unknown>` type assertions the Node version does not, and the two
files are edited independently with no test pinning them together. Either path
can silently produce different rows for the same webhook payload and nothing in
the test suite would catch it.

### 5. Two migration directories, one dead

`products/map/activity/migrations/001_activity_schema.sql` (6.4 KB) is an
earlier draft of the activity schema. It is missing every GRANT statement that
the canonical migration has. The canonical version lives at
`products/map/supabase/migrations/20250101000000_activity_schema.sql` (6.9 KB)
and is the only one `supabase db reset` applies. `diff` confirms the dead file
differs only by the missing GRANTs and a handful of whitespace lines.

The dead file is a trap for contributors: it looks authoritative, ships in the
npm package (`files: ["activity/"]`), and has no comment explaining why it is
obsolete.

### 6. Zero tests for the activity layer

`products/map/test/` contains 101 passing tests — all of them exercising the
framework layer (`src/loader.js`, `src/renderer.js`, `src/exporter.js`,
`src/schema-validation.js`, etc.). The activity helpers under
`products/map/activity/` have zero coverage:

- `activity/storage.js` — raw bucket wrapper, 71 lines, 0 tests
- `activity/transform/people.js` — 189 lines, 0 tests
- `activity/transform/getdx.js` — 177 lines, 0 tests
- `activity/transform/github.js` — 219 lines, 0 tests
- `activity/extract/*.js` — 152 lines combined, 0 tests
- `activity/queries/*.js` — 0 tests

The `people import` misnomer bug is exactly the kind of thing a single test
would have caught at review time.

### 7. The skill is out of date

`.claude/skills/fit-map/SKILL.md:70-79` documents only `validate` (three
variants), `generate-index`, and `people import`. `fit-map export` already ships
but is not mentioned in the skill at all. There is no mention of activity
workflows, no mention of Supabase, no mention of `raw` storage, no mention of
the edge functions. An agent loading the skill cannot help a user with any of
the broken parts — it cannot even tell the user the framework layer supports
export.

### Why this matters now

The blast radius of all seven gaps lands on the same user: a leadership
stakeholder installing `@forwardimpact/map` for the first time to stand up
Landmark and Summit. That flow is the primary external value proposition of the
activity layer, and right now it fails in six different places before the user
even reaches the github-webhook walk-through. Individual gaps look small. The
sum is a broken first-run experience for the product Map exists to serve.

## What

Bring the activity layer to end-to-end working for an external user whose only
input is `npm install @forwardimpact/map`, a framework YAML directory, a
`people.yaml` roster, optional GetDX credentials, and (optionally) a GitHub
webhook configured against a hosted Supabase project.

### 1. Every edge function completes its job

All four edge functions in `products/map/supabase/functions/` must, after a
single invocation, leave the activity database in the state a user would expect
from their names:

| Function         | After one call, the following is true                                                                                                                                                                                                                             |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-webhook` | The raw payload is stored under `raw/github/<delivery-id>.json`, a row exists in `activity.github_events`, and one row per artifact (PR, review, commit) exists in `activity.github_artifacts` with `email` resolved from `organization_people`. (Already works.) |
| `people-upload`  | The raw upload is stored under `raw/people/<timestamp>.<ext>` **and** every valid row from the upload has been upserted into `activity.organization_people`, managerless-first, with manager foreign keys resolving.                                              |
| `getdx-sync`     | All three GetDX endpoint responses are stored under `raw/getdx/**` **and** `activity.getdx_teams`, `activity.getdx_snapshots`, and `activity.getdx_snapshot_team_scores` contain the rows derived from them.                                                      |
| `transform`      | Every raw document currently in the `raw` bucket has been reprocessed through the correct transform and the derived tables reflect the raw bucket exactly. Calling it twice in a row is a no-op (idempotent).                                                     |

Every edge function returns a JSON response that tells the caller what it did:
per-target counts (stored documents, inserted/upserted rows), per-target errors,
and an explicit success/failure flag. Empty runs return zero counts without
errors.

The `getdx-sync` function is HTTP-triggered. How often it runs in production is
the user's decision and is not a Map concern — the leadership guide recommends
GitHub Actions `schedule:` or any other cron that can POST to an edge function.
Scheduled invocation via `pg_cron` is explicitly out of scope for this spec.

### 2. The CLI matches what it claims to do

`fit-map`'s command table grows to cover every activity workflow the leadership
guide currently shows as an inline script. The CLI must be usable end-to-end
from a fresh `npm install` without ever opening a Node REPL or writing a helper
script.

The CLI must expose, at minimum, these capabilities:

- **Validate a people file locally** against the framework (no Supabase
  connection).
- **Push a people file** into the activity database (stores raw, transforms,
  reports counts).
- **Sync GetDX** (stores raw, transforms, reports counts).
- **Reprocess the `raw` bucket** — equivalent to calling the `transform` edge
  function.
- **Verify the activity database** — a smoke test that reads from
  `organization_people` and at least one derived table and reports non-zero
  counts.
- **Start, stop, and check the status** of the local Supabase stack for
  contributors who are running the package from `node_modules`.
- **Apply migrations** against the local stack (equivalent to
  `supabase db reset`).

The command surface must be unambiguous about what runs locally versus what
talks to Supabase. The misleading `fit-map people import` naming must be
replaced. Backwards compatibility for the old name may be preserved as a
deprecated alias, but the alias is not required; it is an acceptable choice for
the plan to make.

Subcommand names are not prescribed here — the plan chooses them — but the
naming must make the distinction between "validate locally" and "push to the
database" obvious from the help text alone.

### 3. One source of truth for every transform

For every raw-data source with both a server path and a local path — GitHub
webhooks, GetDX API responses, people uploads — the extract-and-transform logic
lives in exactly one place and both the Deno edge function and the Node CLI
import it.

In practice this means the activity helpers under `products/map/activity/**`
must be importable from both runtimes. Where a helper today depends on a
Node-only construct that Deno cannot resolve (`fs/promises` in the transform
path, importing from `../../src/loader.js`, bare `yaml` specifier without `npm:`
prefix, etc.), that dependency must be eliminated or moved behind an import that
works under both runtimes.

Success criterion: a single grep for `extractArtifacts` returns exactly one
definition. Removing the definition and re-adding it breaks both the edge
function and the CLI in the same way.

### 4. The dead migration file is resolved

`products/map/activity/migrations/001_activity_schema.sql` is either:

- Deleted, if it contributes nothing the canonical migration doesn't already
  cover; or
- Reconciled with the canonical migration, if there is content in it worth
  preserving.

Either way, after this spec lands there is a single authoritative place to look
for activity-schema DDL. The `activity/` directory in the published package no
longer ships anything that looks like an unused migration.

### 5. Activity helpers have functional parity with framework tests

Every file under `products/map/activity/` that the plan modifies or claims as a
single source of truth must have tests that:

- Cover the happy path with representative fake input (recording Supabase
  client, canned raw documents).
- Cover the manager-less-first ordering in `transformPeople` (the exact bug that
  would have caught the import misnomer).
- Cover the GitHub artifact extraction for all three artifact types (PR, review,
  commit).
- Cover a GetDX round-trip (teams-list, snapshots-list, snapshots-info) with a
  stub client.
- Cover `storeRaw` / `readRaw` / `listRaw` against a fake Supabase storage
  client.

Functional parity means a reviewer can point at `products/map/activity/**` and
`products/map/test/activity/**` and see the same level of testing that
`products/map/src/**` and `products/map/test/**` have today.

### 6. The leadership guide and the skill tell the same story

`website/docs/getting-started/leadership/index.md` and
`.claude/skills/fit-map/SKILL.md` both reflect the new reality:

- Every workflow the guide shows is a single `fit-map` command or a single
  `supabase` CLI invocation. Inline Node scripts are gone. `curl`ing edge
  functions is also acceptable where it better fits the deployment story (e.g.
  GitHub Actions scheduled calls to `getdx-sync`).
- The CLI reference table in the skill lists every activity-layer command,
  cross-linked to the leadership guide.
- An agent loading the skill can answer "how do I ingest GetDX snapshots?" or
  "how do I import people?" by quoting the skill directly, without reading any
  source code.

## Scope

### In scope

- `products/map/supabase/functions/people-upload/` — complete the transform
  step.
- `products/map/supabase/functions/getdx-sync/` — complete the transform step.
- `products/map/supabase/functions/transform/` — implement the stub.
- `products/map/supabase/functions/github-webhook/` — switch to the shared
  extract/transform source of truth. No behaviour change.
- `products/map/activity/**` — refactor as needed to be Deno-importable from the
  edge functions; no public API changes to the exported helpers.
- `products/map/bin/fit-map.js` (and any new files under `products/map/bin/`) —
  grow the CLI to cover every activity workflow.
- `products/map/package.json` — add any new dependencies required for the CLI
  activity commands (e.g. `@supabase/supabase-js`) and ensure every new file
  ships in the published package.
- `products/map/test/activity/**` — new tests for the activity layer.
- `products/map/activity/migrations/` — resolve the dead file.
- `website/docs/getting-started/leadership/index.md` — rewrite the activity
  section around the new CLI surface.
- `.claude/skills/fit-map/SKILL.md` — add the activity-workflows section.

### Out of scope

- Changing the activity database schema. Migrations under
  `products/map/supabase/migrations/` are not modified by this spec.
- Changing query functions under `products/map/activity/queries/`.
- Changing the synthetic data pipeline (spec 060).
- Webhook signature verification on `github-webhook` (orthogonal security
  improvement).
- `pg_cron` scheduled invocation of `getdx-sync`. The function is HTTP triggered
  only. Scheduling is the deployer's responsibility.
- Replacing `activity/storage.js` with `libstorage`. `libstorage` is S3-shaped
  and monorepo-only, and is the wrong abstraction here.
- Adding new external data sources beyond GitHub, GetDX, and organization people
  uploads.
- Daemonising `supabase start` under the CLI. `supabase start` is good enough;
  the user owns their terminal.

## Success criteria

A first-time external leadership user, starting from a clean machine with only
Node.js and npm installed, can reach a verified activity database with a short
linear sequence of commands. No Node scripts. No hand-edited edge functions. No
reaching into the monorepo.

Specific pass/fail checks:

1. **Install**: `npm install @forwardimpact/map` succeeds. `npx fit-map --help`
   lists every command named in "What / CLI matches what it claims to do".

2. **Framework path unchanged**: `npx fit-map validate` still works exactly as
   it does today against framework YAML.

3. **Activity stack starts**: The user can start a local Supabase stack for Map
   from the installed npm package by running a single `fit-map` command, without
   first `cd`ing into `node_modules/@forwardimpact/map`. The command that stops
   the stack and the command that reports status have the same
   working-directory-independent property.

4. **People push end-to-end**: After `fit-map`'s push command completes against
   a valid `people.yaml`, a query against `activity.organization_people` returns
   every valid row with `manager_email` foreign keys resolved. An immediate
   second run is a no-op and does not error.

5. **GetDX sync end-to-end, both paths**:
   - Calling the `getdx-sync` edge function with `GETDX_API_TOKEN` configured
     populates all three GetDX tables from scratch. A second call is idempotent
     where the underlying transforms are (upserts).
   - `fit-map`'s GetDX sync command produces the same end state when run locally
     with the same credentials.

6. **Transform reprocess end-to-end, both paths**:
   - Calling the `transform` edge function with data in the `raw` bucket
     repopulates `github_events`, `github_artifacts`, `organization_people`,
     `getdx_*` tables to reflect the raw bucket.
   - `fit-map`'s reprocess command produces the same end state.

7. **Verify command**: `fit-map`'s verify command reports non-zero row counts
   for `organization_people` and at least one derived table after the steps
   above, and exits 0. Running it against an empty database exits non-zero with
   a clear message.

8. **Shared source of truth**: for each of GitHub, GetDX, and people, the
   function that converts a raw document into database rows is defined in
   exactly one file and imported by both the edge function under
   `products/map/supabase/functions/**` and the CLI under `products/map/bin/**`.
   Deleting the definition breaks both runtimes in the same build.

9. **Tests**: `bun run test` in `products/map` passes and includes at least one
   test file per activity helper that this spec brings into scope.

10. **Dead migration gone**: `find products/map/activity/migrations` returns
    nothing. The empty directory is removed too.

11. **Docs coherent**: The leadership guide's "Map → Activity" section contains
    no inline `.mjs` scripts and no `import`s from
    `@forwardimpact/map/activity/**`. Every activity workflow is a shell command
    the reader can copy-paste.

12. **Skill coherent**: `.claude/skills/fit-map/SKILL.md` has an "Activity
    workflows" top-level section and the CLI reference table lists every command
    from criterion 1.

## Risks

- **Deno-Node compatibility of the activity helpers may be deeper than it
  looks.** Several activity transform files currently reach into Node-only
  territory (filesystem access, a transitive dependency on the framework
  `src/loader.js`, bare npm specifiers). The plan must confirm — not assume —
  that each helper this spec claims as a single source of truth can actually
  load under Deno.
- **Users with a broken `getdx-sync` already deployed** must get the fix
  transparently on the next `supabase functions deploy`. The spec requires an
  end-to-end verification path after deploy so the user knows the fix landed,
  not just that the deploy succeeded.
- **Not every external user has the `supabase` CLI installed.** Several new CLI
  commands wrap it. The failure mode when it is missing must be a clear
  install-link error, not a low-level `ENOENT`.

## Out of this spec — intentionally deferred

- **Published synthetic GetDX data** driving the verify step. Useful but
  orthogonal; spec 060's pipeline covers synthetic data generation.
- **pg_cron-driven scheduled sync.** Wait for a user request.
- **Signature verification on `github-webhook`.** Security improvement; separate
  spec.
- **Webhook receiver for GetDX events.** GetDX is still pull-only in the API we
  target.
