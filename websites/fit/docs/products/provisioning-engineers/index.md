---
title: Provision Engineer Auth Users
description: Reconcile Supabase Auth users against the activity roster so identity-derived row-level security works.
---

Landmark's row-level security policies admit a request based on the JWT's
`email` claim. Supabase Auth only issues a JWT for an `auth.users` row that
already exists. So before any engineer can read their own activity rows,
their roster entry needs a paired `auth.users` row.

`fit-terrain substrate provision` reconciles `auth.users` against the
`substrate.people` roster. It creates rows for new engineers. It restores
rows that were previously decommissioned. It bans rows whose roster entry
no longer exists. The verb reads the roster through the
[Substrate Contract](/docs/libraries/substrate-contract/).
The contract is a `substrate.people` view your stack implements. Map
installations already ship the view over `activity.organization_people`.
Any other Supabase-backed stack implements the contract once and gets the
same verb.

This guide is for **operators**, anyone who runs the verb against a
production Supabase instance. Engineers do not run it.

## Prerequisites

- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` available in your
  environment. Hosted Supabase projects expose them in Project Settings →
  API. The service-role key is the same credential `fit-map people push`
  consumes. `provision` is operator-only because of the credential it
  reads. It lives on `fit-terrain` and not on `fit-landmark`, because
  Landmark's read path never holds the service-role key.
- `substrate.people` implemented and populated. For Map installations, run
  `fit-map people push <roster.yaml>` first if the roster is empty. For
  other stacks, `fit-terrain substrate check` verifies the contract is in
  place.

## Run it

```sh
npx fit-terrain substrate provision
```

The verb reports a per-action summary:

```text
  Provisioning auth.users from substrate.people

  created: 4
  restored: 0
  decommissioned: 1
  unchanged: 22

  Reconciliation complete
```

The four counters cover every reachable transition:

| Counter | Meaning |
| --- | --- |
| `created` | The roster row had no paired `auth.users` row. `provision` created one. |
| `restored` | The `auth.users` row was banned. `provision` unbanned it because the roster brought the engineer back. |
| `decommissioned` | The roster row was removed. `provision` banned the paired `auth.users` row (`banned_until` ≥100 years out). |
| `unchanged` | The roster row and the `auth.users` row are already paired and active. `provision` makes no change. |

## Idempotency

Two `provision` runs in a row against the same roster leave the
`auth.users` rowset unchanged. The count, the `id` per email, and the
active-state per row are all stable. The test harness and CI fixtures rely
on this contract. Production operators can run it from cron and it does
not churn state.

## Decommissioning

When an engineer leaves and you remove their roster row, the next
`provision` run bans their `auth.users` row. It sets `banned_until` to
≈100 years out (`ban_duration: "876000h"`). Banned users cannot issue
JWTs, so no new Landmark reads land for them.

`provision` preserves the `id` across decommission. If the same engineer
rejoins and the roster row reappears, the next `provision` run unbans the
same row (`ban_duration: "none"`). The unban preserves any audit trail
that referenced the original `id`.

## What this does not do

- **Issue JWTs to engineers.** `provision` only makes sure the `auth.users`
  row exists so Supabase Auth will accept the engineer's sign-in. Engineers
  get a JWT when they run `fit-landmark login` themselves (magic-link or
  OTP). Operators who issue long-lived tokens for unattended agents use
  `fit-map auth issue`. See
  [Sign In to Landmark](/docs/products/signing-in-to-landmark/)
  and
  [Issue Service-Account Tokens](/docs/products/issuing-service-account-tokens/).
- **Delete user data.** The decommission bans the row. It does not remove
  the engineer's history from `activity.*`. The retention windows govern
  that history. The migration metadata declares them, and
  `fit-landmark sources --email <e>` surfaces them.
- **Provision against a remote Supabase from your laptop.** `provision`
  requires the service-role key. Keep it confined to your operator
  environment. Never expose it to engineer-side tooling.

## What's next

<div class="grid">

<!-- part:card:../engineering-outcomes -->
<!-- part:card:../issuing-service-account-tokens -->
<!-- part:card:../engineering-data-sources -->

</div>
