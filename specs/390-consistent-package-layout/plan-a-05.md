# Plan A — Part 05: Products

Bring all four products into conformance:

- **map** — flatten `bin/lib/`, fold `activity/` into `src/activity/`,
  rewrite the 25-key `exports` map.
- **guide** — create `src/` and `src/index.js`, move `lib/status.js` to
  `src/lib/status.js`.
- **basecamp** — rename `template/` → `templates/`, update references.
- **pathway** — already conforms, verify only.

Products is the largest single part in the migration. It lands on its own
commit to keep the diff reviewable.

## Scope

Four packages under `products/`. Each is handled as its own mini-migration
below. The whole part ships as one commit.

## products/map

### Current state

```
products/map/
├── activity/
│   ├── parse-people.js
│   ├── queries/
│   └── validate/
├── bin/
│   ├── fit-map.js
│   └── lib/
│       ├── client.js
│       ├── package-root.js
│       ├── supabase-cli.js
│       └── commands/
│           ├── activity.js
│           ├── getdx.js
│           ├── init.js
│           ├── people.js
│           └── validate-shacl.js
├── schema/
├── src/
│   ├── index.js
│   ├── iri.js
│   ├── loader.js
│   ├── renderer.js
│   ├── exporter.js
│   ├── validation.js
│   ├── schema-validation.js
│   ├── index-generator.js
│   └── levels.js
├── starter/
├── supabase/
├── templates/
├── test/
└── package.json
```

### Non-conformance

- `activity/` is a non-allowed root subdir (contains source code).
- `bin/lib/` violates rule 4 ("bin/ contains only entry-point scripts").
- The spec also flags that exports reach _into_ `supabase/functions/_shared/`
  — we keep those pointing at `supabase/` because `supabase/` is on the
  allowed list. No change.

### Target state

```
products/map/
├── bin/
│   └── fit-map.js          ← thin entry point only
├── schema/
├── src/
│   ├── index.js
│   ├── iri.js
│   ├── loader.js
│   ├── renderer.js
│   ├── exporter.js
│   ├── validation.js
│   ├── schema-validation.js
│   ├── index-generator.js
│   ├── levels.js
│   ├── lib/
│   │   ├── client.js
│   │   ├── package-root.js
│   │   └── supabase-cli.js
│   ├── commands/
│   │   ├── activity.js
│   │   ├── getdx.js
│   │   ├── init.js
│   │   ├── people.js
│   │   └── validate-shacl.js
│   └── activity/
│       ├── parse-people.js
│       ├── queries/
│       └── validate/
├── starter/
├── supabase/
├── templates/
├── test/
└── package.json
```

### Steps

1. `git mv products/map/activity products/map/src/activity`
2. `mkdir -p products/map/src/lib products/map/src/commands`
3. `git mv products/map/bin/lib/client.js products/map/src/lib/client.js`
4. `git mv products/map/bin/lib/package-root.js products/map/src/lib/package-root.js`
5. `git mv products/map/bin/lib/supabase-cli.js products/map/src/lib/supabase-cli.js`
6. `git mv products/map/bin/lib/commands/*.js products/map/src/commands/`
7. `rmdir products/map/bin/lib/commands products/map/bin/lib` (must be
   empty after step 6).
8. **Rewrite `products/map/bin/fit-map.js` imports.** Any import like
   `./lib/client.js` becomes `../src/lib/client.js`; any
   `./lib/commands/activity.js` becomes `../src/commands/activity.js`.
