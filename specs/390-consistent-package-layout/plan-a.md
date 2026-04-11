# Plan A — Consistent Package Layout

Implementation plan for [spec 390](spec.md). Translates the spec's "every
package uses the same on-disk shape" mandate into concrete, ordered changes
across all 47 packages (4 products, 9 services, 34 libraries).

## Approach

This is a repo-wide rename. It touches every package, every published
`package.json`, the codegen pipeline, and several doc surfaces. It lands on a
single feature branch as a stack of verified commits and merges atomically — the
spec's "one big diff" guidance is respected at merge time, not authoring time.

The plan decomposes the work into **eight sequential parts** along
infrastructure seams. Each part is independently verifiable but all parts are
executed in order on the same branch. The branch is merged as one commit.

**Guiding principles:**

1. **The `exports` map absorbs the move.** Package-external import specifiers
   (`@forwardimpact/foo/bar`) do not change. Only `package.json` targets move.
   Consumer code edits are required only when a test or internal file uses a
   relative path that crosses the new `src/` boundary.

2. **No build step, no proxy files.** Published `main`, `bin`, and `exports`
   point directly at `src/`. The spec explicitly rejects publish-time flatten
   and root-level `index.js` proxies.

3. **Contract before enforcement.** The allowed-root-subdirs check is introduced
   first (Part 01) and toggled to strict enforcement last (Part 08) once every
   package conforms. A permissive/`--dry-run` mode during the migration lets the
   implementer see remaining drift at every step.

4. **Test relative imports are the main call-site churn.** `test/foo.test.js`
   files that import `../bar.js` need to become `../src/bar.js` after the source
   file moves. External call sites remain unchanged because the `exports` map
   handles the remap.

5. **Services are the one exception.** `services/<name>/index.js` and
   `services/<name>/server.js` stay at the service root — they are loaded by
   fixed path from `config/config.example.json` (and service commands in the
   live `config.json`). Only `services/pathway` has any real work (the spec's
   stray `src/serialize.js` is already in the right place but the root files do
   not yet import from `src/`).

6. **Codegen output moves atomically with its consumers.** The monorepo-root
   `generated/` directory is the real output target and does **not** move —
   libstorage's `"generated"` bucket still resolves to it. What moves is the
   **symlinks**: `libraries/librpc/generated` and `libraries/libtype/generated`
   become `libraries/librpc/src/generated` and
   `libraries/libtype/src/generated`. The symlinks are recreated by
   `fit-codegen` via `libutil/finder.js#findGeneratedPath` (one-line change,
   line 117). The internal `./generated/...` imports inside the moved `librpc`
   and `libtype` sources resolve unchanged because the symlink moves with the
   importing file. Part 02 does the finder change, the librpc/libtype file
   moves, and the codegen re-run as one commit.

## Part index

Execute parts sequentially on branch `feat/390-consistent-package-layout`. Each
part has its own plan file with scope, file list, ordering, and verification
steps.

| #   | File                         | Scope                                                                                                            | Agent                             |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 01  | [plan-a-01.md](plan-a-01.md) | Allowed-root-subdirs check infrastructure (permissive mode)                                                      | staff-engineer                    |
| 02  | [plan-a-02.md](plan-a-02.md) | Codegen pipeline: move `generated/` → `src/generated/`                                                           | staff-engineer                    |
| 03  | [plan-a-03.md](plan-a-03.md) | Services: fix `services/pathway/`, document the services exception                                               | staff-engineer                    |
| 04  | [plan-a-04.md](plan-a-04.md) | `libharness` full restructure + stale `packages/` deletion                                                       | staff-engineer                    |
| 05  | [plan-a-05.md](plan-a-05.md) | Products: map, guide, basecamp, pathway                                                                          | staff-engineer                    |
| 06  | [plan-a-06.md](plan-a-06.md) | Libraries tier A (published subpath exports, higher blast radius)                                                | staff-engineer                    |
| 07  | [plan-a-07.md](plan-a-07.md) | Libraries tier B (no subpath exports, lower blast radius)                                                        | staff-engineer                    |
| 08  | [plan-a-08.md](plan-a-08.md) | Enable strict enforcement, rewrite `CLAUDE.md § Structure`, update skills and internals docs, publish smoke test | staff-engineer + technical-writer |

## Part dependency graph

```
  01 (check infra, permissive)
    │
    ▼
  02 (codegen: libstorage + symlinks + librpc/libtype imports)
    │
    ▼
  03 (services/pathway)
    │
    ▼
  04 (libharness)
    │
    ▼
  05 (products) ──┐
                  ├──► 06 and 07 (libraries, could parallelise in principle
  06 (libs tier A)│        but run sequentially because they all touch
                  │        package.json and we want one authoritative diff)
  07 (libs tier B)┘
    │
    ▼
  08 (strict enforcement + docs + smoke test)
```

