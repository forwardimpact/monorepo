---
title: "Getting Started: Leadership"
description: "Define your engineering framework with Map, preview it with Pathway, analyze signals with Landmark, and plan team capability with Summit."
---

This guide walks you through setting up the FIT suite for engineering
leadership. By the end you will have a validated framework, a live preview,
signal analysis, and team capability planning.

## Prerequisites

- Node.js 18+
- npm

## Install

```sh
npm install @forwardimpact/map @forwardimpact/pathway @forwardimpact/landmark @forwardimpact/summit
```

This gives you four CLI tools:

- `fit-map` — validate framework data against published schemas
- `fit-pathway` — browse, preview, and publish your framework
- `fit-landmark` — analyze engineering signals and team patterns
- `fit-summit` — model team capability, risks, and staffing scenarios

---

## Map

Map is the data product at the centre of every other tool. It has two layers
that you set up in order:

1. **Framework layer** — YAML files defining your skills, behaviours, levels,
   disciplines, and tracks. Validated locally with `npx fit-map validate`. This
   is what Pathway, Basecamp, and `libskill` consume.
2. **Activity layer** — A Supabase database that stores your organization
   roster, GitHub activity, evidence, and GetDX snapshots. Powers Landmark and
   Summit, and lets Guide write skill evidence back against framework markers.

The framework layer is required. The activity layer is optional but unlocks
everything Landmark and Summit do.

### Framework: initialize starter data

Bootstrap a complete framework skeleton with editable YAML files:

```sh
npx fit-map init
```

This creates `./data/pathway/` with starter definitions for levels, disciplines,
capabilities, skills, behaviours, stages, drivers, and tracks. The starter data
is a working framework you can customize to match your organization.

### Framework: validate

Run the validator to check your YAML files against the schema:

```sh
npx fit-map validate
```

Fix any errors the validator reports before moving on.

### Framework: customize

The starter data gives you a complete foundation. Edit the YAML files under
`data/pathway/` to match your organization's engineering expectations.

#### Levels

Edit `data/pathway/levels.yaml` to define your level structure. Each level sets
baseline expectations for skill proficiency and behaviour maturity.

```yaml
- id: J040
  professionalTitle: Level I
  managementTitle: Associate
  ordinalRank: 1
  baseSkillProficiencies:
    primary: foundational
    secondary: awareness
    broad: awareness
  baseBehaviourMaturity: emerging

- id: J060
  professionalTitle: Level II
  managementTitle: Senior Associate
  ordinalRank: 2
  baseSkillProficiencies:
    primary: working
    secondary: foundational
    broad: awareness
  baseBehaviourMaturity: developing
```

#### Capabilities and skills

Edit files under `data/pathway/capabilities/` to define capability groups
containing skills. Each skill needs a `human:` section with proficiency
descriptions at all five levels.

```yaml
name: Delivery
description: Ship working software reliably.
skills:
  - id: task_execution
    name: Task Execution
    human:
      description: Breaking down and completing engineering work
      proficiencyDescriptions:
        awareness: >
          Understands the team's delivery workflow and follows guidance
          to complete assigned tasks.
        foundational: >
          Breaks work into steps, estimates effort, and completes tasks
          with minimal guidance.
        working: >
          Independently plans and delivers work, adjusting approach when
          requirements change.
        practitioner: >
          Leads delivery across multiple workstreams, mentoring others
          on effective execution.
        expert: >
          Defines delivery practices that scale across the organization.
```

#### Disciplines

Edit files under `data/pathway/disciplines/` to define role types that reference
your capability skills.

```yaml
specialization: Software Engineering
roleTitle: Software Engineer
coreSkills:
  - task_execution
validTracks:
  - null
```

Use `null` in `validTracks` to allow a trackless (generalist) configuration.

After each change, re-validate with `npx fit-map validate`.

### Activity: install the Supabase CLI

The activity layer runs on Supabase. You need the Supabase CLI to start a local
instance and to deploy migrations and edge functions to a hosted project.
`fit-map` wraps the CLI for every activity workflow, but it still needs the
`supabase` binary on your `PATH`.

```sh
# macOS
brew install supabase/tap/supabase

# Linux / Windows — see https://supabase.com/docs/guides/local-development
```

Verify the install:

```sh
supabase --version
```

### Activity: start the database

Map ships its full Supabase project — `config.toml`, migrations, edge functions,
and `kong.yml` — inside the npm package. `fit-map activity start` runs
`supabase start` against the bundled project so you don't need to `cd` anywhere:

```sh
npx fit-map activity start
```

The CLI prints the local URL and the service-role key when it finishes booting.
Copy the export commands it prints — every ingestion command needs them.

```sh
export MAP_SUPABASE_URL=http://127.0.0.1:54321
export MAP_SUPABASE_SERVICE_ROLE_KEY=<service-role key from fit-map activity start>
```

To stop the local instance:

```sh
npx fit-map activity stop
```

To check whether the local stack is running and the activity schema is
reachable:

