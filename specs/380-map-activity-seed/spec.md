# 380 — Map Activity Seed: Synthetic-to-Database in One Command

Make it trivial for an internal contributor or agent to go from freshly generated
synthetic data to a fully populated, verified activity database — without
multiple sequential CLI invocations.

Builds on [spec 350](../350-map-activity-end-to-end/spec.md), which delivered
the activity CLI surface and end-to-end transforms for external users. This spec
closes the gap that remains for internal contributors and agents working with
synthetic data.

## Why

A full manual test of the Map activity layer — starting from `just synthetic`
and ending at `fit-map activity verify` — required multiple manual interventions
that should have been zero.

### No single command bridges synthetic output to the activity database

After `just synthetic` writes raw documents and a roster, the contributor must
manually:

1. Export `MAP_SUPABASE_URL` and `MAP_SUPABASE_SERVICE_ROLE_KEY`
2. Run `bunx fit-map people push ./data/activity/roster.yaml`
3. Upload synthetic raw files (github events, getdx responses) to the Supabase
   `raw` storage bucket — there is no CLI command for this
4. Run `bunx fit-map activity transform`
5. Run `bunx fit-map activity verify`

The primary consumers of this workflow are agents and contributors running
`just quickstart` or testing Map changes. Every manual step is a place where an
agent gets stuck, asks a question, or silently produces bad data.

### The synthetic output and the Map consumer evolved independently

A manual integration test uncovered four disconnects between the synthetic data
pipeline and the Map activity pipeline that had never been caught because no
integration test exercises the seam:

1. **Roster wrapper key**: the renderer wrote `roster:` but both YAML parsers
   (CLI validation and the Supabase transform) only accepted `people:` or a flat
   array — loading zero people silently.
2. **Field names**: the renderer wrote `github:` but the importer expected
   `github_username:`. The renderer omitted `manager_email` and `track`.
3. **Level IDs**: the DSL `people.distribution` used `L1`–`L5` but the
   `framework.levels` block in the same file defined `J040`–`J100`. The entity
   generator passed the distribution keys through as-is, so every person had a
   level that didn't exist in the framework.
4. **Duplicate parsers**: `parseYamlPeople()` and `parseCsv()` each existed in
   two files (`activity/validate/people.js` and
   `supabase/functions/_shared/activity/transform/people.js`) with identical code
   and identical bugs.

The roster-wrapper, field-name, and level-ID issues have been fixed in the
current working tree (pending commit). The duplicated parsers remain — they
should be consolidated.

### `fit-map activity verify` can never pass without real external APIs

Even after pushing people, `verify` requires non-zero rows in either
`getdx_snapshots` or `github_events`. The synthetic data generates plausible
webhook payloads and GetDX API responses in `data/activity/raw/`, but there is
no command to upload them to the Supabase `raw` bucket. A contributor cannot
reach a green `verify` without either real API tokens or manual curl calls.

## What

### 1. `fit-map activity seed` command

A new `fit-map activity seed` CLI command that populates the activity database
from synthetic data output in a single invocation. Given a running Supabase
instance with migrations applied, the command:

- Reads the synthetic roster directly (the parsers now accept the `roster:`
  wrapper key and the correct field names)
- Pushes the people roster via the existing extract/transform pipeline
- Uploads raw documents from `data/activity/raw/` into Supabase Storage
- Runs all transforms (people, getdx, github)
- Runs `activity verify` and reports the result

The command accepts optional `--data` and `--activity` path overrides but
defaults to the monorepo's `data/` directory structure.

For external users, `fit-map activity seed` is not relevant — they use
`fit-map people push` and real webhook/GetDX data. The seed command is an
internal contributor tool and may be documented only in internal docs
(CONTRIBUTING.md, operations reference).

### 2. `just` targets for the full seed workflow

A `just seed` target (or similar) that chains the full workflow:

```
supabase-up → supabase-migrate → synthetic → seed
```

This gives contributors a single command to go from zero to a fully populated
local activity database with synthetic data. The existing `just quickstart`
should include this path when Supabase is available (Docker running), or skip it
gracefully when Docker is not.

### 3. Consolidate the YAML and CSV people parsers

Extract `parseYamlPeople()` and `parseCsv()` into a single shared module under
`products/map/activity/` (not under `supabase/functions/_shared/`, to avoid the
CLI importing from the edge-function tree). Both the CLI validator
(`activity/validate/people.js`) and the Supabase transform
(`supabase/functions/_shared/activity/transform/people.js`) import from this
shared module. The shared module must be Deno-importable (no bare `fs` imports,
no Node-only specifiers).

### 4. DSL distribution key validation

