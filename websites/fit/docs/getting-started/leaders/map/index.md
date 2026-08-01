---
title: "Getting Started: Map for Leaders"
description: "Initialize your agent-aligned engineering standard, validate against schemas, set up the activity layer, and ingest operational signals."
---

Map is the data product at the centre of every other tool. It has two layers
that you set up in order:

1. **Standard layer** — YAML files that define your skills, behaviours, levels,
   disciplines, and tracks. Validate them locally with `npx fit-map validate`.
   Pathway, Outpost, and `libskill` consume this layer.
2. **Activity layer** — A Supabase database that stores your organization
   roster, GitHub activity, evidence, and GetDX snapshots. It powers Landmark
   and Summit. It also lets Guide write skill evidence back against markers in
   the agent-aligned engineering standard.

The standard layer is required. The activity layer is optional. It unlocks
everything Landmark and Summit do.

## Prerequisites

- Node.js 22+
- npm

## Install

```sh
npm install @forwardimpact/map
```

## Agent-Aligned Engineering Standard: initialize starter data

Bootstrap a complete skeleton of the agent-aligned engineering standard with
editable YAML files:

```sh
npx fit-map init
```

This creates `./data/pathway/` with starter definitions for levels, disciplines,
capabilities, skills, behaviours, drivers, and tracks. It also creates a
`./config/config.json`, so later `fit-map` commands anchor their configuration
at the project root. The starter data is a working agent-aligned engineering
standard you can customize to match your organization. `npx fit-map init` is a
no-op against an existing project. It keeps the files it already copied.

## Agent-Aligned Engineering Standard: validate

Run the validator to check your YAML files against the schema:

```sh
npx fit-map validate
```

Fix any errors the validator reports before you continue.

## Agent-Aligned Engineering Standard: customize

The starter data gives you a complete foundation. Edit the YAML files under
`data/pathway/` to match your organization's engineering expectations.

### Levels

Edit `data/pathway/levels.yaml` to define your level structure. Each level sets
baseline expectations for skill proficiency and behaviour maturity.

```yaml
- id: J040
  professionalTitle: Level I
  managementTitle: Associate
  ordinalRank: 1
  baseSkillProficiencies:
    core: foundational
    supporting: awareness
    broad: awareness
  baseBehaviourMaturity: emerging

- id: J060
  professionalTitle: Level II
  managementTitle: Senior Associate
  ordinalRank: 2
  baseSkillProficiencies:
    core: working
    supporting: foundational
    broad: awareness
  baseBehaviourMaturity: developing
```

### Capabilities and skills

Edit files under `data/pathway/capabilities/` to define capability groups that
contain skills. Each skill needs a `human:` section with proficiency
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

### Disciplines

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

---

## Activity: install the Supabase CLI

The activity layer runs on Supabase. You need the Supabase CLI to start a local
instance and to deploy migrations and edge functions to a hosted project.
`fit-map` wraps the CLI for every activity workflow. It finds the CLI whether
you install it with Homebrew or as an npm package.

```sh
# macOS via Homebrew (recommended if you have brew)
brew install supabase/tap/supabase

# Anywhere, as a project dependency
npm install supabase

# Linux / Windows — see https://supabase.com/docs/guides/local-development
```

`fit-map` prefers a `supabase` binary on your `PATH`. If it finds none, it falls
back to `npx supabase` and resolves it from your project's `node_modules`. So
the npm-local install works without any PATH setup.

Verify the install:

```sh
supabase --version
# or, for a project-local install:
npx supabase --version
```

## Activity: start the database

Map ships its full Supabase project inside the npm package. The project holds
`config.toml`, migrations, edge functions, and `kong.yml`.
`fit-map activity start` runs `supabase start` against the bundled project, so
you don't need to `cd` anywhere:

```sh
npx fit-map activity start
```

The CLI prints a one-line ready confirmation when the stack is up. Every
ingestion command reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
from `.env`. `just env-setup` (for monorepo contributors) or your
hosted Supabase project's API settings provide them. You do not need
an export step.

To stop the local instance:

```sh
npx fit-map activity stop
```

To check that the local stack is up and the activity schema is
reachable:

```sh
npx fit-map activity status
```

For a hosted deployment, link the project once. Push the migrations. Deploy all
four edge functions:

```sh
supabase link --project-ref <your-project-ref>
supabase db push
supabase functions deploy github-webhook getdx-sync people-upload transform
```

## Activity: apply migrations

