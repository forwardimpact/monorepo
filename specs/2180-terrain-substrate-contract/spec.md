# Spec 2180: Generic substrate contract — standard schemas to libskill, identity verbs to fit-terrain

**Classification:** Internal. The change re-layers libraries (`libskill`,
`libterrain`) and `products/map`, updates one workflow wrapper and the
`references/bionova-apps/` staging area, and documents a new external
contract. It serves the **Platform Builders** persona (JTBD: *Build
Agent-Capable Systems*) indirectly by making the substrate identity
capability consumable outside the Forward Impact stack; no shipped
end-user product surface changes behaviour.

## Problem

Two library-to-product dependency edges invert the monorepo's layering, and
the substrate identity capability is welded to `fit-map`:

- **`libterrain` depends on the `map` product** solely to resolve the
  pathway JSON-schema directory for rendering. A library depending on a
  product inverts the layering every other unit follows.
- **`libskill` and `map` form a package-level dependency cycle.**
  `libskill` runtime-imports enums and helpers from
  `@forwardimpact/map/levels` in thirteen modules, while `map` imports
  `deriveSkillMatrix` from `libskill`. The standard's data contract (the
  levels type/enum module and thirteen JSON schemas) lives in the product,
  above the library that derives from it.
- **The substrate identity flow is fit-map-only.** Spec 2170 made substrate
  bring-up generic (`fit-terrain substrate up`) and made the interview
  workflow's persona selection pluggable, but the only implementation of
  the persona contract — provision `auth.users` from the roster, pick an
  invariant-satisfying persona, list the qualifying roster, issue a JWT
  plus substrate files — is `fit-map`, and its queries read map's vendor
  tables (`getdx_*`, `github_*`, `evidence`) directly. Landmark specifics
  are hardcoded: the issued token's env var name
  (`PRODUCT_LANDMARK_TOKEN`) and the pick memory path
  (`wiki/kata-interview/picks.csv`).

### Who is affected

- **Platform Builders / the BioNova Polaris reference** — the interview
  loop's persona identity capability is unusable without adopting the map
  schema wholesale; Polaris can bring a stack up but cannot provision,
  pick, or issue.
- **Monorepo contributors** — the cycle and the inverted edges make the
  layering unreliable as a reasoning tool and block future invariants of
  the form "libraries never depend on products".
- **The Kata team** — the published `kata-interview` action's persona step
  still requires `bunx fit-map`, an exception the action's README has to
  explain.

## Proposal

Two moves, shipped as **one explicit clean break** — no re-export shims, no
deprecated wrappers, no dual code paths. The repository afterward reads as
if it had always been layered this way.

### 1. The standard's data contract moves to libskill

The levels type/enum module and the thirteen JSON schemas move from
`products/map` into `libraries/libskill`, which already owns "the
engineering standard made queryable". `libskill` exports them
(`./levels`, `./schema/json/*`); `map`'s package exports drop both paths
and the files leave the product. Every internal import repoints —
`products/pathway` (39 files), `products/summit`, `products/landmark`,
root `tests/`, `libskill`'s own modules, `libterrain`'s schema-dir
resolution, and `map`'s own remaining source (its root module re-exports
the levels module and its validation layer imports it — those consumers
repoint like every other, so `map`'s root export surface changes too).
`libskill` drops its `map` dependency (breaking the cycle);
`libterrain` drops its `map` dependency (fixing the inverted edge). After
the move, no package under `libraries/` depends on `@forwardimpact/map`.

### 2. Substrate identity verbs move to fit-terrain, behind a documented contract

`fit-terrain` becomes the generic substrate capability: bring up a stack
(spec 2170), validate it, provision identities, pick a persona, issue
credentials. It does this by **assuming** a consumer-defined interface —
the **Substrate Contract** — instead of owning any vendor schema. Vendor
tables, transforms, seed, and read queries all stay in `map`.

The contract is opinionated and documented as an external guide:

