---
title: The Substrate Contract
description: Provision identities, pick personas, and issue credentials on any Supabase-backed stack by implementing three views in a substrate schema — no Forward Impact data model required.
---

You want agent interviews or persona-driven sessions against your own
application, but the identity plumbing — reconciling auth users against a
roster, picking a qualifying persona, minting a scoped JWT and handing it to
an agent — is generic work you should not rebuild. The
`fit-terrain substrate` verbs do all of it against one documented interface:
the **Substrate Contract**. You map your schema onto the contract once; the
verbs never read your vendor tables.

This page is the normative definition of the contract. The verbs that consume
it ship with `@forwardimpact/libterrain`:

```sh
npx --yes @forwardimpact/libterrain fit-terrain --help
```

## The contract

### Namespace

A Postgres schema named `substrate`, listed in your Supabase API
configuration (`api.schemas` in `supabase/config.toml`). Every stack-facing
verb builds a client bound to `db.schema = "substrate"` and never names
another schema.

### Relations

You implement the relations as views (or tables) over your own schema:

| Relation | Required | Columns |
| --- | --- | --- |
| `substrate.people` | yes | `email` (unique), `name`, `kind` (`human` rows are personas), `manager_email`, `team_id`, `team_name`, `discipline`, `level`, `track` |
| `substrate.evidence` | no | `email` — one row per authored evidence item |
| `substrate.discovery` | no | `key`, `value` — navigation ids copied into `.substrate.json` |

`discipline`, `level`, and `track` are mandated columns — the
engineering-standard vocabulary is a stated opinion of this contract. A
consumer from a different domain maps its own role model onto the three
columns rather than renaming them. A clinical-research platform, for example,
maps staff roles like this:

```sql
create view substrate.people as
select s.email,
       s.full_name          as name,
       'human'              as kind,
       s.supervisor_email   as manager_email,
       s.site_id            as team_id,
       si.name              as team_name,
       s.role               as discipline,  -- 'research_coordinator', ...
       s.seniority          as level,       -- 'junior', 'senior', ...
       'clinical'           as track
from clinical.staff s
left join clinical.sites si on si.site_id = s.site_id;
```

### Auth model

Supabase auth with email identities. Your product's row-level security keys
on `auth.email()`; provisioning and picking use the service-role key. The
`substrate` schema itself should be readable by `service_role` only — it is
operator surface, not end-user surface.

### Environment variables

| Variable | Needed by |
| --- | --- |
| `SUPABASE_URL` | every stack-facing verb (`check`, `provision`, `pick`, `roster`, `issue`) |
| `SUPABASE_SERVICE_ROLE_KEY` | every stack-facing verb |
| `JWT_SECRET` | `issue` only — the HS256 secret your Supabase stack verifies tokens against |

`substrate init` is an offline scaffold and needs none of them.

### Degradation semantics

Absent optional relations degrade declaredly, never silently:

- `check` reports an absent optional relation as info, not failure.
- `pick` without `substrate.evidence` drops the evidence invariants
  (persona authors evidence; manages a direct who does) and keeps the
  structural ones (persona has a manager; manages at least one direct). The
  payload's `selection_metadata.applied_invariants` names which sets ran.
- `issue` without `substrate.discovery` writes an identity-only
  `.substrate.json` (persona and manager email plus timestamp, no
  navigation ids).

## The walkthrough

From an empty checkout to an issued persona credential:

```sh
# 1. Bring up the local stack and capture its URL/keys.
npx fit-terrain substrate up --cwd . --emit-env .env.local

# 2. One-time: scaffold the contract migration, then edit the commented
#    example views to map your schema. Commit the result.
npx fit-terrain substrate init --cwd .

# 3. Apply your migrations (contract views included) and your own seed.
supabase db push
./scripts/seed.sh

# 4. Gate: one diagnostic per missing or malformed relation.
npx fit-terrain substrate check

# 5. Reconcile auth.users against substrate.people.
npx fit-terrain substrate provision

# 6. Pick one invariant-satisfying persona...
npx fit-terrain substrate pick --format json

# 7. ...and mint its credential set. The .env variable name is yours.
npx fit-terrain substrate issue --email persona@example.com --cwd . \
  --token-env MY_APP_TOKEN
```

`pick` accepts `--memory <path>` to diversify against recent picks recorded
in a CSV it appends on success (window size via `--memory-window`, default
5); omit it for a stateless pick. `issue` accepts `--ttl` (default `1h`) and
`--stash <path>` for a bare copy of the JWT.

`issue` writes three things atomically (mode 0600): a `<NAME>=<jwt>` line to
`.env`, the discovery key/values plus `persona_email`, `manager_email`, and
`generated_at` to `.substrate.json`, and the bare token to `--stash` when
supplied. `--token-env` is required and has no default — the token's name
belongs to your application, not to this library.

## Roster visibility

`npx fit-terrain substrate roster` lists every persona satisfying the
applicable invariants — the same query `pick` runs, as an operator surface.
Use it to see who qualifies before wiring the pick into automation.
