---
name: fit-map
description: >
  Work with the @forwardimpact/map product. Use when validating framework
  data, browsing entity definitions, adding/modifying skills, capabilities,
  behaviours, disciplines, tracks, levels, questions, or schema definitions,
  or when running the activity layer — pushing people rosters, syncing GetDX
  snapshots, ingesting GitHub webhook artifacts, and verifying the activity
  database.
---

# Map Product

A public data model for consumption by AI agents and engineers. Map is the
foundation of all Forward Impact products — it defines how engineering
competencies, career progression, and agent capabilities are structured in a
machine-readable format. Map ships two layers: a **framework layer** (YAML files
validated against JSON Schema and RDF/SHACL) and an **activity layer** (a
Supabase project with `organization_people`, GitHub artifacts, GetDX snapshots,
and marker evidence).

Making the data model well understood is a first-class goal. It is published in
structured formats (JSON Schema, RDF/SHACL) so that AI agents can reliably
interpret and work with career framework data.

## When to Use

**Framework-layer validation and inspection:**

- Validating framework data integrity after changes
- Checking data summary (skill counts, entity counts)
- Generating browser index files for the web app
- Exporting base entities to HTML microdata
- Understanding what entities exist in the data

**Framework-layer authoring and schema work:**

- Adding or modifying skills in capability files
- Adding new behaviours, disciplines, tracks, or levels
- Adding interview questions
- Working with JSON Schema or RDF/SHACL definitions
- Improving schema documentation for public consumption

**Activity-layer operations:**

- Starting, stopping, and checking the local Supabase stack
- Applying activity-schema migrations
- Validating a people roster against the framework
- Pushing a people roster into `activity.organization_people`
- Syncing GetDX snapshots into the activity database
- Reprocessing the `raw` bucket after a transform fix or backfill
- Verifying the activity database is populated and reachable

---

## How It Works

### Data Loading

Map loads YAML files from structured directories (`disciplines/`, `tracks/`,
`capabilities/`, `behaviours/`, `levels.yaml`, etc.). Skills are extracted from
capability files during loading — they live inside capabilities rather than as
standalone files. The result is a unified data object containing all entities
with their cross-references resolved by ID.

### Validation Pipeline

Validation runs in two phases:

1. **Schema validation** — each YAML file is checked against its corresponding
   JSON Schema (e.g. capability files against `capability.schema.json`). This
   catches structural issues like missing required fields or wrong types.
2. **Referential integrity** — after schema passes, cross-references are
   verified: skill IDs referenced by disciplines must exist in capabilities,
   behaviour IDs in tracks must exist, track IDs in discipline `validTracks`
   must exist, driver `contributingSkills` and `contributingBehaviours` must
   point to valid entities, and level references (`minLevel`) must resolve.

### Index Generation

The index generator creates `_index.yaml` files in each entity directory,
listing all valid file IDs. These indexes enable browser-based discovery without
filesystem access — the web app loads them to know which entities are available.

---

## CLI

### Framework commands

```sh
npx fit-map validate                        # Validate all data (JSON schema + referential)
npx fit-map validate --shacl                # Validate RDF/SHACL syntax
npx fit-map validate --data=PATH            # Validate a specific data directory
npx fit-map generate-index                  # Generate _index.yaml files for browser loading
npx fit-map export                          # Render base entities to HTML microdata
npx fit-map export --output=PATH            # Export to a custom directory
```

Validation output includes a data summary showing entity counts. Use this to
quickly verify data is loading correctly after changes.

### People commands

```sh
npx fit-map people validate <file>          # Validate a people file against the framework (no DB)
npx fit-map people push <file>              # Store raw + upsert into activity.organization_people
```

`people validate` is a local pre-flight check — it never opens a Supabase
connection. `people push` writes the raw file to the `raw` bucket for audit,
then calls the shared `transformPeople` helper to upsert rows into
`activity.organization_people` (manager-less rows first so foreign keys
resolve). Both accept YAML or CSV with the same column names.

### Activity commands

```sh
npx fit-map activity start                  # Start the bundled local Supabase stack
npx fit-map activity stop                   # Stop the local stack
npx fit-map activity status                 # Report local stack health
npx fit-map activity migrate                # Reset + re-apply migrations (drops data)
npx fit-map activity transform              # Reprocess every raw document in the raw bucket
npx fit-map activity transform people       # Reprocess only people
npx fit-map activity transform getdx        # Reprocess only GetDX
npx fit-map activity transform github       # Reprocess only GitHub webhooks
npx fit-map activity verify                 # Smoke-test the activity database
```

The activity commands wrap the bundled Supabase project so consumers don't need
to `cd` into `node_modules/@forwardimpact/map`. `activity transform` reads from
the `raw` bucket and upserts on natural keys — safe to re-run. `activity verify`
reads `organization_people` and at least one derived table and exits non-zero if
either is empty.

### GetDX commands