| Element | Required | Content |
| --- | --- | --- |
| Postgres schema `substrate`, exposed through the consumer's Supabase API | yes | Namespace for the contract relations |
| `substrate.people` | yes | `email` (unique), `name`, `kind`, `manager_email`, `team_id`, `team_name`, `discipline`, `level`, `track` |
| `substrate.evidence` | no | `email` — one row per authored evidence item |
| `substrate.discovery` | no | `key`, `value` — navigation ids handed to the persona agent |
| Auth model | yes | Supabase auth, email identities, RLS keyed on `auth.email()`; service-role key for provisioning |

Consumers implement the relations (as views or tables) over their own
schema: `map` maps `activity.*` onto them; Polaris maps its clinical
schema. `discipline`/`level`/`track` are mandated columns — the
engineering-standard vocabulary is a stated opinion of the contract, and a
different-domain consumer maps its role model onto those columns. Absent
optional relations degrade declaredly: no `evidence` drops the
evidence-based pick invariants; no `discovery` yields an identity-only
substrate file.

New and moved `fit-terrain substrate` verbs:

| Verb | Origin | Behaviour |
| --- | --- | --- |
| `init` | new | Scaffold starter SQL (schema + example contract views) into the consumer's migrations directory for editing |
| `check` | new | Validate a live stack against the contract; one diagnostic per missing or malformed relation, severity split required/optional |
| `provision` | `fit-map people provision` | Reconcile `auth.users` against `substrate.people` |
| `pick` | `fit-map substrate pick` | Return one invariant-satisfying persona, diversified against pick memory when a memory path option is supplied (appending the pick on success; no memory otherwise); persona enrichment reads terrain's own synthetic story artifacts |
| `roster` | `fit-map substrate roster` | List every invariant-satisfying persona (operator surface over the same query as `pick`) |
| `issue` | `fit-map substrate issue` | Mint a persona JWT and atomically write the `.env` / `.substrate.json` / stash set; the `.env` variable name is caller-supplied with no default |

The `.env`/`.substrate.json`/stash output contract from spec 2170 is
unchanged — the `kata-interview` skill's persona step depends on it; only
the command producing it changes.

### 3. fit-map after the move

- `fit-map substrate pick`, `fit-map substrate issue`,
  `fit-map substrate roster`, and `fit-map people provision` are
  **removed**, not deprecated.
- `fit-map substrate stage` keeps its pipeline; its provision phase runs
  the capability now owned by `libterrain` (`map` gains a `libterrain`
  dependency — product depending on library, the correct direction).
- The Landmark smoke and `fit-map auth issue` stay in `map` and keep their
  behaviour by consuming the moved persona-query and auth-user-lookup
  capabilities from `libterrain` — no private copies survive.
- `map` adds a migration defining the contract views over `activity.*` and
  exposes `substrate` through its Supabase API config.

### 4. Workflow and reference wiring

- The `kata-interview` wrapper workflow's `persona-select-command` switches
  to `fit-terrain substrate pick` / `issue` (already on PATH in the
  action), preserving today's behaviour: pick memory at
  `wiki/kata-interview/picks.csv` and the issued token named
  `PRODUCT_LANDMARK_TOKEN`. `bunx fit-map` remains only in
  `substrate-setup-command`.
- The Polaris reference documents the full loop: `up` → `init` + its own
  migrations → its own seed → `check` → `provision` → `pick` → `issue`.
- The Substrate Contract ships as an external guide; the `fit-terrain` and
  `fit-map` skills and docs update to match.

## Scope

### Included

- `libraries/libskill/` — hosts the levels module and JSON schemas; drops
  its `@forwardimpact/map` dependency.
- `libraries/libterrain/` — `substrate init|check|provision|pick|roster|issue`
  verbs with tests; drops its `@forwardimpact/map` dependency; gains the
  dependencies the moved verbs need.
- `products/map/` — package exports pruned; four verbs removed; contract
  view migration; API schema exposure; stage, smoke, and `auth issue`
  repointed to the `libterrain` capabilities; the moved source and tests
  leave the product.
- `products/pathway/`, `products/summit/`, `products/landmark/`, root
  `tests/` — mechanical import repoints to `@forwardimpact/libskill`.
- `.github/workflows/kata-interview.yml` — `persona-select-command`
  switches to `fit-terrain`.