The DSL parser should validate that `people.distribution` keys exist in
`framework.levels` when both blocks are present. The silent mismatch between
`L1`–`L5` distribution keys and `J040`–`J100` framework level IDs produced
people whose levels failed framework validation. The parser should fail with a
clear error like:

```
distribution key "L1" does not match any framework level (have: J040, J060, J070, J080, J090, J100)
```

This is a fast, zero-cost check at parse time that prevents an entire class of
downstream failures.

### 5. Integration test: synthetic → validate → push

A test that:

1. Generates synthetic data from a minimal DSL fixture
2. Runs `fit-map validate` on the generated framework
3. Runs `fit-map people validate` on the generated roster
4. Pushes the roster to a local Supabase instance and verifies the row count

Steps 1–3 are required. Step 4 requires Supabase and should be skippable when
Docker is unavailable (via an environment check), but must run in CI where
Docker is available.

This test would have caught every issue discovered in the manual test session.
The unit tests all pass individually, but the integration boundary between the
universe pipeline and the Map consumer was never exercised.

## Scope

### In scope

- `products/map/bin/lib/commands/activity.js` — add `seed` subcommand
- `products/map/activity/parse-people.js` — new shared parser module
  (Deno-compatible)
- `products/map/activity/validate/people.js` — import shared parser
- `products/map/supabase/functions/_shared/activity/transform/people.js` —
  import shared parser
- `libraries/libsyntheticgen/dsl/parser.js` — distribution key validation
- `justfile` — add `seed` target, update `quickstart`
- `website/docs/internals/operations/index.md` — document `seed` workflow
- Integration test for synthetic → Map pipeline
- Tests for the seed command

### Out of scope

- External user workflows — `seed` is internal-only
- Changes to the activity database schema
- Changes to the activity transform logic (beyond accepting the `roster:` key,
  already fixed)
- `fit-map people push` or `fit-map activity transform` behaviour for external
  users
- The getting-started leadership guide (external users don't seed)
- Environment variable resolution — fixed in `b1e496e`
- Supabase service role key generation — fixed in `b1e496e`
- Synthetic raw storage paths — fixed in `5d26430`
- Hardcoded level IDs in `activity-roster.js` — the `LEVEL_ORDER` and hire-level
  arrays are not driven by the DSL; making them dynamic is a separate change

### Prerequisites (must be committed before implementation begins)

- Roster field alignment (level IDs, field names, wrapper key) — fixed in
  current working tree, pending commit
- Prose cache regeneration — completed, 100% hit rate restored

## Success criteria

1. **Single command**: After `just supabase-up && just supabase-migrate &&
   just synthetic`, running `bunx fit-map activity seed` populates all activity
   tables and exits 0. No manual file uploads or intermediate steps required.

2. **Verify passes**: `bunx fit-map activity verify` exits 0 after `seed` with
   non-zero counts in `organization_people`, `github_events`, and
   `getdx_snapshots`.

3. **Existing tests pass**: `bun test` in `products/map` continues to pass. New
   tests cover the seed command and the integration boundary.

4. **Idempotent**: Running `fit-map activity seed` twice produces the same
   database state. The second run reports the same counts without errors.

5. **DSL validation**: A story file with distribution keys that don't match
   framework level IDs fails at parse time with a clear error message.

6. **Single parser**: `parseYamlPeople` and `parseCsv` each exist in exactly one
   file, imported by both the CLI validator and the Supabase transform.

7. **Just targets**: `just seed` (with Supabase running and synthetic data
   generated) exits 0 and produces the same result as manually running the seed
   command. `just quickstart` with Docker running includes the seed step; without
   Docker it skips gracefully with a message.

## Open questions

- **Seed command in `fit-map --help`**: should the seed command be hidden from
  help output for external users, or shown with an `[internal]` label? External
  users install via npm and will see it.

- **Docker detection strategy**: should `just quickstart` use `docker info` with
  a short timeout, check for the `docker` binary, or test a specific container?
  The approach must be fast and silent when Docker is absent.

- **Shared parser location**: `products/map/activity/parse-people.js` is
  proposed but the Supabase edge function must import it too. Confirm the import
  path works under the Deno edge runtime's module resolution.

## Risks

- **Seed command creates coupling between Map and the synthetic data schema.** If
  the synthetic output format changes (field names, file layout), the seed
  command breaks. Mitigated by the parser consolidation (item 3) and the
  integration test (item 5) — format drift is caught immediately.

- **`just quickstart` Docker detection.** Detecting whether Docker is running
  must be fast and not produce noisy errors when it isn't.

- **DSL backwards compatibility.** Existing `.dsl` files in downstream
  installations may use arbitrary distribution keys. The validation should only
  enforce the constraint when a `framework.levels` block is present in the same
  file — if there's no framework block, any distribution keys are accepted.
