# Plan A — Part 04: libharness full restructure

`libharness` is the outlier in every library audit. This part fixes it end to
end: move sources into `src/`, delete the stale `packages/` tree, update the
package description to reflect its actual cross-monorepo role, and verify
every call site across ~23 test files still resolves.

## Scope

All six items from spec 390's "Fix `libraries/libharness`" section:

1. Create `src/` and move root `index.js` to `src/index.js`.
2. Move `fixture/` → `src/fixture/` and `mock/` → `src/mock/`.
3. Delete the stale `packages/` tree (contains a single zero-byte
   `packages/libharness/mock/config.js`).
4. Update `package.json` description.
5. Update `main`, `exports`, `files` fields.
6. Verify every call site across the monorepo still resolves — import
   specifiers are unchanged because the `exports` map absorbs the move.

## Current state

```
libraries/libharness/
├── index.js              ← root source, moves to src/index.js
├── fixture/
│   ├── assertions.js     ← all 4 files move to src/fixture/
│   ├── index.js
│   ├── pathway.js
│   └── services.js
├── mock/
│   ├── index.js          ← all 13 files move to src/mock/
│   ├── clients.js
│   ├── config.js
│   ├── data.js
│   ├── fs.js
│   ├── grpc.js
│   ├── http.js
│   ├── logger.js
│   ├── observer.js
│   ├── resource-index.js
│   ├── service-callbacks.js
│   ├── services.js
│   └── storage.js
├── packages/             ← STALE — delete entirely
│   └── libharness/
│       └── mock/
│           └── config.js (zero bytes, no importers, residue from a workspace experiment)
├── test/
└── package.json
```

Current `package.json`:

```jsonc
{
  "name": "@forwardimpact/libharness",
  "version": "0.1.12",
  "description": "Test harness and mock infrastructure for guide tests",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./mock": "./mock/index.js",
    "./fixture": "./fixture/index.js"
  },
  "files": [
    "index.js",
    "mock/**/*.js",
    "fixture/**/*.js",
    "README.md"
  ],
  // ...
}
```

## Target state

```
libraries/libharness/
├── src/
│   ├── index.js
│   ├── fixture/
│   │   ├── assertions.js
│   │   ├── index.js
│   │   ├── pathway.js
│   │   └── services.js
│   └── mock/
│       ├── index.js
│       ├── clients.js
│       ├── config.js
│       ├── data.js
│       ├── fs.js
│       ├── grpc.js
│       ├── http.js
│       ├── logger.js
│       ├── observer.js
│       ├── resource-index.js
│       ├── service-callbacks.js
│       ├── services.js
│       └── storage.js
├── test/
└── package.json
```

Target `package.json`:

```jsonc
{
  "name": "@forwardimpact/libharness",
  "version": "0.1.12",
  "description": "Shared test harness and mock infrastructure for the Forward Impact monorepo",
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./mock": "./src/mock/index.js",
    "./fixture": "./src/fixture/index.js"
  },
  "files": [
    "src/**/*.js",
    "README.md"
  ],
  // ...
}
```

**Subpath export keys (`.`, `./mock`, `./fixture`) are unchanged** — only the
right-hand targets move. Every current call site continues to resolve.

## Files modified

- `libraries/libharness/package.json` — description, main, exports, files.
- `libraries/libharness/index.js` → `libraries/libharness/src/index.js` (via `git mv`).
- `libraries/libharness/fixture/index.js` → `libraries/libharness/src/fixture/index.js`.
- `libraries/libharness/mock/*` → `libraries/libharness/src/mock/*`.

## Files deleted

- `libraries/libharness/packages/` — entire tree, including
  `packages/libharness/mock/config.js` (zero bytes, no importers).

## Files NOT modified

**No call sites.** Every call site uses one of the three public subpath
specifiers:

- `@forwardimpact/libharness`
- `@forwardimpact/libharness/mock`
- `@forwardimpact/libharness/fixture`

