# Plan 2180-a part 06 — Polaris reference wiring

Update the `references/bionova-apps/` living reference (spec 1160) so Polaris
consumes the substrate capability through the new `fit-terrain` verbs, with no
`fit-map` and no `@forwardimpact/map` anywhere in its flow (SC10). This is a
reference-document edit inside this monorepo — no `bionova-apps` repository
work.

## Step 1 — Drop `@forwardimpact/map` from the Polaris dependency story

Schema resolution now ships inside `libterrain` via its hard `libskill`
dependency, so Polaris needs no direct `map` package at all.

- Modified: `references/bionova-apps/spec.md` (§ Technology stack drops
  "`@forwardimpact/map` from npm"; Prerequisite 1's `--schema-dir` sentence
  re-grounds on `@forwardimpact/libskill`'s published `schema/json`)
- Modified: `references/bionova-apps/design-a.md` (dependency table row
  "`@forwardimpact/map` — dependency of `libterrain`" deletes; § Prerequisite
  library changes A's schema-dir row re-grounds on `libskill`)
- Modified: `references/bionova-apps/plan-a.md` (Prerequisites table and
  "Libraries used" drop `@forwardimpact/map`)
- Modified: `references/bionova-apps/plan-a-01.md` (devDependencies block
  drops the `@forwardimpact/map` pin)
- Modified: `references/bionova-apps/plan-a-03.md` (version-pin step drops
  `npm view @forwardimpact/map version` and the `bun pm ls` grep for map)

Verify: `rg '@forwardimpact/map' references/bionova-apps/` is empty. (The
"no fit-map" prose in design § Interviewing Polaris is rewritten by Step 2 —
the combined `fit-map`-free check runs there.)

## Step 2 — Document the full substrate identity loop

Extend design § Interviewing Polaris from "a staff-facing interview would
pass a Polaris persona command" to the concrete wiring against the contract.

- Modified: `references/bionova-apps/design-a.md` § Interviewing Polaris

Content to add:

- **One-time scaffold, committed:** `npx fit-terrain substrate init --cwd .`
  writes the starter migration; Polaris edits the example views to map its
  clinical schema onto the contract — staff and researchers become
  `substrate.people` rows with Polaris roles mapped onto the mandated
  `discipline`/`level`/`track` columns; `substrate.evidence` and
  `substrate.discovery` are declared optional-absent (or mapped later), with
  the declared degradation that implies (structural-only pick invariants;
  identity-only `.substrate.json`).
- **Workflow wiring:** `substrate-setup-command` becomes
  `npx fit-terrain substrate up --cwd . --emit-env "$GITHUB_ENV" && supabase db push && ./data/synthetic/setup.sh && npx fit-terrain substrate check && npx fit-terrain substrate provision`.
- **Staff-facing persona step:** `persona-select-command` uses
  `npx fit-terrain substrate pick --format json` and
  `npx fit-terrain substrate issue --email <picked> --cwd "$AGENT_CWD" --token-env PRODUCT_POLARIS_TOKEN --stash "$RUNNER_TEMP/.persona-jwt"`
  — the token env name is Polaris's own; `--memory` is optional and
  Polaris-scoped if used. Patient interviews still omit the persona step
  entirely.
- Link the Substrate Contract guide
  (`https://www.forwardimpact.team/docs/libraries/substrate-contract/index.md`)
  as the normative reference — the design names only Polaris-specific
  mapping, never restating the relation tables (references/CLAUDE.md § route
  each change to the layer that owns it).

Step 2 also rewords the section's "No fit-map and no map schema" comments so
they stay true without naming a tool the flow never touches.

Verify: each of `fit-terrain substrate init|check|provision|pick|issue` appears
as a command string in § Interviewing Polaris
(`rg -o 'fit-terrain substrate (init|check|provision|pick|issue)' references/bionova-apps/design-a.md`
yields all five), and `rg 'fit-map' references/bionova-apps/` is empty (SC10).

Libraries used: none.

## Risks

- The reference is a living template for a **separate repository** — nothing
  in this part touches `wiki/STATUS.md` rows for spec 1160 or implies
  re-running the bionova-apps build; reconciling the external repo itself is
  the separate § Keeping a reference current pass, out of this spec's scope.
