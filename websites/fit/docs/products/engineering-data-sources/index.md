---
title: List Engineering Data Sources
description: List the activity rows Landmark retains about you and see when they fall off the retention window.
---

The data Landmark reads about engineers comes from a small set of row classes
in Map's activity schema. `fit-landmark sources --email <self>` lists every
class that has at least one row visible to you. Each class shows its retention
window and the projected fall-off date for the oldest row.

This command shows what Landmark knows about you. You read the answer from
the command output. You do not read the schema migration to find out.

## Prerequisites

- A Supabase Auth session bound to your engineer email. Engineers run
  `fit-landmark login` (magic-link or `--otp`) to get one. See
  [Sign In to Landmark](/docs/products/signing-in-to-landmark/).
  Unattended agents and CI fixtures instead export an operator-minted JWT
  as `PRODUCT_LANDMARK_TOKEN`. Test harnesses mint short-lived JWTs against
  `JWT_SECRET` with the `signTestToken` helper.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` available in your environment.
  Local installs generate these in `.env` with `just env-setup`. Hosted
  Supabase deployments copy them from the project's API settings.

## Run it

```sh
fit-landmark sources --email self@example.com
```

Output groups rows per class:

```text
  Profile (organization_people)
    count:   1
    oldest:  2025-09-01T00:00:00Z
    newest:  2025-09-01T00:00:00Z
    window:  while employed

  GitHub artifacts (github_artifacts)
    count:   38
    oldest:  2026-02-12T11:03:00Z
    newest:  2026-05-08T18:21:00Z
    window:  P180D
    falloff: 2026-08-11T11:03:00Z
```

The output omits classes with zero rows visible to you. If every class clamps
to zero, Landmark renders the `NO_SOURCES_FOR_PERSON` empty-state message.
This happens, for example, when you ask about an email outside your scope.

## Fields per class

| Field | Meaning |
| --- | --- |
| `count` | Number of rows in the class visible under your identity (RLS-clamped). |
| `oldest` | Timestamp on the oldest visible row, from the class's `clock` column. |
| `newest` | Timestamp on the most recent visible row. |
| `window` | The retention window declared in the migration metadata. `while employed` for `organization_people`. |
| `falloff` | The projected date when the oldest row reaches the end of its retention window. The output omits this field when the window is `while employed`. |

## Retention is a projection. It is not a guarantee

The `falloff` field is the projected date a row reaches the end of its
retention window. **Retention enforcement is a follow-up.** Enforcement is the
cron, daemon, or scheduled job that physically deletes past-retention rows.
This command reads from the schema declaration. That declaration is the
substrate that enforcement will later use. For now, treat fall-off dates as a
published intent. They are not a guaranteed deletion event.

If a row stays in the schema beyond its `falloff`, retention enforcement has a
bug. This command's display does not.

## Scope

Run `sources --email <self>` to see what Landmark retains about yourself.
If you manage other engineers, pass their email to see what Landmark retains
about them. Landmark clamps the result through row-level security. You then
see only rows for your direct reports. An out-of-tree email returns the
empty-state message. Landmark exposes no rows across scope boundaries.

## What's not in scope

- This command does not yet list additional source classes (Claude Code
  aggregates, `evaluate-evidence` traces, Copilot ingestion). When they
  land, the
  [SOURCE_CLASSES registry](https://github.com/forwardimpact/monorepo/blob/main/products/landmark/src/commands/sources.js)
  expands to cover them.
- Landmark does not consume Map ingestion-pipeline rows
  (`getdx_initiatives`, `getdx_teams`, `github_events`) today. This command
  does not list them.

## What's next

<div class="grid">

<!-- part:card:../growth-areas -->
<!-- part:card:../engineering-outcomes -->
<!-- part:card:../signing-in-to-landmark -->

</div>
