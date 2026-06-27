---
title: Issue Service-Account Tokens
description: Mint long-lived Supabase JWTs for unattended agents that take on a service-account identity in Landmark.
---

Magic-link login works when a human is in front of the email client; it
breaks down for unattended agents. The `fit-map auth issue` verb closes
that gap: it mints a Supabase-shaped JWT for an existing roster row, and
the operator hands the token to the agent as `PRODUCT_LANDMARK_TOKEN`.

The same verb works for human emails too, but the canonical use case is a
service-account row — an identity that exists solely so an agent can take
it on. Service-account rows live in the same `organization_people` table
as humans (with `kind = 'service_account'`) and share the same row-level
security clamp.

This guide is for **operators** running the verb against a Supabase
project. Engineers do not run it.

## Prerequisites

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `JWT_SECRET` available in your environment.
  - **Local stack** — `just env-setup` writes all three to `.env`.
  - **Hosted Supabase** — find them in Project Settings → API → Project URL,
    Service Role Key, and JWT Secret.
- The target email already has both an `organization_people` row and an
  `auth.users` row. Run `fit-map people push` then `fit-map people provision`
  if it doesn't.

## Mint a token

```sh
fit-map auth issue --email kata-agent-team@example.com
```

The verb prints the JWT followed by an export hint:

```text
Issued JWT for kata-agent-team@example.com (service_account, ttl=8760h)

eyJhbGciOi...

  Export: PRODUCT_LANDMARK_TOKEN=<jwt above>; never commit or echo it.

  Done.
```

The default TTL is one year. Override with `--ttl`:

| Suffix | Meaning | Example |
| --- | --- | --- |
| `h` | hours | `--ttl 24h` |
| `d` | days | `--ttl 90d` |
| `y` | years | `--ttl 1y` (equivalent to `--ttl 365d` or `--ttl 8760h`) |

## Service-account rows in the synthetic DSL

Terrain fixtures declare service-account rows alongside humans:

```text
people {
  count 50
  ...
  service_account "kata-agent-team" {
    name "Kata Agent Team"
    email "kata-agent-team@example.com"
  }
}
```

The renderer emits these as `kind: service_account` entries with no
`level`, `manager_email`, or `team`. `fit-map people push` accepts the
field; the DB check constraint enforces `level IS NULL` when
`kind = 'service_account'`.

## Hand the token to the agent

Write the JWT to the agent's `.env` (or your secret manager). Once
`PRODUCT_LANDMARK_TOKEN` is exported in the agent's environment, every
`fit-landmark` invocation resolves identity directly from the token:

```sh
PRODUCT_LANDMARK_TOKEN=$JWT fit-landmark voice
```

No magic-link, no refresh flow — the long-lived JWT verifies under
`JWT_SECRET` on the Postgres side, RLS clamps the result to
the service-account's row class, and the agent runs unattended.

## Security guidance

Treat the JWT like an SSH key:

- **Never commit it.** Even in a private repo, a leaked one-year token is
  a one-year leak.
- **Store it in a secret manager.** GitHub Actions secrets, AWS Secrets
  Manager, HashiCorp Vault — anywhere with audit logging.
- **Scope per agent.** Mint a separate token per agent identity so a
  compromise can be contained by banning that one `auth.users` row.
- **Rotate proactively.** A year is the default ceiling, not a target.
  Shorter TTLs cap exposure.

## Revoke a token

There is no separate revocation verb. Tokens revoke at the `auth.users`
level: ban the row, and every outstanding JWT for it stops resolving on
the next Supabase Auth check.

```sh
# Remove the row from organization_people and re-run provision —
# the auth.users row gets banned (banned_until ≥100 years).
fit-map people provision
```

To bring the identity back, re-add the roster row and run `provision`
again. Then mint a fresh token; the old one stays inert.

## What's next

<div class="grid">

<!-- part:card:../engineering-outcomes -->
<!-- part:card:../provisioning-engineers -->
<!-- part:card:../signing-in-to-landmark -->

</div>