```sh
npx fit-map activity status
```

For a hosted deployment, link the project once, push the migrations, and deploy
all four edge functions:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy github-webhook getdx-sync people-upload transform
```

### Activity: apply migrations

`fit-map activity start` applies the bundled migrations automatically the first
time it runs. Three migrations create everything Map needs:

| Migration                              | Creates                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `20250101000000_activity_schema.sql`   | `activity` schema with `organization_people`, GitHub, GetDX, evidence  |
| `20250101000001_get_team_function.sql` | `activity.get_team(email)` recursive CTE for manager-rooted team walks |
| `20250101000002_raw_bucket.sql`        | `raw` storage bucket for the ELT extract phase                         |

To re-apply migrations against a clean local database (this drops your data):

```sh
npx fit-map activity migrate
```

### Activity: push people

The unified person model lives in `activity.organization_people`. Email is the
join key across HR, GitHub commits, and GetDX. Each row also carries a Pathway
job profile (`discipline`, `level`, `track`), so any consumer can derive the
full skill matrix for that person.

Create a `people.yaml` file with your roster:

```yaml
- email: ada@example.com
  name: Ada Lovelace
  github_username: adalovelace
  discipline: software_engineering
  level: L4
  track: platform
  manager_email: charles@example.com

- email: charles@example.com
  name: Charles Babbage
  github_username: cbabbage
  discipline: engineering_management
  level: L5
  manager_email: null
```

CSV is also supported. Use the same column names as the YAML keys.

#### Step 1: validate locally

`fit-map people validate` checks the file against your framework — every
`discipline`, `level`, and `track` must exist in `data/pathway/`. It does not
talk to Supabase. Treat this as a fast pre-flight check before pushing to the
database.

```sh
npx fit-map people validate ./people.yaml
```

The CLI reports validation errors row by row. Fix them in `people.yaml` and
re-run until you see a clean result.

#### Step 2: push to Supabase

Once validation passes, push the roster into the activity database:

```sh
npx fit-map people push ./people.yaml
```

`fit-map people push` stores the file in the `raw` bucket for audit, then
upserts it into `activity.organization_people`. People without a manager are
inserted before people with one, so the `manager_email` foreign key always
resolves. Re-run the command any time your roster changes — it upserts on
`email`, so it's safe to run repeatedly.

Behind the scenes, `fit-map people push` talks to the same extract and transform
helpers that the `people-upload` edge function uses. If you prefer to run the
upload server-side — for example from a form or an admin workflow — POST the
file to the hosted function instead:

```sh
curl -X POST \
  -H "Authorization: Bearer $MAP_SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/x-yaml" \
  --data-binary @./people.yaml \
  https://<project-ref>.supabase.co/functions/v1/people-upload
```

### Activity: ingest GitHub activity

Map ships a `github-webhook` edge function that receives GitHub webhook events,
stores the raw payload in the `raw` bucket, and extracts normalized artifacts
into `activity.github_artifacts`. Pull requests, reviews, and pushes are all
handled out of the box.

With the local Supabase running, the function URL is:

```
http://127.0.0.1:54321/functions/v1/github-webhook
```

For a hosted deployment, the URL is:

```
https://<project-ref>.supabase.co/functions/v1/github-webhook
```

In your GitHub organization or repository settings, add a webhook pointing at
that URL with these events selected:

- Pull requests
- Pull request reviews
- Pushes

Set the content type to `application/json`. Each delivery is stored under
`raw/github/<delivery-id>.json` and processed into `activity.github_events` and
`activity.github_artifacts`. The function joins each artifact to a person via
`github_username`, so make sure your `people.yaml` rows have GitHub usernames
filled in for the engineers you want to track.

### Activity: ingest GetDX snapshots

If your organization uses GetDX, Map can pull snapshot results into the same
database so Landmark can correlate survey scores with marker evidence.

Get a GetDX API token from your GetDX admin. Then run the sync — either locally
with the CLI, or on a schedule by POSTing to the `getdx-sync` edge function.

#### Ad-hoc or one-shot sync

```sh
GETDX_API_TOKEN=<your getdx api token> npx fit-map getdx sync
```

`fit-map getdx sync` fetches `teams.list`, `snapshots.list`, and
`snapshots.info` for every undeleted snapshot, stores each response under
`raw/getdx/`, and upserts:

- `activity.getdx_teams` — the GetDX team hierarchy, bridged to your roster via
  `manager_email`
- `activity.getdx_snapshots` — quarterly survey metadata
- `activity.getdx_snapshot_team_scores` — factor and driver scores per team per
  snapshot, with `vs_prev`, `vs_org`, and percentile comparisons

The command prints the imported team, snapshot, and score counts when it
finishes.

#### Scheduled sync

For continuous ingestion, set the GetDX token as a secret on your hosted
Supabase project and schedule the `getdx-sync` edge function on any cron that
can send an HTTP POST — GitHub Actions `schedule:` jobs, a Nomad periodic, or
`cron.d`:

```sh
supabase secrets set GETDX_API_TOKEN=<your getdx api token>