`fit-map activity start` applies the bundled migrations automatically the first
time it runs. The core migrations that create the structures every Map install
needs are:

| Migration                              | Creates                                                                |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `20250101000000_activity_schema.sql`   | `activity` schema with `organization_people`, GitHub, GetDX, evidence  |
| `20250101000001_get_team_function.sql` | `activity.get_team(email)` recursive CTE for manager-rooted team walks |
| `20250101000002_raw_bucket.sql`        | `raw` storage bucket for the ELT extract phase                         |

Additional evolutionary migrations under `products/map/supabase/migrations/`
extend the schema (driver columns, RLS policies, evidence keys). All bundled
migrations apply in lexical order on first start.

This command re-applies migrations against a clean local database. It drops your
data:

```sh
npx fit-map activity migrate
```

## Activity: push people

The unified person model lives in `activity.organization_people`. Email is the
join key across HR, GitHub commits, and GetDX. Each row also carries a Pathway
job profile (`discipline`, `level`, `track`), so any consumer can derive the
full skill matrix for that person.

Create a `people.yaml` file with your roster:

```yaml
- email: ada@example.com
  name: Ada Lovelace
  github_username: adalovelace
  discipline: software-engineering
  level: J040
  track: platform
  manager_email: charles@example.com

- email: charles@example.com
  name: Charles Babbage
  github_username: cbabbage
  discipline: software-engineering
  level: J060
  manager_email: null
```

Map also supports CSV. Use the same column names as the YAML keys.

### Step 1: validate locally

`fit-map people validate` checks the file against your agent-aligned engineering
standard. Every `discipline`, `level`, and `track` must exist in
`data/pathway/`. It does not talk to Supabase. Treat this as a fast pre-flight
check before you push to the database.

```sh
npx fit-map people validate ./people.yaml
```

The CLI reports validation errors row by row. Fix them in `people.yaml`. Re-run
the command until you see a clean result.

### Step 2: push to Supabase

Once validation passes, push the roster into the activity database:

```sh
npx fit-map people push ./people.yaml
```

`fit-map people push` stores the file in the `raw` bucket for audit. It then
upserts the file into `activity.organization_people`. The command inserts people
without a manager before people with one, so the `manager_email` foreign key
always resolves. Re-run the command any time your roster changes. It upserts on
`email`, so you can run it repeatedly.

Behind the scenes, `fit-map people push` talks to the same extract and transform
helpers that the `people-upload` edge function uses. To run the upload
server-side, for example from a form or an admin workflow, POST the file to the
hosted function instead:

```sh
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/x-yaml" \
  --data-binary @./people.yaml \
  https://<project-ref>.supabase.co/functions/v1/people-upload
```

## Activity: provision auth users

Landmark's row-level security admits a request based on the JWT's `email` claim.
Supabase Auth only issues a JWT for an `auth.users` row that already exists.
After you push the roster, reconcile `auth.users` against the roster:

```sh
npx fit-terrain substrate provision
```

The command prints a per-action summary (`created`, `restored`,
`decommissioned`, `unchanged`). You can re-run it safely. It upserts on email
and preserves `auth.users.id` across decommission and rejoin. See
[Provision Engineer Auth Users](/docs/products/provisioning-engineers/) for
the full operator workflow.