- `.claude/skills/fit-terrain/`, `.claude/skills/fit-map/`,
  `websites/fit/docs/` — Substrate Contract guide and skill/doc updates.
- `references/bionova-apps/` — Polaris substrate wiring documented against
  the new verbs.

### Excluded

- Renaming or generalizing map's vendor tables (`getdx_*`, `github_*`,
  `evidence`) — the activity schema is unchanged.
- Map's `./schema/rdf/*` export — the RDF vocabulary is map's product
  surface, not part of the standard data contract libraries consume; it
  stays in `map`.
- Moving the transforms, seed, read queries (`activity/queries/*`), or the
  production ELT out of `map`.
- Changing the `kata-interview` composite action's input/output interface,
  the harness `supervise` contract, or the interview loop itself.
- Managed Supabase, and any Polaris application code (spec 1160 work in a
  separate repo).
- Any compatibility shims, re-exports, deprecated aliases, or transitional
  fallbacks — external consumers of the removed `map` exports take a
  breaking version bump.

## Prerequisites

None blocking. Builds directly on spec 2170 (merged): `fit-terrain
substrate up`, the pluggable `substrate-setup-command` /
`persona-select-command` seam, and `fit-harness scan-logs` all exist.

## Success Criteria

1. No library depends on the map product. Verify:
   `rg '@forwardimpact/map' libraries/` returns nothing.

2. `libskill` hosts the standard contract and `map` no longer exports it.
   Verify: a `libskill` test imports `@forwardimpact/libskill/levels` and
   resolves `@forwardimpact/libskill/schema/json/standard.schema.json`;
   `rg '"\./levels"|"\./schema/json' products/map/package.json` returns
   nothing; `products/map/src/levels.js` and `products/map/schema/json/`
   do not exist.

3. Every internal import repoints. Verify:
   `rg "@forwardimpact/map/levels|@forwardimpact/map/schema/json" --glob '!specs/**'`
   over the repo returns nothing.

4. `fit-terrain substrate init|check|provision|pick|roster|issue` exist
   with unit tests, and the verbs query only contract relations. Verify:
   tests pass;
   `rg 'getdx_|github_' libraries/libterrain/src/ libraries/libterrain/bin/`
   returns nothing; a unit test asserts the verbs' Supabase client is
   bound to the `substrate` schema (covering the `evidence` name shared
   with the vendor table).

5. No Landmark or monorepo literal survives in the moved verbs. Verify:
   `rg 'PRODUCT_LANDMARK_TOKEN|kata-interview' libraries/libterrain/src/ libraries/libterrain/bin/`
   returns nothing; the caller-supplied token name and pick memory path are
   exercised by unit tests.

6. `fit-map` no longer carries the moved verbs. Verify: the `fit-map` CLI
   definition lists none of `substrate pick`, `substrate issue`,
   `substrate roster`, `people provision`; `fit-map substrate stage`
   retains all phases and its tests pass; the smoke and `auth issue` tests
   pass against the `libterrain`-owned capabilities.

7. `map` implements the contract. Verify: a migration under
   `products/map/supabase/migrations/` defines `substrate.people` (and the
   optional relations) over `activity.*`; the Supabase API config exposes
   `substrate`; a test asserts `fit-terrain substrate check` passes
   against the relation shapes that migration defines.

8. The wrapper workflow's persona step uses terrain and preserves current
   behaviour. Verify: the workflow shape test asserts
   `persona-select-command` invokes `fit-terrain substrate pick` and
   `issue`, carries the `wiki/kata-interview/picks.csv` memory path and
   the `PRODUCT_LANDMARK_TOKEN` token name, and contains no `fit-map`
   invocation ( `substrate-setup-command` remains the only `fit-map`
   command line in the workflow).

9. The Substrate Contract is documented for external consumers: relations,
   required columns, auth assumptions, required env vars, and degradation
   semantics for absent optional relations. Verify: the guide exists under
   `websites/fit/docs/` and the `fit-terrain` skill links it.

10. The Polaris reference wires the new verbs. Verify:
    `references/bionova-apps/` names `init`, `check`, `provision`, `pick`,
    and `issue`, with no `fit-map` in the Polaris flow.
