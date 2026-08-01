---
name: fit-map
description: >
  Define what good engineering means so roles have clear, defensible
  expectations. Provision activity-database substrates. Use when you
  define or update skills, capabilities, behaviours, disciplines,
  tracks, levels, or questions. Use when you push rosters, sync GetDX
  snapshots, or ingest GitHub artifacts. Use when you stage a seeded
  substrate.
---

# Map Product

Map is the foundation of all Forward Impact products. It ships three
operator surfaces. Each surface owns a different consumer:

- **Standard layer** — YAML validated against JSON Schema and RDF/SHACL.
  Engineering-leaders edit this directly.
- **Activity layer** — bundled Supabase project with
  `organization_people`, GitHub artifacts, GetDX snapshots, and marker
  evidence. Leaders ingest into this over time.
- **Substrate** — a single-shot pipeline that provisions the database.
  It collapses activity-layer setup into one verb. It implements the
  Substrate Contract as views. The generic `fit-terrain substrate`
  identity verbs then run against the seeded database.

Map publishes standard and activity entities in structured formats.
Agents can then interpret them reliably.

## When to Use

- Define or tailor an engineering standard. Edit JSON Schema / RDF /
  SHACL definitions.
- Validate, index, or export standard data.
- Manage the activity database. Start Supabase, push rosters, sync
  GetDX, reprocess the raw bucket, and verify ingest.
- Provision a **substrate**. Stage the database in one shot for persona
  work with `fit-terrain substrate`.

## Standard Layer

Edit YAML under `data/pathway/`. Entity files use co-located `human:` and
`agent:` sections. Skills live nested inside capability files.

Run `npx fit-map validate` after every change. Validation runs in two
phases:

1. **Schema** — each YAML against its JSON Schema (the standard's
   schemas ship in `@forwardimpact/libskill` under `schema/json/`).
2. **Referential** — cross-references resolve (skill IDs in disciplines,
   behaviour IDs in tracks, track IDs in `validTracks`, driver
   `contributingSkills`/`contributingBehaviours`, level `minLevel`).

When the standard's JSON Schemas change (libskill's `schema/json/`),
update map's `schema/rdf/` in the same commit. The two formats must
stay in sync.

Generate browser indexes with `npx fit-map generate-index`. Render base
entities to HTML microdata with `npx fit-map export`. Common tasks for
authors (add a skill, add interview questions, add an agent section, add
a tool reference) live in [`references/tasks.md`](references/tasks.md).

## Activity Layer

Activity commands wrap the bundled Supabase project. Consumers never
`cd` into `node_modules/@forwardimpact/map`. The CLI finds Supabase
through Homebrew or npm. It falls back to `npx supabase`.

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
first, then upsert on natural keys. Both are safe to re-run. The same
code ships as four edge functions (`github-webhook`, `people-upload`,
`getdx-sync`, `transform`) in the bundled Supabase project for hosted
deployments.

## Substrate

One verb provisions an activity database that satisfies the invariants.
The pipeline collapses the activity-layer flow above. When you run
substrate, `init`, `migrate`, `seed`, `people push`, and `provision` are
all internal phases. Do not invoke them separately.

Three entry points prepare an activity database. Pick one:

- `substrate stage` — a one-shot pipeline for CI and interview runs.
  Every phase below is internal.
- `activity start` + `activity seed` — the dev flow. Bring the stack up.
  Then seed it from `./data/activity`.
- `activity migrate` — migrations only. It resets the schema (drops
  data) and does not seed.

### One-shot stage

```sh
npx fit-map substrate stage --cwd <agent_dir>
```

Phases (failures surface as `[substrate stage: <phase>] <reason>` so CI
identifies the step that failed):

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
the seeded roster and the installed standard always match. The seed step
enforces the same invariant on every path. `activity seed` fails fast
when the roster names a level the installed standard does not define.

`SUBSTRATE_FORCE_EMPTY_CORPUS=true` forces the smoke phase to fail with
the empty-corpus diagnostic. CI uses it to assert the failure path.
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
Service-account JWTs use `fit-map auth issue`. The substrate path is for
engineer personas only.

## Verification

After standard-layer changes:

```sh
npx fit-map validate
```

After substrate changes, the `smoke` phase verifies every gated
product command against the seeded database. A non-zero exit names
the command that failed.

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