```sh
GETDX_API_TOKEN=xxx npx fit-map getdx sync  # Extract + transform GetDX snapshots
```

Fetches `teams.list`, `snapshots.list`, and `snapshots.info` for every undeleted
snapshot, stores each response under `raw/getdx/`, and upserts
`activity.getdx_teams`, `activity.getdx_snapshots`, and
`activity.getdx_snapshot_team_scores`. The CLI and the hosted `getdx-sync` edge
function run the same extract-and-transform code — pick whichever fits your
deployment.

### Edge functions (hosted-only)

Four edge functions ship in the bundled Supabase project and deploy with
`supabase functions deploy`:

| Function         | Trigger                                    | Responsibility                                                                        |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `github-webhook` | POST from a configured GitHub webhook      | Store raw payload + upsert `github_events`, `github_artifacts` with email resolution  |
| `people-upload`  | POST with a CSV/YAML body                  | Store raw upload + upsert `organization_people` (equivalent to `fit-map people push`) |
| `getdx-sync`     | Scheduled POST (cron, GitHub Actions, etc) | Fetch + store + transform GetDX (equivalent to `fit-map getdx sync`)                  |
| `transform`      | On-demand POST                             | Reprocess the `raw` bucket end-to-end (equivalent to `fit-map activity transform`)    |

Every edge function returns a JSON response with per-target counts and errors.
Full walk-through in the
[leadership getting-started guide](https://www.forwardimpact.team/docs/getting-started/leadership/#activity-ingest-github-activity).

---

## Data Structure

```
data/pathway/
├── framework.yaml         # Framework metadata, entity definitions
├── levels.yaml            # Career levels (J040, J060, etc.)
├── stages.yaml            # Lifecycle stages (plan, code, review, etc.)
├── drivers.yaml           # Organizational outcomes
├── disciplines/           # Engineering specialties (software_engineering, etc.)
├── tracks/                # Work contexts (platform, forward_deployed, etc.)
├── behaviours/            # Approach to work (outcome_ownership, etc.)
├── capabilities/          # Skills grouped by area (delivery, scale, etc.)
├── repository/            # Repository configuration (vscode-settings, devcontainer, etc.)
└── questions/             # Interview questions
    ├── skills/            # Per-skill question sets
    └── behaviours/        # Per-behaviour question sets
```

Entity files use **co-located content** — `human:` and `agent:` sections in the
same YAML file. All entities have an `id` field used for cross-references.

---

## Schema Definitions

### JSON Schema (`schema/json/`)

Validates YAML structure. One schema per entity type.

### RDF/SHACL (`schema/rdf/`)

Semantic representation for linked data interoperability.

**Schema synchronization:** When adding or modifying properties, update both
`schema/json/` and `schema/rdf/` in the same commit. The two formats must stay
in sync.

---

## Common Tasks

### Add a Skill

1. Add skill to capability file:
   `data/pathway/capabilities/{capability_id}.yaml`
2. Add skill object with `id`, `name`, and `human:` section
3. Include level descriptions for all five proficiency levels
4. Reference skill in disciplines (coreSkills/supportingSkills/broadSkills)
5. Add questions: `data/pathway/questions/skills/{skill_id}.yaml`
6. Optionally add `agent:` section for AI coding agent support
7. Run `npx fit-map validate`

### Add Interview Questions

Location:

- Skills: `data/pathway/questions/skills/{skill_id}.yaml`
- Behaviours: `data/pathway/questions/behaviours/{behaviour_id}.yaml`

Required properties:

| Property     | Description                                    |
| ------------ | ---------------------------------------------- |
| `id`         | Format: `{abbrev}_{level_abbrev}_{number}`     |
| `text`       | Question text (second person, under 150 chars) |
| `lookingFor` | 2-4 bullet points of good answer indicators    |

### Add Agent Skill Section

Add `agent:` section to skill in capability file:

```yaml
agent:
  name: skill-name-kebab-case
  description: Brief description
  useWhen: When agents should apply this skill
  stages:
    plan:
      focus: Planning objectives
      activities: [...]
      ready: [...]
    code:
      focus: Implementation objectives
      activities: [...]
      ready: [...]
```

### Add Tool Reference

Add `toolReferences:` to skill in capability file:

```yaml
toolReferences:
  - name: Langfuse
    url: https://langfuse.com/docs
    description: LLM observability platform
    useWhen: Instrumenting AI applications
```

## Verification

Always run validation after changes:

```sh
npx fit-map validate
```

## Documentation

For deeper context beyond this skill's scope:

- [Authoring Frameworks Guide](https://www.forwardimpact.team/docs/guides/authoring-frameworks/index.md)
  — Task-oriented guide to defining your engineering framework in YAML
- [YAML Schema Reference](https://www.forwardimpact.team/docs/reference/yaml-schema/index.md)
  — File format reference for every entity type with examples and published
  schema links
