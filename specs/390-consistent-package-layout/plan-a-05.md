# Plan A — Part 05: Products

Bring all four products into conformance:

- **map** — flatten `bin/lib/`, fold `activity/` into `src/activity/`, rewrite
  the 25-key `exports` map (1 root `"."` + 24 subpaths).
- **guide** — create `src/` and `src/index.js`, move `lib/status.js` to
  `src/lib/status.js`.
- **basecamp** — rename `template/` → `templates/`, update references.
- **pathway** — already conforms, verify only.

Products is the largest single part in the migration. It lands on its own commit
to keep the diff reviewable.

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
- The spec also flags that exports reach _into_ `supabase/functions/_shared/` —
  we keep those pointing at `supabase/` because `supabase/` is on the allowed
  list. No change.

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
7. `rmdir products/map/bin/lib/commands products/map/bin/lib` (must be empty
   after step 6).
8. **Rewrite `products/map/bin/fit-map.js` imports.** Any import like
   `./lib/client.js` becomes `../src/lib/client.js`; any
   `./lib/commands/activity.js` becomes `../src/commands/activity.js`.
9. **Rewrite internal imports inside the moved files.** Commands currently
   import from `../package-root.js`, `../client.js` etc. — those relative paths
   are preserved because the whole tree moves together (command files that used
   `../client.js` from `bin/lib/commands/` still use `../client.js` from
   `src/commands/` — same relative relationship because `client.js` also moves
   to `src/lib/` one level up… wait — **this is not preserved.** Original:
   `bin/lib/commands/activity.js` → `../client.js` resolves to
   `bin/lib/client.js`. New: `src/commands/activity.js` → `../client.js`
   resolves to `src/client.js`, which does not exist. The correct new path is
   `../lib/client.js`. **Fix every internal import by hand** — grep for `../`
   inside the moved files and re-target.
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
    `./supabase/functions/_shared/activity/...` — leave those targets unchanged
    because `supabase/` is on the allowed list and the source lives inside the
    supabase edge-function tree by design.
11. `products/map/package.json` — `files` field gets `src/**/*.js` (should
    already have it) and the removal of any stale `activity/` entry.
12. Run `bunx fit-map validate` (the package's CLI smoke test) to confirm the
    binary still launches.
13. Run `bun run node --test products/map/test/*.test.js`.
14. Verify all 25 exports (1 root `"."` + 24 subpaths): grep every `"./"` and
    `"."` key in map's `package.json` and for each, confirm the target file
    exists with `test -f`. This is the per-package version of success criterion
    #9.

### products/map imports recap

**External imports of `@forwardimpact/map/...`** (pathway, libskill, etc.) do
not change — they use the subpath keys, which do not change.

**Internal imports inside the moved `bin/lib/`**:

- `bin/fit-map.js` imports from `./lib/...` — rewrite to `../src/lib/...` or
  `../src/commands/...`.
- `bin/lib/commands/*.js` imports from `../client.js`, `../package-root.js`,
  `../supabase-cli.js` — after the move these become `../lib/client.js`,
  `../lib/package-root.js`, `../lib/supabase-cli.js` (because the commands move
  into `src/commands/` but client.js etc. move into `src/lib/` — one extra
  directory hop).
- `bin/lib/commands/*.js` imports from the moved `activity/` tree — the relative
  paths need auditing. Read each command file before editing.

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
   `../src/lib/status.js`. Use `rg 'status' products/guide/bin/` to find the
   call site.
6. **Verify no external consumer exists.** Run `rg '@forwardimpact/guide' .`.
   Today the only consumer is `products/guide/bin/fit-guide.js` itself, which
   uses a relative import (`../lib/status.js`), not the package name. If any
   external consumer appears in the grep, investigate before proceeding.
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
├── package.json           ← main = "src/basecamp.js"; bin = "./src/basecamp.js"
├── pkg/
├── src/
│   ├── agent-runner.js
│   ├── basecamp.js        ← #!/usr/bin/env bun — CLI + library main
│   ├── kb-manager.js
│   ├── posix-spawn.js
│   ├── scheduler.js
│   ├── socket-server.js
│   └── state-manager.js
├── template/              ← singular — non-allowed root subdir
│   ├── CLAUDE.md
│   ├── USER.md
│   └── knowledge/
└── test/
```

**Two non-conformances:**

1. `template/` (singular) vs the allowed `templates/` (plural).
2. `package.json`'s `bin.fit-basecamp` points at `./src/basecamp.js`. Spec rule
   4 says "`bin/` contains only entry-point scripts. One file per CLI binary
   declared in `package.json`." Basecamp has no `bin/` directory at all — its
   CLI entry lives inside `src/`. Under the new contract, every declared binary
   must live at `bin/<name>.js`.

### Target state

- Rename `template/` → `templates/` and update every reference.
- Create `bin/fit-basecamp.js` as a thin shim that runs `src/basecamp.js`.
  Update `package.json` `bin` to point at the new thin shim. Keep
  `src/basecamp.js` as the library entry (`main`).

### Steps

1. `git mv products/basecamp/template products/basecamp/templates`
2. Grep for `template/` references inside basecamp:
   ```
   rg 'template/' products/basecamp/ -l
   ```
3. Update every hit. Typical call sites:
   - `products/basecamp/src/kb-manager.js` — likely reads the template directory
     at runtime.
   - `products/basecamp/src/basecamp.js` — may reference template layout.
4. Update `products/basecamp/package.json` `files` field to replace `template/`
   (if present) with `templates/`.
5. Grep the entire monorepo for `basecamp/template/` (external references):
   ```
   rg 'basecamp/template' .
   ```
6. **Create `products/basecamp/bin/fit-basecamp.js`** as a thin CLI shim.
   Preserve the current shebang (`#!/usr/bin/env bun`) because `src/basecamp.js`
   uses it — swapping to node is out of scope for this spec. Contents:
   ```js
   #!/usr/bin/env bun
   // Thin entry point — delegates to src/basecamp.js.
   import "../src/basecamp.js";
   ```
   Make it executable: `chmod +x products/basecamp/bin/fit-basecamp.js`.
7. **Update `products/basecamp/package.json`**:
   ```jsonc
   {
     "main": "./src/basecamp.js",
     "bin": { "fit-basecamp": "./bin/fit-basecamp.js" }
   }
   ```
   Do **not** remove the shebang from `src/basecamp.js`. When `src/basecamp.js`
   is executed as a library entry it runs a CLI dispatcher at the bottom of the
   file — leaving that in place means the thin shim just re-imports the module
   and the side-effect runs. If the module does not run CLI-on-import today,
   split it: move the CLI dispatcher into `bin/fit-basecamp.js` and keep the
   exports in `src/basecamp.js`. Read the file first to decide which approach
   fits.
8. **Update the scripts in `package.json`** that currently reference
   `src/basecamp.js` as a runtime target:
   ```jsonc
   "scripts": {
     "start": "bun ./bin/fit-basecamp.js",
     "status": "bun ./bin/fit-basecamp.js status",
     "build": "bun pkg/build.js"
   }
   ```
   (Read the current scripts first — they may reference `src/basecamp.js`
   directly. Rewrite to point at `bin/fit-basecamp.js`.)
9. Run `bun run node --test products/basecamp/test/*.test.js`.
10. Spot-check `bunx fit-basecamp --help` from the monorepo root.

### Decision flag

The spec does not explicitly authorize this rename. Two alternatives:

- **(Chosen)** Rename `template/` → `templates/`. Basecamp's single KB template
  becomes `templates/default/` conceptually (but the plan does not nest — it is
  a flat move). The `templates/` plural name matches the allowed list and
  pathway's existing `templates/` directory.
- **(Alternative)** Add `template/` to the allowed list in Part 01 and leave
  basecamp alone. This is less churn but introduces a singular form alongside
  the plural.

The plan chooses rename because it preserves the allowed-list as a short,
memorable set. Flag to the spec author if this decision is wrong.

## products/pathway

### Current state

Directory shape is conformant: `bin/`, `src/`, `templates/`, `test/`. **But two
gaps block success criterion #4:**

1. `products/pathway/src/index.js` **does not exist**. The src/ tree has
   `main.js`, `handout-main.js`, `slide-main.js`, `types.js`, and several
   subdirectories (`commands/`, `components/`, `css/`, `formatters/`, `pages/`,
   `slides/`, `lib/`), but no `index.js`.
2. `products/pathway/package.json` has **no `main` field** and **no `"."` entry
   in `exports`** — only `./formatters` and `./commands`.

Success criterion #4 requires every non-service package to have `src/index.js`.
Part 05 fixes both gaps.

### Steps

1. **Create `products/pathway/src/index.js`.** Make it a thin re-export of the
   types module (which is the closest thing to a public library entry pathway
   has today):
   ```js
   // Public entry point for @forwardimpact/pathway.
   // The primary consumption mode is the CLI (fit-pathway) — this
   // re-export exists so the package conforms to the repo-wide layout
   // contract (spec 390) and so consumers who import
   // @forwardimpact/pathway directly receive the shared type
   // definitions.
   export * from "./types.js";
   ```
   Keep it minimal. Do not move runtime logic — that is out of scope.
2. **Update `products/pathway/package.json`** to add `main` and a `"."` exports
   entry:
   ```jsonc
   {
     "main": "./src/index.js",
     "exports": {
       ".": "./src/index.js",
       "./formatters": "./src/formatters/index.js",
       "./commands": "./src/commands/index.js"
     }
   }
   ```
   The `./formatters` and `./commands` entries stay exactly as today.
3. Run `bun run node --test products/pathway/test/*.test.js`.
4. Spot-check `bunx fit-pathway --help`.
5. Verify with `bun run layout` — pathway now reports fully conformant (root
   subdirs already allowed; `src/index.js` now exists).

## Ordering

1. map: move activity/ and bin/lib/ into src/; rewrite imports; rewrite exports;
   verify.
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
- `products/pathway/src/index.js` exists.
- `products/basecamp/bin/fit-basecamp.js` exists and is executable.
- `products/basecamp/template/` does not exist; `templates/` does.
- `products/basecamp/package.json` `bin.fit-basecamp` is `./bin/fit-basecamp.js`
  (not `./src/basecamp.js`).
- `products/pathway/package.json` has `main: "./src/index.js"` and
  `exports["."]` present.
- `bunx fit-map validate` succeeds.
- `bunx fit-guide --help` succeeds.
- `bunx fit-basecamp --help` (or equivalent) succeeds.
- `bunx fit-pathway --help` succeeds.
- `bun run test` passes.
- Every `"."` and `"./"` key in every product's `package.json` resolves to a
  file that exists on disk (per-package smoke check for #9).

## Risks

1. **products/map has 25 total exports keys** — 1 root (`"."`) + 24 subpaths.
   The activity/ ones that reference package-local source
   (`./activity/queries/*`, `./activity/parse-people`,
   `./activity/validate/people`) move from `./activity/...` to
   `./src/activity/...`; the `./activity/storage` and
   `./activity/{extract,transform}/*` keys point at
   `./supabase/functions/_shared/...` and **must stay untouched** because their
   source lives inside the supabase edge-function tree by design and `supabase/`
   is on the allowed root-subdirs list. Mis-targeting any key silently breaks
   downstream at import time.

2. **The `bin/lib/commands/` rewrite has multi-level relative paths.** Commands
   like `bin/lib/commands/activity.js` likely import from `../client.js`
   (reaching `bin/lib/client.js`). After the move, the command is at
   `src/commands/activity.js` and client.js is at `src/lib/client.js` — the
   relative path becomes `../lib/client.js`. Get every one right. Do not batch
   with `sed` — read and edit each file.

3. **`products/map/bin/fit-map.js` loads commands by name.** Read it carefully:
   if it does something like `import(`./lib/commands/${cmd}.js`)` the dynamic
   string has to change too. Grep for `commands/` inside the binary.

4. **basecamp KB template rename is load-bearing.** The runtime code that reads
   `template/CLAUDE.md` during `fit-basecamp init` is the user-facing feature
   that copies the template to a consumer's knowledge directory. If a reference
   is missed, `fit-basecamp init` silently copies zero files. Grep for both the
   literal string `"template/"` and the path fragment `template` inside JS
   files. The `config/scheduler.json` file may also reference the template path.

5. **products/pathway is "untouched" but Part 01's check still runs against
   it.** Verify no new drift has been introduced since the inventory was taken.

6. **`src/index.js` for guide.** Making guide's `src/index.js` a re-export of
   `status.js` is enough for the layout contract but may not match how the guide
   package currently exposes anything publicly. Today guide has no `main` and no
   `exports` — it is not imported as a library by any consumer, only launched as
   a CLI. The new `src/index.js` is essentially a placeholder. Do not add real
   logic to it; adding logic would be out of scope for this spec.

## Deliverable commit

```
refactor(layout): flatten product layouts to the contract (part 05/08)

- products/map: move bin/lib/ into src/{lib,commands}/, fold activity/
  into src/activity/, rewrite the 24 subpath exports (map ships 25
  keys total: "." + 24 subpaths), rewrite internal imports in
  bin/fit-map.js and the moved commands
- products/guide: create src/, move lib/status.js to src/lib/, add
  src/index.js and main/exports/files
- products/basecamp: rename template/ to templates/, update runtime
  references (kb-manager + package.json scripts), create
  bin/fit-basecamp.js thin shim, update bin field to point there
- products/pathway: create src/index.js, add main and exports["."]
  (otherwise already conformant)

Every public subpath export key is preserved; only targets move.

Part 05 of 08 for spec 390.
```

— Staff Engineer 🛠️
