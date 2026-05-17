---
title: List Engineering Data Sources
description: List the activity rows Landmark retains about you and see when they fall off the retention window.
---

The data Landmark reads about engineers comes from a small set of row classes
in Map's activity schema. `fit-landmark sources --email <self>` lists every
class that has at least one row visible to you, together with its retention
window and the projected fall-off date for the oldest row.

This is the answer to *"what does Landmark actually know about me?"* — a
contract that's been worth nothing if you have to read the schema migration
to find out.

## Prerequisites

- A Supabase Auth JWT bound to your engineer email. The CLI reads it from
  `PRODUCT_LANDMARK_TOKEN`. Test harnesses and CI fixtures mint JWTs against
  `SUPABASE_JWT_SECRET` via the `signTestToken` helper; production-side
  issuance flows (login, magic-link, SSO) are a follow-up — until then the
  command requires a manually-injected token.
- `SUPABASE_URL` and `SUPABASE_ANON_KEY` available in your environment.
  Local installs generate these in `.env` via `just env-setup`; hosted
  Supabase deployments copy them from the project's API settings.

## Run it

```sh
fit-landmark sources --email self@example.com
```

Output groups rows per class:

```
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

Classes with zero rows visible to you are omitted from the output. If every
class clamps to zero — for example, you asked about an email outside your
scope — Landmark renders the `NO_SOURCES_FOR_PERSON` empty-state message.

## Fields per class

| Field | Meaning |
| --- | --- |
| `count` | Number of rows in the class visible under your identity (RLS-clamped). |
| `oldest` | Timestamp on the oldest visible row, using the class's `clock` column. |
| `newest` | Timestamp on the most recent visible row. |
| `window` | The retention window declared in the migration metadata. `while employed` for `organization_people`. |
| `falloff` | The projected date when the oldest row reaches the end of its retention window. Omitted when the window is `while employed`. |

## Retention is a projection, not a guarantee

The `falloff` field is the projected date a row reaches the end of its
retention window. **Retention enforcement — the cron, daemon, or scheduled job
that physically deletes past-retention rows — is a follow-up.** The schema
declaration this command reads from is the substrate that enforcement will
later use; for now, treat fall-off dates as a published intent, not a
guaranteed deletion event.

If a row stays in the schema beyond its `falloff`, that's a bug in retention
enforcement, not in this command's display.

## Scope

You can run `sources --email <self>` to see what's retained about yourself.
If you manage other engineers, you can pass their email to see what's retained
about them — Landmark clamps the result through row-level security so you
only see rows for direct reports. An out-of-tree email returns the empty-state
message; no rows are exposed across scope boundaries.

## What's not in scope

- Slices 2–4 of [issue #829](https://github.com/forwardimpact/monorepo/issues/829)
  (Claude Code aggregates, `evaluate-evidence` traces, Copilot ingestion) are
  not yet listed by this command. When they land, the
  [SOURCE_CLASSES registry](https://github.com/forwardimpact/monorepo/blob/main/products/landmark/src/commands/sources.js)
  expands to cover them.
- Map ingestion-pipeline rows (`getdx_initiatives`, `getdx_teams`,
  `github_events`) are not consumed by Landmark today and so are not listed.

## Related

- [Landmark Overview](https://www.forwardimpact.team/landmark/index.md)
- [Demonstrate Engineering Progress](https://www.forwardimpact.team/docs/products/engineering-outcomes/index.md)