The command makes sure every engineer's email maps to an authenticable identity.
Leaders and engineers then sign in to Landmark with `fit-landmark login`. That
command walks Supabase's magic-link flow. It stores the session in your
platform's config directory
(`~/.config/landmark/credentials.json` on Linux). See
[Sign In to Landmark](/docs/products/signing-in-to-landmark/) for the
end-to-end flow, or
[Authentication](/docs/getting-started/leaders/landmark/#authentication) in
the Landmark guide for the short version.

## Activity: ingest GitHub activity

Map ships a `github-webhook` edge function. The function receives GitHub webhook
events. It stores the raw payload in the `raw` bucket. It extracts normalized
artifacts into `activity.github_artifacts`. It handles pull requests, reviews,
and pushes out of the box.

When the local Supabase runs, the function URL is:

```text
http://127.0.0.1:54321/functions/v1/github-webhook
```

For a hosted deployment, the URL is:

```text
https://<project-ref>.supabase.co/functions/v1/github-webhook
```

In your GitHub organization or repository settings, add a webhook that points at
that URL. Select these events:

- Pull requests
- Pull request reviews
- Pushes

Set the content type to `application/json`. The function stores each delivery
under `raw/github/<delivery-id>.json`. It processes each delivery into
`activity.github_events` and `activity.github_artifacts`. The function joins
each artifact to a person through `github_username`. Make sure your
`people.yaml` rows have GitHub usernames for the engineers you want to track.

## Activity: ingest GetDX snapshots

If your organization uses GetDX, Map can pull snapshot results into the same
database so Landmark can correlate survey scores with marker evidence.

Get a GetDX API token from your GetDX admin. Then run the sync. Run it locally
with the CLI, or on a schedule with a POST to the `getdx-sync` edge function.

### Ad-hoc or one-shot sync

```sh
GETDX_API_TOKEN=<your getdx api token> npx fit-map getdx sync
```

`fit-map getdx sync` fetches `teams.list`, `snapshots.list`, and
`snapshots.info` for every undeleted snapshot. It stores each response under
`raw/getdx/`. It then upserts:

- `activity.getdx_teams` — the GetDX team hierarchy, bridged to your roster
  through `manager_email`
- `activity.getdx_snapshots` — quarterly survey metadata
- `activity.getdx_snapshot_team_scores` — factor and driver scores per team per
  snapshot, with `vs_prev`, `vs_org`, and percentile comparisons

The command prints the imported team, snapshot, and score counts when it
finishes.

### Scheduled sync

For continuous ingestion, set the GetDX token as a secret on your hosted
Supabase project. Then schedule the `getdx-sync` edge function on any cron that
can send an HTTP POST. Examples are GitHub Actions `schedule:` jobs, a Nomad
periodic, or `cron.d`:

```sh
supabase secrets set GETDX_API_TOKEN=<your getdx api token>

curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  https://<project-ref>.supabase.co/functions/v1/getdx-sync
```

Once a quarter is typical. Match your GetDX survey cadence. The edge function
and the CLI run the same extract-and-transform code. Your choice between them is
purely a deployment choice.

The driver IDs in `data/pathway/drivers.yaml` are the same IDs as
`getdx_snapshot_team_scores.item_id`. GetDX assigns those IDs. You mirror them
when you author `drivers.yaml`. That shared namespace lets Landmark juxtapose a
driver's GetDX score against the marker evidence for the skills that contribute
to it.

## Activity: re-run transforms

To reprocess every raw document in storage from scratch, ask `fit-map` to re-run
every transform against the `raw` bucket. Do this after you restore a database,
after you upgrade Map to pick up a transform fix, or to backfill from raw
payloads:

```sh
npx fit-map activity transform
```

The command reads people, GetDX, and GitHub raw documents in dependency order.
It then derives artifact-interpreted evidence rows from the ingested GitHub
artifacts. Every step upserts on natural keys, so you can re-run it safely. To
reprocess a single target instead of all of them:

```sh
npx fit-map activity transform people
npx fit-map activity transform getdx
npx fit-map activity transform github
npx fit-map activity transform evidence-artifact
```

The hosted equivalent is the `transform` edge function, which runs the same code
server-side:

```sh
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  https://<project-ref>.supabase.co/functions/v1/transform
```

## Trying the activity layer with synthetic data

You can explore the activity layer before you connect real data sources. Map
populates the database with synthetic data. The data is a realistic roster,
GitHub events, and GetDX snapshots generated from a template.

First, generate synthetic data (requires the `@forwardimpact/libterrain`
package):

```sh
npx fit-terrain build --story=data/synthetic/story.dsl
```

Then seed the activity database:

```sh
npx fit-map activity seed
```

This uploads the generated roster and raw documents. It runs all transforms. It
verifies the result. The database then holds realistic but fictional data you
can query with Landmark or Summit. When you are ready to switch to real data,
push your actual roster with `npx fit-map people push`. That command overwrites
the synthetic entries.

## Activity: verify the data

Push people first. Make at least one data source available, either with the real
ingestion commands above or with `activity seed`. Then verify the database:

```sh
npx fit-map activity verify
```

`fit-map activity verify` reads `activity.organization_people` and at least one
derived table (`getdx_snapshots` or `github_events`). It prints the row counts
it found. It exits 0 if both hold rows. If either is empty, it exits non-zero
with a message that points at the step that didn't run.

If verification passes, your activity layer is ready for Landmark, Summit, and
Guide.

---

## What's next

<div class="grid">

<!-- part:card:../../../../map -->
<!-- part:card:../../../products/authoring-standards -->

</div>
