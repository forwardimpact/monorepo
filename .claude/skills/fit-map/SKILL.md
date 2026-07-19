---
name: fit-map
description: >
  Define what good engineering means so roles have clear, defensible
  expectations, and provision activity-database substrates. Use when
  defining or updating skills, capabilities, behaviours, disciplines,
  tracks, levels, or questions; when pushing rosters, syncing GetDX
  snapshots, or ingesting GitHub artifacts; or when staging a seeded
  substrate.
---

# Map Product

Map is the foundation of all Forward Impact products. It ships three
operator surfaces — each owns a different consumer:

- **Standard layer** — YAML validated against JSON Schema and RDF/SHACL.
  Engineering-leaders edit this directly.
- **Activity layer** — bundled Supabase project carrying
  `organization_people`, GitHub artifacts, GetDX snapshots, marker
  evidence. Leaders ingest into this over time.
- **Substrate** — a single-shot provisioning pipeline that collapses
  activity-layer setup into one verb and implements the Substrate
  Contract as views, so the generic `fit-terrain substrate` identity
  verbs run against the seeded database.

Standard and activity entities are published in structured formats so
agents can interpret them reliably.

## When to Use

- Defining or tailoring an engineering standard, or editing JSON Schema /
  RDF / SHACL definitions.
- Validating, indexing, or exporting standard data.
- Managing the activity database — starting Supabase, pushing rosters,
  syncing GetDX, reprocessing the raw bucket, verifying ingest.
- Provisioning a **substrate** — staging the database in one shot for
  persona work with `fit-terrain substrate`.

## Standard Layer

Edit YAML under `data/pathway/`. Entity files use co-located `human:` and
`agent:` sections; skills live nested inside capability files.

Run `npx fit-map validate` after every change. Validation runs in two
phases:

1. **Schema** — each YAML against its JSON Schema (the standard's
   schemas ship in `@forwardimpact/libskill` under `schema/json/`).
2. **Referential** — cross-references resolve (skill IDs in disciplines,
   behaviour IDs in tracks, track IDs in `validTracks`, driver
   `contributingSkills`/`contributingBehaviours`, level `minLevel`).

When the standard's JSON Schemas change (libskill's `schema/json/`),
update map's `schema/rdf/` in the same commit — the two formats must
stay in sync.

Generate browser indexes with `npx fit-map generate-index`. Render base
entities to HTML microdata with `npx fit-map export`. Common authoring
tasks (add a skill, add interview questions, add an agent section, add a
tool reference) live in [`references/tasks.md`](references/tasks.md).

## Activity Layer

Activity commands wrap the bundled Supabase project; consumers never
`cd` into `node_modules/@forwardimpact/map`. The CLI finds Supabase via
Homebrew, npm, or falls back to `npx supabase`.

```sh
npx fit-map activity start              # Start local Supabase
npx fit-map activity status             # Report stack health
npx fit-map activity migrate            # Reset + re-apply migrations (drops data)
npx fit-map activity seed               # Seed the database from ./data/activity
npx fit-map people push <file>          # Upsert into organization_people
npx fit-map getdx sync                  # Sync GetDX (needs GETDX_API_TOKEN)
npx fit-map activity transform          # Reprocess the raw bucket
npx fit-map activity verify             # Smoke-test the database
```

`people push` and `getdx sync` write the raw payload to the `raw` bucket
first, then upsert on natural keys — safe to re-run. The same code
ships as four edge functions (`github-webhook`, `people-upload`,
`getdx-sync`, `transform`) in the bundled Supabase project for hosted
deployments.

## Substrate

One verb provisions an invariant-satisfying activity database. The
pipeline collapses the activity-layer flow above — when running
substrate, `init`, `migrate`, `seed`, `people push`, and `provision` are
all internal phases. Do not invoke them separately.

Three entry points prepare an activity database — pick one:

- `substrate stage` — one-shot pipeline for CI and interview runs;
  every phase below is internal.
- `activity start` + `activity seed` — dev flow: bring the stack up,
  then seed it from `./data/activity`.
- `activity migrate` — migrations only; resets the schema (drops data)
  without seeding.

### One-shot stage

```sh
npx fit-map substrate stage --cwd <agent_dir>
```

Phases (failures surface as `[substrate stage: <phase>] <reason>` so CI
identifies the failing step):

| Phase             | What it does                                                     |
| ----------------- | ---------------------------------------------------------------- |
| `init`            | Bootstrap `data/pathway/` + `config/config.json` into target     |
| `copy-activity`   | Copy synthetic activity data into target                         |
| `copy-pathway`    | Replace target's `data/pathway/` with the standard from the same data root (starter stays when none exists) |
| `stack`           | `supabase start`                                                 |
| `url-discovery`   | Parse `supabase status` → set `SUPABASE_URL`/`SUPABASE_ANON_KEY` |
| `migrate`         | `supabase db reset`                                              |
| `seed`            | Load activity data                                               |
| `provision`       | Reconcile `auth.users` against the roster (shared `fit-terrain` capability) |
| `roster-standard` | Fail when the seeded roster uses level ids the staged standard does not define |
| `smoke`           | Invoke every gated product command end-to-end                    |

Activity data and the pathway standard ship from the same data root, so
the seeded roster and the installed standard always match. Seeding
itself enforces the same invariant on every path: `activity seed` fails
fast when the roster names a level the installed standard does not
define.

`SUBSTRATE_FORCE_EMPTY_CORPUS=true` forces the smoke phase to fail with
the empty-corpus diagnostic — used by CI to assert the failure path.
Set `FIT_DEBUG=1` to print the full stack trace when a command fails.

### Persona selection

Map's migrations implement the Substrate Contract as views over the
activity schema, so persona selection and credential issue run through
the generic verbs:

```sh
npx fit-terrain substrate pick --format json
npx fit-terrain substrate issue --email <e> --cwd <agent_dir> --token-env <NAME>
```

See the
[Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md)
guide for the relations, invariants, and degradation semantics.
Service-account JWTs use `fit-map auth issue` — the substrate path is for
engineer personas only.

## Verification

After standard-layer changes:

```sh
npx fit-map validate
```

After substrate changes, the `smoke` phase verifies every gated
product command against the seeded database — a non-zero exit names
the failing command.

## Documentation

- [Map Overview](https://www.forwardimpact.team/map/index.md) — Product
  overview, audience model, and key concepts
- [Getting Started: Map for Leaders](https://www.forwardimpact.team/docs/getting-started/leaders/map/index.md)
  — From zero to a validated engineering standard
- [Authoring Agent-Aligned Engineering Standards](https://www.forwardimpact.team/docs/products/authoring-standards/index.md)
  — End-to-end guide to defining your engineering standard in YAML
- [Validate and Update the Standard](https://www.forwardimpact.team/docs/products/authoring-standards/update-standard/index.md)
  — Run validation, interpret errors, and update safely
- [Define a New Role](https://www.forwardimpact.team/docs/products/authoring-standards/define-role/index.md)
  — Add a discipline, track, or capability to the standard
- [YAML Schema Reference](https://www.forwardimpact.team/docs/reference/yaml-schema/index.md)
  — File format reference for every entity type
- [Issue Service-Account Tokens](https://www.forwardimpact.team/docs/products/issuing-service-account-tokens/index.md)
  — Mint long-lived Supabase JWTs for unattended agents