curl -X POST \
  -H "Authorization: Bearer $MAP_SUPABASE_SERVICE_ROLE_KEY" \
  https://<project-ref>.supabase.co/functions/v1/getdx-sync
```

Once a quarter is typical — match your GetDX survey cadence. The edge function
and the CLI run the same extract-and-transform code, so switching between them
is purely a deployment choice.

The driver IDs in `data/pathway/drivers.yaml` are the same IDs as
`getdx_snapshot_team_scores.item_id` — GetDX assigns those IDs, and you mirror
them when authoring `drivers.yaml`. That shared namespace is what lets Landmark
juxtapose a driver's GetDX score against the marker evidence for its
contributing skills.

### Activity: re-run transforms

To reprocess every raw document in storage from scratch — for example after
restoring a database, after upgrading Map to pick up a transform fix, or to
backfill from raw payloads — ask `fit-map` to re-run every transform against the
`raw` bucket:

```sh
npx fit-map activity transform
```

The command reads people, GetDX, and GitHub raw documents in dependency order
and upserts on natural keys, so it is safe to re-run. To reprocess a single
source instead of all three:

```sh
npx fit-map activity transform people
npx fit-map activity transform getdx
npx fit-map activity transform github
```

The hosted equivalent is the `transform` edge function, which runs the same code
server-side:

```sh
curl -X POST \
  -H "Authorization: Bearer $MAP_SUPABASE_SERVICE_ROLE_KEY" \
  https://<project-ref>.supabase.co/functions/v1/transform
```

### Activity: verify the data

Once people are pushed and at least one ingestion command has run, verify the
database with a single command:

```sh
npx fit-map activity verify
```

`fit-map activity verify` reads `activity.organization_people` and at least one
derived table, prints the row counts it found, and exits 0 if both are
populated. If either is empty it exits non-zero with a message pointing at the
step that didn't run.

If verification passes, your activity layer is ready for Landmark, Summit, and
Guide.

### Trying the activity layer with synthetic data

If you want to explore the activity layer before connecting real data sources,
Map can populate the database with synthetic data — a realistic roster, GitHub
events, and GetDX snapshots generated from a template.

First, generate synthetic data (requires the `@forwardimpact/universe` package):

```sh
npx fit-universe data/synthetic/story.dsl
```

Then seed the activity database:

```sh
npx fit-map activity seed
```

This uploads the generated roster and raw documents, runs all transforms, and
verifies the result. The database will contain realistic but fictional data you
can query with Landmark or Summit. When you are ready to switch to real data,
push your actual roster with `npx fit-map people push` — it overwrites the
synthetic entries.

---

## Pathway

Pathway is your interface to the framework — browse roles, generate job
definitions, and preview everything in the browser.

### Preview

Start the development server to see your framework in the browser:

```sh
npx fit-pathway dev
# Open http://localhost:3000
```

Browse disciplines, levels, and skills to verify everything looks correct.

### Generate job definitions

Generate a complete job definition by combining a discipline, level, and
optional track:

```sh
npx fit-pathway job software_engineering L3 --track=platform
```

### Generate interview questions

Create role-specific interview question sets:

```sh
npx fit-pathway question software_engineering L3
```

---

## Landmark

Landmark is the analysis layer for engineering-system signals. It reads Map data
to show practice patterns, snapshot trends, and combined health views for
manager-defined teams.

### View practice patterns

See aggregate marker patterns across a team scope:

```sh
npx fit-landmark practice --skill system_design --manager platform_manager
```

This shows where your team has strong evidence of skill practice and where
evidence is weak — helping you identify coaching opportunities.

### Track snapshot trends

Compare GetDX snapshot scores over time:

```sh
npx fit-landmark snapshot trend --item MTQ2 --manager platform_manager
npx fit-landmark snapshot compare --snapshot MjUyNbaY --manager platform_manager
```

### View team health

Combine marker evidence and snapshot factors into a single health view:

```sh
npx fit-landmark health --manager platform_manager
```

---

## Summit

Summit treats a team as a system, not a collection of individuals. It aggregates
skill matrices into capability coverage, structural risks, and what-if staffing
scenarios.

### View capability coverage

See your team's collective proficiency across all skills:

```sh
npx fit-summit coverage platform
```

### Identify structural risks

Find single points of failure, critical gaps, and concentration risks:

```sh
npx fit-summit risks platform
```

### Run what-if scenarios

Simulate roster changes and see their impact before making a decision:

```sh
npx fit-summit what-if platform --add "{ discipline: se, level: L3, track: platform }"
```

---

## Next steps

- [Authoring frameworks](/docs/guides/authoring-frameworks/) — full guide to
  defining all entity types: levels, disciplines, tracks, capabilities, skills,
  behaviours, stages, and drivers
- [Team capability](/docs/guides/team-capability/) — deep dive into Summit
  coverage, risks, and scenario planning
- [YAML schema reference](/docs/reference/yaml-schema/) — complete file format
  documentation
