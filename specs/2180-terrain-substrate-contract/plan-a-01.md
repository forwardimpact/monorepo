# Plan 2180-a part 01 — Standard contract moves to libskill

Move the levels module and the thirteen JSON schemas into `libskill`, repoint
every consumer, and fix `libterrain`'s schema-dir resolution — after this part
`rg '@forwardimpact/map' libraries/` is empty (SC1–SC3).

## Step 1 — Move the levels module

Host `levels.js` and its test in `libskill`.

- Moved: `products/map/src/levels.js` → `libraries/libskill/src/levels.js`
- Moved: `products/map/test/levels.test.js` →
  `libraries/libskill/test/levels.test.js` (import repoints to
  `../src/levels.js`)
- Modified: `libraries/libskill/package.json`

`libskill` `exports` gains `"./levels": "./src/levels.js"`.

Verify: `bun test libraries/libskill/test/levels.test.js` passes.

## Step 2 — Move the JSON schemas

Host the thirteen `*.schema.json` files in `libskill`; `map` keeps
`schema/rdf/` only.

- Moved: `products/map/schema/json/` → `libraries/libskill/schema/json/`
  (13 files)
- Modified: `libraries/libskill/package.json`, `products/map/package.json`

`libskill`: `exports` gains `"./schema/json/*": "./schema/json/*"`; `files`
gains `"schema/json/*.json"`. `map`: `exports` drops `"./levels"` and
`"./schema/json/*"` (keeps `"./schema/rdf/*"`); prune `schema/json` from
`files` if listed.

Verify: `node -e 'import("@forwardimpact/libskill/schema/json/standard.schema.json", {with:{type:"json"}})'`
resolves; `rg '"\./levels"|"\./schema/json' products/map/package.json` is
empty; add the two resolution assertions to
`libraries/libskill/test/levels.test.js` (SC2).

## Step 3 — Repoint libskill internals and drop its map dependency

Break the package cycle.

- Modified: `libraries/libskill/src/{agent,derivation,derivation-responsibilities,derivation-validation,interview,interview-helpers,interview-selection,interview-specialized,matching,matching-development,modifiers,progression}.js`,
  `libraries/libskill/src/policies/{filters,orderings,predicates}.js`,
  `libraries/libskill/test/modifiers.test.js`,
  `libraries/libskill/package.json`

`@forwardimpact/map/levels` → `./levels.js` (relative; test uses
`../src/levels.js`). `dependencies` drops `@forwardimpact/map`.

Verify: `rg '@forwardimpact/map' libraries/libskill/` is empty;
`bun test libraries/libskill` passes.

## Step 4 — Repoint map internals

`map` consumes the standard contract from `libskill` like every other product.

- Modified: `products/map/src/index.js` (drop `export * from "./levels.js"` —
  the root export surface shrinks by design),
  `products/map/src/{modifiers,validation}.js`,
  `products/map/src/validation/{agent,behaviour,common,discipline,driver,level,questions,skill,track}.js`
  (`./levels.js` → `@forwardimpact/libskill/levels`),
  `products/map/src/schema-validation.js`

`schema-validation.js` `createSchemaValidator` replaces the relative
`../schema/json` join with package resolution:

```js
const schemaDir = dirname(
  fileURLToPath(
    import.meta.resolve("@forwardimpact/libskill/schema/json/defs.schema.json"),
  ),
);
```

Verify: `bun test products/map` passes; `products/map/src/levels.js` and
`products/map/schema/json/` do not exist (SC2).

## Step 5 — Repoint products and root tests

Mechanical import swap `@forwardimpact/map/levels` →
`@forwardimpact/libskill/levels` (all four products already declare
`@forwardimpact/libskill`).

- Modified: `products/pathway/src/**` (39 files per
  `rg -l '@forwardimpact/map/levels' products/pathway`),
  `products/summit/src/aggregation/{coverage,depth,growth}.js`,
  `products/landmark/src/lib/evidence-helpers.js`,
  `products/landmark/src/commands/practiced.js`,
  `tests/{model-fixtures.js,model-profile-base.test.js,model-types.test.js,model-types-capability.test.js}`

`@forwardimpact/map/validation` and `@forwardimpact/map/activity/*` imports
stay — only the levels/schema surface moves.

Pathway's three browser importmaps are **not** a mechanical specifier swap:
in `products/pathway/src/{index,slides,handout}.html` the
`"@forwardimpact/map/levels": "/map/lib/levels.js"` entry becomes
`"@forwardimpact/libskill/levels": "/model/lib/levels.js"` — `/model/lib/`
is where dev and build serve libskill's src
(`products/pathway/src/commands/dev.js:130`, `build.js:142`), and
`/map/lib/levels.js` stops existing after the move. No test covers
importmaps; get this wrong and the published site 404s silently.

Verify: `rg "@forwardimpact/map/levels|@forwardimpact/map/schema/json" --glob '!specs/**'`
is empty (SC3 — the spec's exact command; `references/` is updated by
part 06 and must also be clean); `rg '/map/lib/levels' products/pathway/src`
is empty; `bun test tests/ products/` passes and a pathway `dev`/`build`
smoke loads a page that imports levels.

## Step 6 — libterrain resolves the schema dir from libskill

Drop the inverted `libterrain → map` edge and the graceful-null fallback.

- Modified: `libraries/libterrain/bin/fit-terrain.js`,
  `libraries/libterrain/package.json`,
  `libraries/libsyntheticprose/src/engine/pathway.js` (doc comment only)

`defaultSchemaDir()` resolves
`@forwardimpact/libskill/schema/json/standard.schema.json` and **throws** on
resolution failure instead of returning `null` — `libskill` is a required
dependency, so a miss is a broken install (design § Key Decisions). Update the
`--schema-dir` help text to name `@forwardimpact/libskill`. `package.json`:
drop `@forwardimpact/map`, add `@forwardimpact/libskill`.

Verify: `rg '@forwardimpact/map' libraries/` is empty (SC1);
`bun test libraries/libterrain` passes; `bunx fit-terrain validate` renders
pathway output in the monorepo.

## Step 7 — CI and website publish follow the schema move

The published schema URLs and the CI cache keys reference the old path.

- Modified: `.github/workflows/website.yml` (line 50:
  `cp products/map/schema/json/*.json dist/schema/json/` →
  `cp libraries/libskill/schema/json/*.json dist/schema/json/`; the `dist/`
  target and the published `https://www.forwardimpact.team/schema/json/…`
  `$id` URLs are unchanged)
- Modified: `.github/workflows/check-test.yml` (lines 74 and 80: both
  `hashFiles(…)` cache keys swap `products/map/schema/json/**` for
  `libraries/libskill/schema/json/**` — a stale path silently hashes to
  nothing and the synthetic/pathway caches stop invalidating)
- Modified: `websites/CLAUDE.md` (§ around line 126: the sentence describing
  where the published schemas are copied from names the new source)

Verify: `rg 'products/map/schema' .github/ websites/` is empty.

## Step 8 — Repo-wide checks

Verify: `bun run invariants` (workspace-imports guard) and `bun test` pass;
`bun run context:fix` shows no catalog drift.

Libraries used: libskill (new export surface), libterrain (schema-dir
resolution).

## Risks

- `import.meta.resolve` must be called with `this === import.meta` under Bun
  (see the existing note in `bin/fit-terrain.js:207-209`) — keep the call at
  module scope or in a plain function in the same module, not passed as a
  bare reference.
