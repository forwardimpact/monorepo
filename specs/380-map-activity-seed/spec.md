# 380 — Map Activity Seed: Synthetic-to-Database in One Command

Make it trivial for an internal contributor or agent to go from freshly generated
synthetic data to a fully populated, verified activity database — without manual
field remapping or multiple sequential CLI invocations.

Builds on [spec 350](../350-map-activity-end-to-end/spec.md), which delivered
the activity CLI surface and end-to-end transforms for external users. This spec
closes the gap that remains for internal contributors and agents working with
synthetic data.

## Why

A full manual test of the Map activity layer — starting from `just synthetic`
and ending at `fit-map activity verify` — required multiple manual interventions
that should have been zero.

### No single command bridges synthetic output to the activity database

After `just synthetic` writes 13,107 raw documents and a roster, the contributor
must manually:

1. Parse `data/activity/roster.yaml` and `data/activity/teams.yaml`
2. Remap field names (`github` → `github_username`)
3. Derive `manager_email` from the teams file
4. Write a consolidated `people.yaml` in the format `fit-map people push`
   expects
5. Push people, then run `fit-map activity transform`
6. Run `fit-map activity verify`

Each step requires knowledge of both the synthetic data schema and the activity
layer schema. An agent doing this for the first time spent more time on data
wrangling than on the testing it was trying to do.

The primary consumers of this workflow are agents and contributors running
`just quickstart` or testing Map changes. Every manual step is a place where an
agent gets stuck, asks a question, or silently produces bad data. The six-step
workaround discovered during testing took longer than the actual validation work
it was supposed to enable.

## What

### 1. `fit-map activity seed` command

A new `fit-map activity seed` CLI command that populates the activity database
from synthetic data output in a single invocation. Given a running Supabase
instance with migrations applied, the command:

- Reads the synthetic roster and teams files
- Remaps field names to match the `organization_people` schema
- Derives `manager_email` from the teams file
- Pushes the consolidated people roster
- Loads raw documents from `data/activity/raw/` into Supabase Storage (or
  accepts already-loaded documents from `fit-universe --load`)
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

## Scope

### In scope

- `products/map/bin/lib/commands/activity.js` — add `seed` subcommand
- `justfile` — add `seed` target, update `quickstart`
- `website/docs/internals/operations/index.md` — document `seed` workflow
- Tests for the seed command's roster-to-people conversion

### Out of scope

- External user workflows — `seed` is internal-only
- Changes to the activity database schema
- Changes to the activity transform logic (beyond what commit `5d26430` already
  fixed)
- Synthetic prose generation or DSL syntax changes
- `fit-map people push` or `fit-map activity transform` behaviour for external
  users
- The getting-started leadership guide (external users don't seed)
- Environment variable resolution — fixed in `b1e496e`
- Supabase service role key generation — fixed in `b1e496e`
- Synthetic raw storage paths — fixed in `5d26430`

## Success Criteria

1. **Single command**: After `just supabase-up && just supabase-migrate &&
   just synthetic`, running `bunx fit-map activity seed` populates all activity
   tables and exits 0. No manual field remapping or intermediate files required.

2. **Verify passes**: `bunx fit-map activity verify` exits 0 after `seed` with
   non-zero counts in `organization_people`, `github_events`, and
   `getdx_snapshots`.

3. **Existing tests pass**: `bun test` in `products/map` continues to pass. New
   tests cover the seed command's roster-to-people conversion.

4. **Idempotent**: Running `fit-map activity seed` twice produces the same
   database state. The second run reports the same counts without errors.

## Risks

- **Seed command creates coupling between Map and the synthetic data schema.** If
  the synthetic output format changes (field names, file layout), the seed
  command breaks. The seed command should validate its assumptions about the
  roster format and fail with a clear message rather than silently producing
  partial data.

- **`just quickstart` Docker detection.** Detecting whether Docker is running
  must be fast and not produce noisy errors when it isn't. The plan should use
  `docker info` with a short timeout rather than attempting to start Supabase
  and catching the failure.

- **Seed command visibility in external installs.** `fit-map activity seed` will
  appear in `fit-map --help` for external users who installed via npm. The plan
  should decide whether to hide it from help output or mark it as internal.
