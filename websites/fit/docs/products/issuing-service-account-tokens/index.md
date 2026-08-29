---
title: Issue Service-Account Tokens
description: Mint long-lived Supabase JWTs for unattended agents that take on a service-account identity in Landmark.
---

Magic-link login works when a human is in front of the email client. It
does not work for unattended agents. The `fit-map auth issue` verb closes
that gap. It mints a Supabase-shaped JWT for an existing roster row. The
operator then hands the token to the agent as `PRODUCT_LANDMARK_TOKEN`.

The same verb works for human emails too. The canonical use case is still
a service-account row. A service-account row is an identity that exists
only so an agent can take it on. Service-account rows live in the same
`organization_people` table as humans, with `kind = 'service_account'`.
They share the same row-level security clamp.

This guide is for **operators** who run the verb against a Supabase
project. Engineers do not run it.

## Prerequisites

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and
  `JWT_SECRET` available in your environment.
  - **Local stack.** `just env-setup` writes all three to `.env`.
  - **Hosted Supabase.** Find them in Project Settings → API → Project URL,
    Service Role Key, and JWT Secret.
- The target email already has both an `organization_people` row and an
  `auth.users` row. If a row is missing, run `fit-map people push`. Then
  run `fit-terrain substrate provision`.

## Mint a token

```sh
fit-map auth issue --email reporting-agent@example.com
```

The verb prints the JWT followed by an export hint:

```text
Issued JWT for reporting-agent@example.com (service_account, ttl=8760h)

eyJhbGciOi...

  Export: PRODUCT_LANDMARK_TOKEN=<jwt above>. Never commit or echo it.

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
  service_account "reporting-agent" {
    name "Reporting Agent"
    email "reporting-agent@example.com"
  }
}
```

The renderer emits these as `kind: service_account` entries with no
`level`, `manager_email`, or `team`. `fit-map people push` accepts the
field. The DB check constraint enforces `level IS NULL` when
`kind = 'service_account'`.

## Hand the token to the agent

Write the JWT to the agent's `.env` file or to your secret manager.
Export `PRODUCT_LANDMARK_TOKEN` in the agent's environment. Every
`fit-landmark` command then resolves identity directly from the token:

```sh
PRODUCT_LANDMARK_TOKEN=$JWT fit-landmark voice
```

The agent needs no magic-link and no refresh flow. The Postgres side
verifies the long-lived JWT under `JWT_SECRET`. RLS clamps the result
to the service-account's row class. The agent runs unattended.

## Security guidance

Treat the JWT like an SSH key:

- **Never commit it.** A leaked one-year token gives one year of access,
  even from a private repository.
- **Store it in a secret manager.** Use GitHub Actions secrets, AWS
  Secrets Manager, or HashiCorp Vault. Any store with audit logging works.
- **Scope per agent.** Mint a separate token per agent identity. You can
  then contain a compromise when you ban that one `auth.users` row.
- **Rotate proactively.** The one-year default is a maximum. Shorter
  TTLs cap exposure.

## Revoke a token

No separate revocation verb exists. You revoke tokens at the `auth.users`
level. Ban the row. Every outstanding JWT for it then fails on the next
Supabase Auth check.

```sh
# Remove the row from organization_people and re-run provision —
# the auth.users row gets banned (banned_until ≥100 years).
fit-terrain substrate provision
```

To bring the identity back, re-add the roster row and run `provision`
again. Then mint a fresh token. The old one stays inert.

## What's next

<div class="grid">

<!-- part:card:../engineering-outcomes -->
<!-- part:card:../provisioning-engineers -->
<!-- part:card:../signing-in-to-landmark -->

</div>