The exports map catches all three; their targets change under the hood but
the specifiers remain valid. The research sweep identified ~23 test files
across services (`services/{agent,graph,llm,memory,pathway,tool,trace,vector,web}/test/`)
and libraries (`libraries/{librpc,libutil,libvector,libindex}/test/`). None
need changes.

## Ordering

1. Read `libraries/libharness/index.js` to confirm its imports (it
   re-exports from `./fixture/index.js` and `./mock/index.js` — these become
   `./fixture/index.js` and `./mock/index.js` inside `src/`, still
   resolving).
2. Read `libraries/libharness/mock/index.js` to confirm its internal imports
   are relative (`./clients.js`, etc.) — these resolve unchanged after the
   move because the whole directory moves together.
3. `mkdir -p libraries/libharness/src`
4. `git mv libraries/libharness/index.js libraries/libharness/src/index.js`
5. `git mv libraries/libharness/fixture libraries/libharness/src/fixture`
6. `git mv libraries/libharness/mock libraries/libharness/src/mock`
7. `git rm -r libraries/libharness/packages`
8. Edit `libraries/libharness/package.json`:
   - `description` → "Shared test harness and mock infrastructure for the Forward Impact monorepo"
   - `main` → `"./src/index.js"`
   - `exports["."]` → `"./src/index.js"`
   - `exports["./mock"]` → `"./src/mock/index.js"`
   - `exports["./fixture"]` → `"./src/fixture/index.js"`
   - `files` → `["src/**/*.js", "README.md"]`
9. Run `bun run node --test libraries/libharness/test/*.test.js` (if tests
   exist in libharness itself — per the inventory there is a `test/` dir).
10. Run `bun run test` at repo root to verify every call site still
    resolves.
11. Run `bun run layout` — libharness should no longer report any drift.
12. Commit.

## Verification

- `libraries/libharness/packages/` does not exist (`git ls-files libraries/libharness/packages` returns nothing).
- `libraries/libharness/src/index.js`, `src/fixture/index.js`,
  `src/mock/index.js` all exist.
- No root-level `.js` files in `libraries/libharness/`.
- `libraries/libharness/package.json` description no longer mentions "guide".
- Every file in `test/` across services and libraries that imports
  `@forwardimpact/libharness` or `@forwardimpact/libharness/mock` still
  passes its test.
- `bun run test` passes.
- `bun run layout` shows libharness conformant.

## Risks

1. **The zero-byte `packages/libharness/mock/config.js` has no importers,
   per the spec.** Verify once more with
   `rg 'packages/libharness' .` before deleting. A single hit would reset
   the plan — investigate and escalate before proceeding.

2. **Internal relative imports inside `mock/`.** Files like
   `mock/clients.js` and `mock/index.js` likely import from each other via
   `./clients.js`. These paths are preserved when the whole `mock/`
   directory moves into `src/mock/`. No edits needed, but run
   `bun run node --test libraries/libharness/test/*.test.js` to catch any
   miss.

3. **The description change is a published metadata change.** External npm
   consumers see the new description on the next release. That is the
   intended outcome of spec 390 success criterion #10.

4. **`libharness/README.md` may reference the old layout.** If a README
   exists, read it and update any file paths it shows. Grep for
   `./index.js` and `./mock/` in the README.

5. **Stale symlinks or untracked files in `packages/`.** `git rm -r` only
   removes tracked files; untracked residue needs a separate
   `rm -rf libraries/libharness/packages` before the commit. Use
   `git status` to confirm the directory is gone from both the tree and the
   index before committing.

## Deliverable commit

```
refactor(layout): restructure libharness under src/ (part 04/08)

- move root index.js to src/index.js
- move fixture/ to src/fixture/
- move mock/ (13 files) to src/mock/
- delete the stale packages/ tree (zero-byte config.js, no importers)
- update main, exports, files, description in package.json
- description now reflects cross-monorepo role, not "for guide tests"

Every call site across the monorepo continues to resolve because the
exports map keys (., ./mock, ./fixture) are unchanged.

Part 04 of 08 for spec 390.
```

— Staff Engineer 🛠️