9. **Rewrite internal imports inside the moved files.** Commands currently
   import from `../package-root.js`, `../client.js` etc. — those relative
   paths are preserved because the whole tree moves together (command files
   that used `../client.js` from `bin/lib/commands/` still use `../client.js`
   from `src/commands/` — same relative relationship because `client.js`
   also moves to `src/lib/` one level up… wait — **this is not
   preserved.** Original: `bin/lib/commands/activity.js` → `../client.js`
   resolves to `bin/lib/client.js`. New: `src/commands/activity.js` →
   `../client.js` resolves to `src/client.js`, which does not exist. The
   correct new path is `../lib/client.js`. **Fix every internal import by
   hand** — grep for `../` inside the moved files and re-target.
10. Update `products/map/package.json` exports — rewrite every
    `"./activity/..."` value from `"./activity/..."` to `"./src/activity/..."`.
    For example:
    ```jsonc
    "./activity/queries/org": "./src/activity/queries/org.js",
    "./activity/parse-people": "./src/activity/parse-people.js",
    "./activity/validate/people": "./src/activity/validate/people.js",
    ```
    The `"./activity/storage"`, `"./activity/extract/*"`, and
    `"./activity/transform/*"` keys already point at
    `./supabase/functions/_shared/activity/...` — leave those targets
    unchanged because `supabase/` is on the allowed list and the source
    lives inside the supabase edge-function tree by design.
11. `products/map/package.json` — `files` field gets `src/**/*.js` (should
    already have it) and the removal of any stale `activity/` entry.
12. Run `bunx fit-map validate` (the package's CLI smoke test) to confirm
    the binary still launches.
13. Run `bun run node --test products/map/test/*.test.js`.
14. Verify the 25 subpath exports: grep every `"./"` key in map's
    `package.json` and for each, confirm the target file exists with
    `test -f`. This is the per-package version of success criterion #9.

### products/map imports recap

**External imports of `@forwardimpact/map/...`** (pathway, libskill, etc.)
do not change — they use the subpath keys, which do not change.

**Internal imports inside the moved `bin/lib/`**:

- `bin/fit-map.js` imports from `./lib/...` — rewrite to `../src/lib/...`
  or `../src/commands/...`.
- `bin/lib/commands/*.js` imports from `../client.js`, `../package-root.js`,
  `../supabase-cli.js` — after the move these become `../lib/client.js`,
  `../lib/package-root.js`, `../lib/supabase-cli.js` (because the commands
  move into `src/commands/` but client.js etc. move into `src/lib/` — one
  extra directory hop).
- `bin/lib/commands/*.js` imports from the moved `activity/` tree — the
  relative paths need auditing. Read each command file before editing.

Use `bun run test` after every rewrite to catch misses.

## products/guide

### Current state

```
products/guide/
├── bin/
│   └── fit-guide.js
├── lib/
│   └── status.js       ← non-conforming root subdir (source code)
├── proto/
├── starter/
├── test/
└── package.json
```

No `src/`. No `main`. No `exports`.

### Target state

```
products/guide/
├── bin/
│   └── fit-guide.js
├── proto/
├── src/
│   ├── index.js        ← new, thin re-export of lib/status.js
│   └── lib/
│       └── status.js
├── starter/
├── test/
└── package.json
```

### Steps

1. `mkdir -p products/guide/src/lib`
2. `git mv products/guide/lib/status.js products/guide/src/lib/status.js`
3. `rmdir products/guide/lib` (must be empty after step 2).
4. **Create `products/guide/src/index.js`** — the spec requires every
   non-service package to have `src/index.js`. Contents:
   ```js
   // Public entry point for @forwardimpact/guide.
   // Re-exports the thin helpers the CLI wires together at launch.
   export * from "./lib/status.js";
   ```
   This is a new file. Keep it minimal — only re-export what is currently
   imported elsewhere from the guide package (likely nothing outside of
   `bin/fit-guide.js`).
5. **Rewrite `bin/fit-guide.js` imports.** Any `../lib/status.js` becomes
   `../src/lib/status.js`. Use `rg 'status' products/guide/bin/` to find
   the call site.
6. **Rewrite any imports from `@forwardimpact/guide/lib/status.js`** —
   research shows this is imported from `libraries/librpc/generated/...`
   under the current layout (reference from research agent output). Confirm
   with `rg '@forwardimpact/guide' .` and update any consumers. If the only
   consumer is librpc itself, the fix is to add a subpath export to guide's
   `package.json`.
7. Update `products/guide/package.json`:
   ```jsonc
   {
     "main": "./src/index.js",
     "bin": { "fit-guide": "./bin/fit-guide.js" },
     "exports": {
       ".": "./src/index.js"
     },
     "files": ["src/**/*.js", "bin/**/*.js", "proto/**", "starter/**", "README.md"]
   }
   ```
8. Run `bun run node --test products/guide/test/*.test.js`.
9. Spot-check `bunx fit-guide --help`.

## products/basecamp

### Current state

```
products/basecamp/
├── config/
│   └── scheduler.json
├── justfile
├── macos/
├── package.json
├── pkg/
├── src/
│   ├── agent-runner.js
│   ├── basecamp.js
│   ├── kb-manager.js
│   ├── posix-spawn.js
│   ├── scheduler.js
│   ├── socket-server.js
│   └── state-manager.js
├── template/           ← singular — non-allowed root subdir
│   ├── CLAUDE.md
│   ├── USER.md
│   └── knowledge/
└── test/
```

Basecamp already has `src/`. The only non-conformance is `template/`
(singular) vs the allowed `templates/` (plural).

### Target state

Rename `template/` → `templates/` and update every reference.

### Steps

1. `git mv products/basecamp/template products/basecamp/templates`
2. Grep for `template/` references inside basecamp:
   ```
   rg 'template/' products/basecamp/ -l
   ```
3. Update every hit. Typical call sites:
   - `products/basecamp/src/kb-manager.js` — likely reads the template
     directory at runtime (e.g., `fs.readFileSync(join(__dirname, "../template/CLAUDE.md"))`).
   - `products/basecamp/src/basecamp.js` — may reference template layout.
   - `products/basecamp/bin/...` — any CLI entry point.
4. Update `products/basecamp/package.json` `files` field if it references
   `template/**` — change to `templates/**`.
5. Grep the entire monorepo for `basecamp/template/` (external references):
   ```
   rg 'basecamp/template' .
   ```
6. Run `bun run node --test products/basecamp/test/*.test.js`.
7. Spot-check `bunx fit-basecamp --help` (or the relevant CLI if one is
   defined — basecamp's `main` is `./src/basecamp.js`).

### Decision flag

The spec does not explicitly authorize this rename. Two alternatives:

- **(Chosen)** Rename `template/` → `templates/`. Basecamp's single KB
  template becomes `templates/default/` conceptually (but the plan does not
  nest — it is a flat move). The `templates/` plural name matches the
  allowed list and pathway's existing `templates/` directory.
- **(Alternative)** Add `template/` to the allowed list in Part 01 and
  leave basecamp alone. This is less churn but introduces a singular form
  alongside the plural.

The plan chooses rename because it preserves the allowed-list as a short,
memorable set. Flag to the spec author if this decision is wrong.

## products/pathway

### Current state

Already conforms: `bin/`, `src/`, `templates/`, `test/`.

### Steps

1. Read `products/pathway/package.json` to confirm exports point at `src/`.
   (Per the inventory: `"./formatters": "./src/formatters/index.js"` and
   `"./commands": "./src/commands/index.js"` — both already correct.)
2. No changes.
3. Running `bun run layout` reports pathway as conformant.

## Ordering

1. map: move activity/ and bin/lib/ into src/; rewrite imports; rewrite
   exports; verify.
2. guide: move lib/status.js into src/lib/; create src/index.js; add main,
   exports; verify.
3. basecamp: rename template/ → templates/; update references; verify.
4. pathway: no changes; verify with `bun run layout`.
5. Run `bun run check` and `bun run test`.
6. Commit.

## Verification

- `bun run layout` reports zero drift under `products/*`.
- `git ls-files 'products/*/*.js'` returns nothing (no root source files).
- `git ls-files 'products/map/bin/lib/**'` returns nothing.
- `products/guide/src/index.js` exists.
- `products/basecamp/template/` does not exist; `templates/` does.
- `bunx fit-map validate` succeeds.
- `bunx fit-guide --help` succeeds.
- `bunx fit-basecamp --help` (or equivalent) succeeds.
- `bunx fit-pathway --help` succeeds.
- `bun run test` passes.
- Every `"./"` key in every product's `package.json` resolves to a file
  that exists on disk (per-package smoke check for #9).

## Risks

1. **products/map has 25 subpath exports.** The activity/ ones move from
   `./activity/...` to `./src/activity/...`; the `./activity/storage` and
   `./activity/{extract,transform}/*` keys point at `./supabase/functions/_shared/...`
   and must stay untouched. Reading the spec's import list confirms which
   is which. Mis-targeting any key silently breaks downstream at import
   time.

2. **The `bin/lib/commands/` rewrite has multi-level relative paths.**
   Commands like `bin/lib/commands/activity.js` likely import from
   `../client.js` (reaching `bin/lib/client.js`). After the move, the
   command is at `src/commands/activity.js` and client.js is at
   `src/lib/client.js` — the relative path becomes `../lib/client.js`. Get
   every one right. Do not batch with `sed` — read and edit each file.

3. **`products/map/bin/fit-map.js` loads commands by name.** Read it
   carefully: if it does something like `import(`./lib/commands/${cmd}.js`)`
   the dynamic string has to change too. Grep for `commands/` inside the
   binary.

4. **basecamp KB template rename is load-bearing.** The runtime code that
   reads `template/CLAUDE.md` during `fit-basecamp init` is the user-facing
   feature that copies the template to a consumer's knowledge directory. If
   a reference is missed, `fit-basecamp init` silently copies zero files.
   Grep for both the literal string `"template/"` and the path fragment
   `template` inside JS files. The `config/scheduler.json` file may also
   reference the template path.

5. **products/pathway is "untouched" but Part 01's check still runs
   against it.** Verify no new drift has been introduced since the
   inventory was taken.

6. **`src/index.js` for guide.** Making guide's `src/index.js` a re-export
   of `status.js` is enough for the layout contract but may not match how
   the guide package currently exposes anything publicly. Today guide has
   no `main` and no `exports` — it is not imported as a library by any
   consumer, only launched as a CLI. The new `src/index.js` is essentially
   a placeholder. Do not add real logic to it; adding logic would be out of
   scope for this spec.

## Deliverable commit

```
refactor(layout): flatten product layouts to the contract (part 05/08)

- products/map: move bin/lib/ into src/{lib,commands}/, fold activity/
  into src/activity/, rewrite the 25-key exports map, rewrite
  internal imports in bin/fit-map.js and the moved commands
- products/guide: create src/, move lib/status.js to src/lib/, add
  src/index.js and main/exports/files
- products/basecamp: rename template/ to templates/, update runtime
  references (kb-manager + any config references)
- products/pathway: no change (already conforms)

Every public subpath export key is preserved; only targets move.

Part 05 of 08 for spec 390.
```

— Staff Engineer 🛠️
