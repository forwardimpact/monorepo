---
name: fit-map
description: >
  Define what good engineering means so roles have clear, defensible
  expectations, and provision activity-database substrates. Use when
  defining or updating skills, capabilities, behaviours, disciplines,
  tracks, levels, or questions; when pushing rosters, syncing GetDX
  snapshots, or ingesting GitHub artifacts; or when staging, listing,
  picking, and issuing personas from a seeded substrate.
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
  activity-layer setup into one verb, then exposes persona-pick and
  JWT-issue verbs against the seeded database.

Standard and activity entities are published in structured formats so
agents can interpret them reliably.

## When to Use

- Defining or tailoring an engineering standard, or editing JSON Schema /
  RDF / SHACL definitions.
- Validating, indexing, or exporting standard data.
- Managing the activity database — starting Supabase, pushing rosters,
  syncing GetDX, reprocessing the raw bucket, verifying ingest.
- Provisioning or interrogating a **substrate** — staging the database,
  listing or picking a persona, issuing a JWT.

## Standard Layer

Edit YAML under `data/pathway/`. Entity files use co-located `human:` and
`agent:` sections; skills live nested inside capability files.

Run `npx fit-map validate` after every change. Validation runs in two
phases:

1. **Schema** — each YAML against its JSON Schema (`schema/json/`).
2. **Referential** — cross-references resolve (skill IDs in disciplines,
   behaviour IDs in tracks, track IDs in `validTracks`, driver
   `contributingSkills`/`contributingBehaviours`, level `minLevel`).

When schema changes touch `schema/json/`, update `schema/rdf/` in the
same commit — the two formats must stay in sync.

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

Four verbs provision and interrogate an invariant-satisfying activity
database. The pipeline collapses the activity-layer flow above — when
running substrate, `init`, `migrate`, `seed`, `people push`, and
`provision` are all internal phases. Do not invoke them separately.

### One-shot stage

```sh
npx fit-map substrate stage --cwd <agent_dir>
```

Phases (failures surface as `[substrate stage: <phase>] <reason>` so CI
identifies the failing step):

| Phase           | What it does                                                     |
| --------------- | ---------------------------------------------------------------- |
| `init`          | Bootstrap `data/pathway/` + `config/config.json` into target     |
| `copy-activity` | Copy synthetic activity data into target                         |
| `stack`         | `supabase start`                                                 |
| `url-discovery` | Parse `supabase status` → set `SUPABASE_URL`/`SUPABASE_ANON_KEY` |
| `migrate`       | `supabase db reset`                                              |
| `seed`          | Load activity data                                               |
| `provision`     | Reconcile `auth.users` against the roster                        |
| `smoke`         | Invoke every gated product command end-to-end                    |

`SUBSTRATE_FORCE_EMPTY_CORPUS=true` forces the smoke phase to fail with
the empty-corpus diagnostic — used by CI to assert the failure path.

### Persona selection

After staging, pick one persona that satisfies every corpus invariant:

```sh
npx fit-map substrate roster --format json   # List every qualifying persona
npx fit-map substrate pick --format json     # Pick one, diversified
```

`substrate pick` reads and appends a caller-scoped picks log under
`wiki/` to diversify against the last `--memory-window` picks (default
5). When zero candidates qualify, the output names the binding
constraint: `parent_email_known`, `manages`, `authors_evidence`, or
`practice_directs`.

A qualifying persona satisfies all five invariants:

1. Their `manager_email` is non-null (no top-of-tree rows).
2. They are the manager of ≥1 other row.
3. They have authored ≥1 `evidence` row.
4. They manage ≥1 direct who has authored ≥1 evidence row.
5. The corpus carries ≥1 `getdx_snapshots` row and ≥1 `item_id`.

### JWT issue

Seal persona identity into the agent's cwd atomically:

```sh
npx fit-map substrate issue --email <e> --cwd <agent_dir> [--ttl 1h] [--stash <p>]
```

Writes two files, mode 0600 each:

- `.env` — the product's JWT env var carrying the issued token (one line)
- `.substrate.json` — discovery vector (persona email, manager email,
  snapshot id, item id, `generated_at`)

`--stash <p>` writes a bare-JWT copy to a second workflow-private
path that the caller controls — useful when a downstream step needs
the JWT but the agent must not see it.

Rejects non-`human` rows on purpose — service-account JWTs use
`fit-map auth issue` instead. The substrate path is for engineer
personas only.

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
- [Provision Engineer Auth Users](https://www.forwardimpact.team/docs/products/provisioning-engineers/index.md)
  — Reconcile auth.users against the roster so identity-derived RLS works
- [Issue Service-Account Tokens](https://www.forwardimpact.team/docs/products/issuing-service-account-tokens/index.md)
  — Mint long-lived Supabase JWTs for unattended agents
