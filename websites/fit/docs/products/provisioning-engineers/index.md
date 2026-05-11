---
title: Provision Engineer Auth Users
description: Reconcile Supabase Auth users against the activity roster so identity-derived row-level security works.
---

Landmark's row-level security policies admit a request based on the JWT's
`email` claim. Supabase Auth only issues a JWT for an `auth.users` row that
already exists — so before any engineer can read their own activity rows,
their roster entry needs a paired `auth.users` row.

`fit-map people provision` reconciles `auth.users` against the
`activity.organization_people` roster: it creates rows for new engineers,
restores rows that were previously decommissioned, and bans rows whose
roster entry has been removed.

This guide is for **operators** — anyone running the verb against a
production Supabase instance. Engineers do not run it.

## Prerequisites

- `MAP_SUPABASE_URL` and `MAP_SUPABASE_SERVICE_ROLE_KEY` exported in your
  shell. The service-role key is the same credential `fit-map people push`
  consumes — `provision` is operator-only by virtue of which env var it
  reads. It is registered on `fit-map`, not `fit-landmark`, because
  Landmark's read path no longer holds the service-role key.
- `activity.organization_people` populated. Run `fit-map people push
  <roster.yaml>` first if it isn't.

## Run it

```sh
fit-map people provision
```

The verb reports a per-action summary:

```
  Provisioning auth.users from organization_people

  created: 4
  restored: 0
  decommissioned: 1
  unchanged: 22

  Reconciliation complete
```

The four counters cover every reachable transition:

| Counter | Meaning |
| --- | --- |
| `created` | Roster row had no matching `auth.users` row; one was created. |
| `restored` | `auth.users` row was banned; it has been unbanned because the roster brought the engineer back. |
| `decommissioned` | Roster row was removed; the matching `auth.users` row has been banned (`banned_until` ≥100 years out). |
| `unchanged` | Roster row and `auth.users` row already paired and active; no change. |

## Idempotency

Running `provision` twice in a row against the same roster leaves the
`auth.users` rowset unchanged: the count, the `id` per email, and the
active-state per row are all stable. This is the contract the test harness
and CI fixtures rely on; production operators can run it from cron without
fear of churning state.

## Decommissioning

When an engineer leaves and their roster row is removed, the next
`provision` run bans their `auth.users` row by setting `banned_until` to
≈100 years out (`ban_duration: "876000h"`). Banned users cannot issue
JWTs, so no new Landmark reads land for them.

The `id` is preserved across decommission — if the same engineer rejoins
and the roster row reappears, a subsequent `provision` run unbans the
same row (`ban_duration: "none"`), preserving any audit trail that
referenced the original `id`.

## What this does not do

- **Issue JWTs to engineers.** A `fit-landmark login` verb,
  magic-link delivery, password-reset flow, or SSO bridge — any of which
  would turn a provisioned `auth.users` row into a JWT in the engineer's
  CLI environment — is a follow-up. `provision` only ensures the row
  exists; getting a JWT into engineer hands remains a separate concern.
- **Delete user data.** Decommissioning bans the row; it does not remove
  the engineer's history from `activity.*`. That is governed by the
  retention windows declared in the migration metadata and surfaced via
  `fit-landmark sources --email <e>`.
- **Provision against a remote Supabase from your laptop.** `provision`
  requires the service-role key. Keep it confined to your operator
  environment; never expose it to engineer-side tooling.

## Related

- [Map Overview](https://www.forwardimpact.team/map/index.md)
- [List Engineering Data Sources](https://www.forwardimpact.team/docs/products/engineering-data-sources/index.md)
