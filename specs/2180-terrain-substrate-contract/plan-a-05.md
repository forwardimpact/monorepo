# Plan 2180-a part 05 — Contract guide, skills, docs

Document the Substrate Contract for external consumers and bring the
`fit-terrain` / `fit-map` skills, CLI `documentation` arrays, and the
provisioning guide in line with the moved verbs (SC9).

## Step 1 — Substrate Contract guide

The normative external document.

- Created: `websites/fit/docs/libraries/substrate-contract/index.md`
- Modified: `websites/fit/docs/libraries/index.md` (register
  `<!-- part:card:substrate-contract -->` in its own grid section)

Front matter and card conventions copied from
`websites/fit/docs/libraries/prove-changes/generate-dataset/index.md`.
Content (all normative tables from design § Substrate Contract):

- the `substrate` schema requirement and Supabase API exposure
- the three relations with required flags and column lists, including the
  `discipline`/`level`/`track` opinion and how a different-domain consumer
  maps its role model onto them
- auth model (Supabase auth, email identities, RLS keyed on `auth.email()`,
  service-role key for provisioning)
- env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (every stack-facing
  verb), `JWT_SECRET` (`issue` only), and that `init` is offline
- degradation semantics: `check` optional-absent = info; `pick` without
  `evidence` drops the evidence invariants and reports `applied_invariants`;
  `issue` without `discovery` writes an identity-only `.substrate.json`
- the consumer walkthrough:
  `up → init → edit views + own migrations → own seed → check → provision → pick → issue`
  with `npx fit-terrain` command lines and a worked example of mapping a
  non-engineering schema onto `substrate.people`

Audience rules per `websites/` conventions: external reader, `npx` only, no
monorepo paths.

Verify: `bun run docs:build` (or the site's build task) renders the page and
the index card; every internal link resolves.

## Step 2 — fit-terrain skill and CLI documentation parity

- Modified: `.claude/skills/fit-terrain/SKILL.md`,
  `.claude/skills/fit-terrain/references/cli.md`,
  `libraries/libterrain/bin/fit-terrain.js` (`documentation` array)

SKILL.md gains a substrate section: what the contract is (one paragraph), the
seven verbs with one-line purposes, the env vars, and the degradation
one-liners; `## Documentation` gains
`[Substrate Contract](https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md)`.
The CLI `documentation` array adds the same entry in the same order
(linking rule in `libraries/CLAUDE.md`). `references/cli.md` lists the new
verbs.

Verify: skill list and CLI array carry identical entries in identical order;
`bun run invariants` (skill-genericity) passes.

## Step 3 — fit-map skill prunes the moved verbs

- Modified: `.claude/skills/fit-map/SKILL.md` (and
  `references/` files that name the moved verbs)

Frontmatter description drops "picking, and issuing personas"; the substrate
section keeps `substrate stage` (its phases, including the provision phase it
now runs via the shared library) and the smoke, deletes the roster/pick/issue
and `people provision` verb documentation, and points persona selection at
`npx fit-terrain substrate` plus the contract guide URL.

Verify: `rg 'substrate (pick|issue|roster)|people provision' .claude/skills/fit-map/`
is empty.

## Step 4 — Provisioning guide and every doc commanding the moved verbs

- Modified: `websites/fit/docs/products/provisioning-engineers/index.md`,
  `websites/fit/docs/products/signing-in-to-landmark/index.md`,
  `websites/fit/docs/products/issuing-service-account-tokens/index.md`,
  `websites/fit/docs/getting-started/leaders/landmark/index.md`,
  `websites/fit/docs/getting-started/leaders/map/index.md`,
  `websites/fit/docs/getting-started/engineers/landmark/index.md`,
  `products/map/bin/fit-map.js`, `libraries/libterrain/bin/fit-terrain.js`,
  `.claude/skills/fit-map/SKILL.md`, `.claude/skills/fit-terrain/SKILL.md`

The provisioning guide's command becomes
`npx fit-terrain substrate provision` with the contract (not the map schema)
as the stated prerequisite; its "Provision Engineer Auth Users" entry moves
from `fit-map`'s `documentation` array + skill list to `fit-terrain`'s,
keeping list/array parity on both sides. The five other docs above each
command `fit-map people provision` in passing — repoint every occurrence to
the new verb.

Verify: `rg -l 'people provision' websites/ .claude/skills/` is empty; both
CLIs' arrays match their skills' `## Documentation` lists.

## Step 5 — Schema-location mentions follow the part-01 move

- Modified: `.claude/skills/fit-map/SKILL.md` (validation section lines
  ~47–52: "each YAML against its JSON Schema (`schema/json/`)" and the
  schema-change instruction now name the schemas' libskill home while
  `schema/rdf/` stays map's),
  `.claude/skills/fit-map/references/` (any file locating `schema/json` in
  map), `websites/fit/docs/reference/yaml-schema/index.md` (the
  source-location column/prose, if it names the map package — the published
  `/schema/json/…` URLs are unchanged)

Verify: `rg -n 'schema/json' .claude/skills/fit-map/ websites/fit/docs/reference/`
shows no line locating the JSON schemas in the map product.

Libraries used: none.

## Risks

- The guide is the contract's single home — the `fit-terrain` skill and the
  map migration must reference it, not restate the relation tables, or the
  next column change forks the spec (one-home-per-policy rule in
  CLAUDE.md § Documentation Map).
