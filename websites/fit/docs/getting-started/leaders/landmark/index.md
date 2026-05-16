---
title: "Getting Started: Landmark for Leaders"
description: "Analyze engineering signals — marker evidence, snapshot trends, practice patterns, team health, and engineer voice."
---

Landmark surfaces engineering-system signals from Map's activity layer —
organization roster, GitHub artifact evidence assessed by Guide against your
standard's markers, GetDX snapshot outcomes, and engineer voice comments — so
you can see what the data says about how engineering is functioning.

Landmark requires Map's activity layer (Supabase). If you haven't set it up, see
[Getting Started: Map for Leaders](/docs/getting-started/leaders/map/)
first. To explore with synthetic data, see
[Trying the activity layer with synthetic data](/docs/getting-started/leaders/map/#trying-the-activity-layer-with-synthetic-data)
in the Map guide.

## Prerequisites

- Node.js 18+
- npm
- Map's activity layer running and populated
- A Supabase Auth JWT exported as `LANDMARK_AUTH_TOKEN` — see
  [Authentication](#authentication) below

## Install

```sh
npm install @forwardimpact/landmark
```

## Authentication

Every Landmark command except `marker` reads `LANDMARK_AUTH_TOKEN` from the
environment and rejects requests without it. The token is a Supabase Auth JWT
bound to your email — row-level security uses the `email` claim to scope every
query, so the token both authenticates you and determines what you can see.

**There is no hosted Forward Impact service and no free tier.** Landmark reads
from the Supabase project you stand up via Map. Production-side issuance flows
(a `fit-landmark login` verb, magic-link delivery, SSO bridge) are a
follow-up — until they land, leaders and operators obtain a token by signing
one against `SUPABASE_JWT_SECRET`.

Today's minimum stand-up is four steps under Map:

1. **Start the activity layer.** `npx fit-map activity start` brings the
   Supabase stack up and prints a one-line ready confirmation. The stack
   signs every token with `SUPABASE_JWT_SECRET`, which the bootstrap recipe
   (`just env-setup` for monorepo contributors) writes to `.env` alongside
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
   Hosted Supabase users copy the same four values from Project Settings → API.
2. **Push the roster.** `npx fit-map people push ./people.yaml` populates
   `activity.organization_people`.
3. **Provision auth users.** `npx fit-map people provision` reconciles
   `auth.users` against the roster so each engineer's email maps to an
   authenticable identity. See
   [Provision Engineer Auth Users](/docs/products/provisioning-engineers/) for
   the operator workflow.
4. **Obtain a JWT for yourself.** HMAC-sign a Supabase-shaped JWT against
   `SUPABASE_JWT_SECRET` with your manager email in the `email` claim, then
   export it:

   ```sh
   export LANDMARK_AUTH_TOKEN=<your signed JWT>
   ```

   The signing recipe — header `{alg: "HS256", typ: "JWT"}`, payload with
   `email`, `aud: "authenticated"`, `role: "authenticated"`, and a future
   `exp` — is the same shape Supabase Auth issues. The CI test helper at
   `products/landmark/test/lib/sign-test-token.js` in the monorepo source
   is a reference implementation.

Once `LANDMARK_AUTH_TOKEN` is set, every command in the rest of this guide
works against your scope. The token is not honored offline — there is no
`--data`-only fallback for analytical commands today
([#921](https://github.com/forwardimpact/monorepo/issues/921) tracks that
gap).

For more on what data the token unlocks visibility into, see
[List Engineering Data Sources](/docs/products/engineering-data-sources/).

## View the organization

See who is in the organization and how teams are structured:

```sh
npx fit-landmark org show
npx fit-landmark org team --manager alice@example.com
```

`org show` prints the full organization directory — names, roles, and reporting
lines. `org team` walks the hierarchy under a specific manager, which is the
scope most other commands operate on.

## Browse marker definitions

Look up the observable indicators defined for any skill in your agent-aligned
engineering standard:

```sh
npx fit-landmark marker task_completion
npx fit-landmark marker task_completion --level working
```

This is a reference view — it reads directly from your standard YAML and does
not require Supabase. Use it to review what markers exist before checking
evidence against them.

## View practice patterns

See aggregate marker evidence across a team scope:

```sh
npx fit-landmark practice --manager alice@example.com
npx fit-landmark practice --skill system_design --manager alice@example.com
```

Practice patterns show where your team has strong evidence of skill practice and
where evidence is thin — helping you identify coaching opportunities before they
become gaps.

## How evidence gets populated

Landmark presents evidence — Guide creates it. Guide's evaluation pipeline reads
GitHub artifacts from Map, evaluates each one against the markers in your
engineering standard, and writes evidence rows back to Map. In production this
runs on a schedule (a cron job or GitHub Action) so evidence stays current as new
artifacts arrive:

```sh
echo "evaluate unscored artifacts for all" | npx fit-guide
```

You do not need to run this manually in most setups — your operations team
configures it once during Guide setup.

## Browse evidence

Drill into the evidence rows linked to agent-aligned engineering standard
markers:

```sh
npx fit-landmark evidence --email bob@example.com
npx fit-landmark evidence --skill system_design --email bob@example.com
```

Each row shows the artifact, the marker it was matched to, the skill and
proficiency level, and Guide's rationale for the match. Filter by `--skill` to
focus on a specific area or omit it to see everything.

## Track snapshot trends

GetDX snapshots capture quarterly survey results. Landmark reads them from the
activity layer:

```sh
npx fit-landmark snapshot list
npx fit-landmark snapshot show --snapshot MjUyNbaY
npx fit-landmark snapshot show --snapshot MjUyNbaY --manager alice@example.com
```

`snapshot list` shows available snapshots. `snapshot show` displays factor and
driver scores — add `--manager` to scope to a single team.

Track a specific driver or factor over time:

```sh
npx fit-landmark snapshot trend --item MTQ2 --manager alice@example.com
```

Compare a snapshot against organizational benchmarks:

```sh
npx fit-landmark snapshot compare --snapshot MjUyNbaY --manager alice@example.com
```

## Check promotion readiness

See which next-level markers an engineer has already evidenced and which are
still outstanding — a checklist for promotion conversations:

```sh
npx fit-landmark readiness --email bob@example.com
npx fit-landmark readiness --email bob@example.com --target J060
```

Without `--target`, readiness uses the next level above the engineer's current
level. With `--target`, you can check against any specific level.

## View individual timelines

Track how an engineer's evidence has accumulated over time, aggregated by
quarter:

```sh
npx fit-landmark timeline --email bob@example.com
npx fit-landmark timeline --email bob@example.com --skill system_design
```

Timelines help you see whether growth is accelerating, stalling, or concentrated
in one area. Add `--skill` to focus on a specific capability.

## View evidence coverage

See how complete an individual's evidence coverage is across their expected
skills:

```sh
npx fit-landmark coverage --email bob@example.com
```

Coverage shows evidenced artifacts versus total expected markers — a quick gauge
of how well the evidence record reflects what the engineer actually does.

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

The health view is Landmark's centerpiece — it joins driver scores, contributing
skill evidence, engineer voice comments, and (when Summit is installed) growth
recommendations into a single picture:

```sh
npx fit-landmark health --manager alice@example.com
npx fit-landmark health --manager alice@example.com --verbose
```

Default output is a compact table — one row per driver with the GetDX
percentile, the `vs_org` anchor, and a `More` cell hinting how many additional
percentile anchors are available. A deduped `Recommendations` trailer follows.
Pass `--verbose` for the full per-driver paragraph layout: every percentile
anchor (`vs_prev`, `vs_org`, `vs_50th`, `vs_75th`, `vs_90th`), contributing
skills, evidence counts, GetDX comments, and growth recommendations.

Sample default output:

```
  Team — health view

  Drivers (6)
  ────────────────────────────────────────────────────────────
  #  Driver          Percentile  vs_org   More
  1  Quality         42nd        -10      +4 anchors via --verbose
  2  Reliability     n/a         n/a      -
  …
```

## Surface engineer voice

Landmark surfaces GetDX snapshot comments so you can hear what engineers are
saying:

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

In manager mode, comments are bucketed by theme and aligned to low-scoring
drivers — showing where engineer sentiment matches the data. In individual mode
(`--email`), comments appear as a timeline alongside evidence context.

## Output formats

All Landmark commands support `--format text|json|markdown`. The default is
`text` (formatted for the terminal). Use `json` for programmatic consumption or
`markdown` for sharing in documents and pull requests.

---

## What's next

<div class="grid">

<!-- part:card:../../../../landmark -->
<!-- part:card:../../../products/engineering-outcomes -->

</div>