## Execution

Run every part sequentially on a single `feat/390-consistent-package-layout`
branch cut from `main`. Each part ends with `bun run check` and `bun run test`
passing — if either fails the part is not complete. Commit per part using the
commit message convention `refactor(layout): <one-line summary>` and push after
each commit so the branch reflects incremental progress.

Route every part to **`staff-engineer`**. Part 08 has a documentation component
that is large enough to hand off; the handoff is a final step _inside_ Part 08
that launches the `technical-writer` subagent for the prose updates and then
resumes in `staff-engineer` for the smoke test and STATUS update. See Part 08
for the exact handoff boundary.

Do **not** parallelise parts. Every part modifies `package.json` files, which
means parallel branches would conflict on every merge. Sequential is cheaper
than the merge-conflict tax.

## Cross-cutting conventions

These conventions apply inside every part — restated here so each part can
assume them without repetition.

### File move recipe (per package)

For a non-service package that today has root-level `.js` sources:

```
1. mkdir -p <pkg>/src
2. git mv <pkg>/*.js <pkg>/src/        # only root source, not test/
3. git mv <pkg>/<domain-dir>/ <pkg>/src/<domain-dir>/   # for each non-allowed root subdir
4. Update package.json:
     main       → ./src/index.js         (or remove if redundant with exports)
     bin.*      → unchanged (bin stays at root)
     exports    → all "./foo" values rewritten to "./src/foo" and
                  all "./<dir>/x.js" rewritten to "./src/<dir>/x.js"
     files      → ["src/**/*.js", "bin/**/*.js"] (plus README.md, etc.)
5. Update test/*.test.js relative imports:
     "../foo.js"  →  "../src/foo.js"
     "../<dir>/x" →  "../src/<dir>/x"
6. Update bin/<entry>.js imports that reach into the package:
     "../foo.js"  →  "../src/foo.js"
7. Run `bun run node --test test/*.test.js` at the package root to verify.
```

Internal imports _within_ `src/` (e.g., `./helper.js` → `./helper.js`) are
unchanged — the files move together, relative paths are preserved.

### package.json invariants

After the move, every published package conforms to this shape:

```jsonc
{
  "main": "./src/index.js",          // omitted if exports["."] is set
  "bin": { "fit-<name>": "./bin/fit-<name>.js" }, // only if the package has a CLI
  "exports": {
    ".": "./src/index.js",
    "./foo": "./src/foo.js"
    // ... per subpath
  },
  "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
}
```

For services, the shape stays:

```jsonc
{
  "main": "./index.js",
  "files": ["index.js", "server.js", "proto/**", "src/**/*.js", "README.md"]
}
```

### Git history preservation

Use `git mv` (not `cp` + `rm`) for every file move so `git log --follow` keeps
working. Do not batch-move across packages in a single commit — one commit per
part keeps the diff reviewable.

### Verification per part

Every part ends with:

1. `bun run check` — format and lint clean
2. `bun run test` — all tests pass, no skipped/disabled tests
3. `bun run layout` — new allowed-root-subdirs check (introduced in Part 01)
   must pass against the packages touched by this part, even in permissive mode
   where remaining drift is allowed
4. Spot-check one `--help` invocation of any CLI the part touched
5. Commit and push

## Known plan decisions and risks

These choices were made during planning. Flag them to the reviewer before
execution if any are wrong.

1. **`products/basecamp/template/` → `products/basecamp/templates/`.** The
   spec's allowed-list uses the plural `templates/` (as `products/pathway/`
   already does). Basecamp's `template/` (singular, a single KB template
   project) is not on the allowed list. The plan renames it to the plural form
   in Part 05. **If the spec author wants to keep the singular name, the
   allowed-list in Part 01 and the CLAUDE.md update in Part 08 must add
   `template/` instead and this rename drops out.**

2. **`libraries/libskill/policies/` → `libraries/libskill/src/policies/`.** The
   spec's non-conforming-root-subdirs table does not list `policies/`, but the
   inventory shows `libraries/libskill/policies/` exists and is exported via
   `./policies`. Under the general rule ("any further subdirectories under
   `src/` are free-form"), `policies/` moves into `src/` with the rest of
   libskill. This is consistent with the spec's intent but not explicit.

3. **`services/web` has no `proto/` directory.** All other services have
   `proto/`. Web is the odd one because it is an HTTP-only service. This remains
   the case after the move — `proto/` is optional per the allowed-list. No
   action required; flagged so the check in Part 01 does not trip.

4. **Root `generated/` directory stays at the monorepo root.** It is not a
   package. The spec's item "move generated code out of the package root" refers
   to generated code _inside a package_. The root `generated/` is outside any
   package and is the real codegen output target. What moves is the **symlinks**
   that point into it from `librpc` and `libtype`, not the root directory
   itself.

5. **Symlinks live under `src/generated/` inside each consumer.** After Part 02,
   `libraries/librpc/src/generated` and `libraries/libtype/src/generated` are
   symlinks to `../../../../generated`. The relative imports become
   `./generated/services/exports.js` (from `src/index.js`) which resolves
   through the symlink to the real generated output. This preserves the "no
   root-level source in libraries" rule while keeping the single generated
   output tree.

6. **Published subpath export keys are frozen.** The set of public keys (the
   left-hand side of the `exports` map) is identical before and after the move.
   Only right-hand side targets change. This makes success criterion #9
   mechanically verifiable: diff the sorted set of keys from every
   `package.json` pre-move against post-move and require zero diff.

7. **`just check` is actually `bun run check`.** The current root `justfile` has
   no `check` recipe — the spec references `just check` but the implementation
   target is `bun run check` in `package.json`. Part 01 adds `bun run layout` as
   a new script and wires it into `bun run check`
   (`"check": "bun run format && bun run lint && bun run layout"`). CI workflow
   `check-quality.yml` gets a new job that runs `bun run layout`.

8. **Single-commit atomicity is at merge, not commit.** The spec says the change
   should land in a single commit "during a quiet window." The plan produces one
   commit per part on the branch and relies on squash-merge at PR time for the
   atomic history entry. If the release-engineer prefers rebase-merge, Part 08
   can conclude with an interactive rebase to squash the eight part commits into
   one before the PR is marked ready.

## Risks

1. **Published subpath silent blast radius.** The `@forwardimpact/map` package
   ships 25 export keys (the `"."` root + 24 subpaths, including the
   `activity/*` set). libskill ships 13. libui ships 15. Across all packages
   there are ≈112 export keys total. Any missed key in the rewrite breaks
   downstream installations only when a consumer happens to import that subpath
   — not at build time. Mitigation: Part 08 runs a fresh-install smoke test in a
   clean directory that imports every published subpath key and asserts it
   resolves. The test is generated from the live `exports` map, so it
   self-updates when new keys land.

2. **Merge conflicts with in-flight branches.** Any open PR that edits files
   under `libraries/*` or `products/*` will conflict hard against this branch.
   Mitigation: coordinate a quiet window with product-manager and
   release-engineer before landing the final squash, and rebase other open
   branches immediately after.

3. **Codegen drift if Part 02 is interrupted.** If Part 02 commits the
   libstorage bucket-prefix change but not the symlink update, the next
   `just codegen` run writes to `src/generated/` while `librpc` still imports
   from the old symlink target. Mitigation: Part 02 is atomic — the libstorage
   change, the symlink update, the two import rewrites in `librpc`/`libtype`,
   and a `just codegen && bun run test` verification all land in one commit.

4. **Test relative imports missed by the initial rewrite.** Some tests import
   from `../../<dir>/file.js` instead of `../<file>.js` — easy to miss with a
   simple search-and-replace. Mitigation: the per-part verification step runs
   `bun run node --test test/*.test.js` at the package root, which surfaces any
   unresolved relative import immediately. Any missed import is fixed before
   moving to the next package.

5. **`libeval` already has `src/` AND a root `index.js`.** It is half-migrated.
   Part 07 finishes the job: the root `index.js` moves into `src/index.js` and
   the existing `src/commands/` tree is unchanged.

6. **`libskill/node_modules/` appears as a root subdir.** Bun installs workspace
   deps there; it is gitignored. The Part 01 layout check walks the working tree
   (`readdirSync`), not `git ls-files`, but explicitly skips `node_modules/` in
   its allow-list (see `IGNORED_SUBDIRS` in `scripts/check-package-layout.js`).
   Confirmed by `git check-ignore libraries/libskill/node_modules` — returns the
   path, so it is gitignored.

## References

- Spec: [spec.md](spec.md)
- Current `CLAUDE.md § Structure`: lines 143–175 — out of date (references
  `landmark/`, `summit/` which do not exist as packages).
- Codegen storage bucket (unchanged by this plan):
  `libraries/libstorage/index.js` lines 114–123 (`case "generated"`)
- Codegen symlink target (changed by Part 02):
  `libraries/libutil/finder.js#findGeneratedPath` line 115–118;
  `#createPackageSymlinks` line 156–166
- Service command paths: `config/config.example.json` lines 20, 24, 28, 32, 36,
  40, 44, 48, 52
- Subpath export inventory: 112 keys across 25 libraries + 2 products (map alone
  contributes 25 keys: 1 root `"."` + 24 subpaths)
- libharness call sites: ~23 test files across services and libraries

— Staff Engineer 🛠️
