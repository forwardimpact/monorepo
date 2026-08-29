---
title: "Getting Started: Landmark for Leaders"
description: "Analyze engineering signals: marker evidence, snapshot trends, practice patterns, team health, and engineer voice."
---

Landmark surfaces engineering-system signals from Map's activity layer. The
signals are the organization roster, GitHub artifact evidence that Guide
assesses against your standard's markers, GetDX snapshot outcomes, and engineer
voice comments. You can then see what the data says about how engineering
functions.

Landmark requires Map's activity layer (Supabase). If you did not set it up, see
[Getting Started: Map for Leaders](/docs/getting-started/leaders/map/)
first. To explore with synthetic data, see
[Trying the activity layer with synthetic data](/docs/getting-started/leaders/map/#trying-the-activity-layer-with-synthetic-data)
in the Map guide.

## Prerequisites

- Node.js 22+
- npm
- Map's activity layer up and populated
- A Landmark session created with `fit-landmark login`. See
  [Authentication](#authentication) below

## Install

```sh
npm install @forwardimpact/landmark
```

## Authentication

Every Landmark command except `marker` resolves the caller's identity from a
Supabase Auth session. Row-level security uses the JWT's `email` claim to scope
every query. The session authenticates you and also determines what you can
see.

**There is no hosted Forward Impact service and no free tier.** Landmark reads
from the Supabase project you stand up with Map.

Today's minimum stand-up is three steps under Map plus one Landmark login:

1. **Start the activity layer.** `npx fit-map activity start` brings the
   Supabase stack up and prints a one-line ready confirmation. The bootstrap
   recipe (`just env-setup` for monorepo contributors) writes `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, `JWT_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY`
   to `.env`. Hosted Supabase users copy the same four values from Project
   Settings → API.
2. **Push the roster.** `npx fit-map people push ./people.yaml` populates
   `activity.organization_people`.
3. **Provision auth users.** `npx fit-terrain substrate provision` reconciles
   `auth.users` against the roster so each engineer's email maps to an
   authenticable identity. See
   [Provision Engineer Auth Users](/docs/products/provisioning-engineers/) for
   the operator workflow.
4. **Sign in.** `npx fit-landmark login` walks Supabase's magic-link flow,
   captures the session at a localhost callback, and stores it (0600) in your
   platform's config directory. On Linux that is
   `~/.config/landmark/credentials.json`. See
   [Sign In to Landmark](/docs/products/signing-in-to-landmark/) for the
   macOS and Windows paths. Subsequent commands resolve
   identity automatically. Use `--otp` to skip the browser and paste the
   six-digit code instead:

   ```sh
   npx fit-landmark login --email you@example.com
   npx fit-landmark login --email you@example.com --otp
   ```

   For unattended agents and service accounts that cannot run an interactive
   flow, an operator issues a signed JWT with `fit-map auth issue` instead. See
   [Issue Service-Account Tokens](/docs/products/issuing-service-account-tokens/)
   and [Sign In to Landmark](/docs/products/signing-in-to-landmark/) for the
   full flows.

After you sign in, every command in the rest of this guide works against your
scope. `fit-landmark logout` deletes the local credentials file when you need
to switch identity or revoke the session locally.

See [List Engineering Data Sources](/docs/products/engineering-data-sources/)
for more about the data the session makes visible.

## View the organization

See who is in the organization and what the team structure is:

```sh
npx fit-landmark org show
npx fit-landmark org team --manager alice@example.com
```

`org show` prints the full organization directory: names, roles, and reporting
lines. `org team` walks the hierarchy under a specific manager. Most other
commands operate on that scope.

## Browse marker definitions

Look up the observable indicators defined for any skill in your agent-aligned
engineering standard:

```sh
npx fit-landmark marker task-completion
npx fit-landmark marker task-completion --level working
```

This is a reference view. It reads directly from your standard YAML and does
not require Supabase. Use it to review what markers exist before you check
evidence against them.

## View practice patterns

See aggregate marker evidence across a team scope:

```sh
npx fit-landmark practice --manager alice@example.com
npx fit-landmark practice --skill system_design --manager alice@example.com
```

Practice patterns show where your team has strong evidence of skill practice and
where evidence is thin. They help you find coaching opportunities before they
become gaps.

## How Map and Guide populate evidence

Landmark presents evidence. It does not create evidence. Evidence rows come
from two producers.

Map's transform pipeline derives a first layer directly from ingested GitHub
artifacts. That pipeline runs automatically during
`npx fit-map activity transform`.

Guide's evaluation pipeline goes deeper. It reads the same artifacts from Map,
evaluates each one against the markers in your engineering standard, and
writes its assessments back as evidence rows. In production, the Guide pass
runs on a schedule, for example a cron job or a GitHub Action. Evidence then
stays current as new artifacts arrive:

```sh
echo "evaluate unscored artifacts for all" | npx fit-guide
```

In most setups you do not run this command manually. Your operations team
configures it once during Guide setup.

## Browse evidence

Drill into the evidence rows linked to markers in the agent-aligned engineering
standard:

```sh
npx fit-landmark evidence --email bob@example.com
npx fit-landmark evidence --skill system_design --email bob@example.com
```

Each row shows the artifact, the marker Guide matched it to, the skill and
proficiency level, and Guide's rationale for the match. Filter by `--skill` to
focus on a specific area. Omit it to see everything.

## Track snapshot trends

GetDX snapshots capture quarterly survey results. Landmark reads them from the
activity layer:

```sh
npx fit-landmark snapshot list
npx fit-landmark snapshot show --snapshot MjUyNbaY
npx fit-landmark snapshot show --snapshot MjUyNbaY --manager alice@example.com
```

`snapshot list` shows available snapshots. `snapshot show` displays factor and
driver scores. Add `--manager` to scope to a single team.

Track a specific driver or factor over time:

```sh
npx fit-landmark snapshot trend --item MTQ2 --manager alice@example.com
```

Compare a snapshot against organizational benchmarks:

```sh
npx fit-landmark snapshot compare --snapshot MjUyNbaY --manager alice@example.com
```

## Check promotion readiness

See which next-level markers an engineer already evidenced and which are still
outstanding. This is a checklist for promotion conversations:

```sh
npx fit-landmark readiness --email bob@example.com
npx fit-landmark readiness --email bob@example.com --target J060
```

Without `--target`, readiness uses the next level above the engineer's current
level. With `--target`, you can check against any specific level.

## View individual timelines

Track how an engineer's evidence accumulates over time, aggregated by quarter:

```sh
npx fit-landmark timeline --email bob@example.com
npx fit-landmark timeline --email bob@example.com --skill system_design
```

Timelines help you see whether growth accelerates, stalls, or concentrates in
one area. Add `--skill` to focus on a specific capability.

## View evidence coverage

See how complete an individual's evidence coverage is across their expected
skills:

```sh
npx fit-landmark coverage --email bob@example.com
```

Coverage shows evidenced artifacts versus total expected markers. It gauges how
well the evidence record reflects what the engineer actually does.

## Compare evidenced vs derived capability

See where real practice diverges from what the agent-aligned engineering
standard predicts:

```sh
npx fit-landmark practiced --manager alice@example.com
```

This compares the capability the team should have (based on their job profiles)
against what marker evidence actually shows. Skills with high derived capability
but low evidence may indicate either a data gap or a coaching opportunity.

## View team health

The health view is Landmark's centerpiece. It joins driver scores, evidence
from the skills that contribute, engineer voice comments, and growth
recommendations into a single picture. Growth recommendations appear when you
install Summit:

```sh
npx fit-landmark health --manager alice@example.com
npx fit-landmark health --manager alice@example.com --verbose
```

Default output is a compact table. It shows one row per driver with the GetDX
percentile, the `vs_org` anchor, and a `More` cell. The `More` cell hints how
many additional percentile anchors exist. A deduped `Recommendations` trailer
follows. Pass `--verbose` for the full per-driver paragraph layout. That layout
shows every percentile anchor (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`,
`vs_90th`), the skills that contribute, evidence counts, GetDX comments, and
growth recommendations.

Sample default output:

```text
  Team — health view

  Drivers (6)
  ────────────────────────────────────────────────────────────
  #  Driver          Percentile  vs_org   More
  1  Quality         42nd        -10      +4 anchors via --verbose
  2  Reliability     n/a         n/a      -
  …
```

## Surface engineer voice

Landmark surfaces GetDX snapshot comments so you can hear what engineers say:

```sh
npx fit-landmark voice --manager alice@example.com
```

```text
  alice@example.com team — engineer voice

    Most discussed themes:
      incident              8 comments   "On-call handoffs are still rough", "Runbook coverage is improving"
      onboarding            3 comments   "New hire ramp-up is smoother this quarter"
      deploy                2 comments   "Release cadence feels more predictable now"

    Aligned with health signals:
      Codebase Experience driver (48.6th pctl)
      Requirements Quality driver (49.8th pctl)
```

In manager mode, Landmark buckets comments by theme and aligns them to drivers
with low scores. The view shows where engineer sentiment matches the data. In
individual mode (`--email`), comments appear as a timeline alongside evidence
context.

## Output formats

All Landmark commands support `--format text|json|markdown`. The default is
`text` (formatted for the terminal). Use `json` for programmatic consumption.
Use `markdown` to share in documents and pull requests.

---

## What's next

<div class="grid">

<!-- part:card:../../../../landmark -->
<!-- part:card:../../../products/engineering-outcomes -->

</div>
