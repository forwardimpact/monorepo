# Plan A — Part 07: Libraries tier B (no subpath exports)

Migrate the remaining 18 libraries — those that publish only a default export
(or no explicit `exports` field) and therefore have no subpath targets to
rewrite. Lower blast radius than tier A.

## Libraries in tier B

| Library      |                                                                                        Root source files | Non-conforming root subdirs | Exports |
| ------------ | -------------------------------------------------------------------------------------------------------: | --------------------------- | ------: |
| libagent     |                                                                              hands.js, index.js, mind.js | processor/                  |       — |
| libcli       |                                               cli.js, color.js, format.js, help.js, index.js, summary.js | —                           |       — |
| libcodegen   |                                                 base.js, definitions.js, index.js, services.js, types.js | —                           |       — |
| libconfig    |                                                                                      config.js, index.js | —                           |       — |
| libeval      |                                                                            index.js (plus existing src/) | —                           |       — |
| libformat    |                                                                                                 index.js | —                           |       — |
| libindex     |                                                                           base.js, buffered.js, index.js | —                           |       — |
| libllm       |                                                                    hallucination.js, index.js, models.js | —                           |       — |
| libpolicy    |                                                                                                 index.js | —                           |       — |
| librc        |                                                                                     index.js, manager.js | —                           |       — |
| librepl      |                                                                                                 index.js | —                           |       — |
| libsecret    |                                                                                                 index.js | —                           |       — |
| libstorage   |                                                                   index.js, local.js, s3.js, supabase.js | —                           |       — |
| libsupervise |                                           index.js, logger.js, longrun.js, oneshot.js, state.js, tree.js | —                           |       — |
| libutil      | downloader.js, extractor.js, finder.js, http.js, index.js, processor.js, retry.js, tokenizer.js, wait.js | —                           |       — |
| libweb       |                                                                auth.js, cors.js, index.js, validation.js | —                           |       — |

(librpc and libtype handled in Part 02. libharness handled in Part 04.)

**Total: 16 libraries** (after excluding librpc, libtype, libharness which are
in earlier parts). Each gets a minimal `exports` field added when one does not
already exist — at a minimum `{ ".": "./src/index.js" }` — so the package root
is properly walled off.

## Approach

Apply the cross-cutting move recipe for each library. **The exact `package.json`
shape depends on whether the library publishes a `bin/` directory** — see the
two cases below.

### Case A: tier-B library with no `bin/`

Libraries: libcli, libconfig, libformat, libindex, libpolicy, librepl,
libsecret, libweb.

```jsonc
{
  "main": "./src/index.js",
  "exports": {
    ".": "./src/index.js"
  },
  "files": ["src/**/*.js", "README.md"]
}
```

### Case B: tier-B library with `bin/`

Libraries: libagent, libcodegen, libeval, libllm, librc, libstorage,
libsupervise, libutil.

The library's `bin/<entry>.js` files must remain resolvable via
`require.resolve("@forwardimpact/libfoo/bin/<entry>.js")`. An explicit `exports`
field that only maps `"."` locks down every other subpath and breaks those
resolvers. Therefore every tier-B library with a `bin/` directory gets every bin
entry mirrored into the exports map as a subpath key:

```jsonc
{
  "main": "./src/index.js",
  "bin": { /* unchanged */ },
  "exports": {
    ".": "./src/index.js",
    "./bin/<entry-1>.js": "./bin/<entry-1>.js",
    "./bin/<entry-2>.js": "./bin/<entry-2>.js"
  },
  "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
}
```

**Confirmed call site:** `libraries/librc/manager.js` line 12 runs
`require.resolve("@forwardimpact/libsupervise/bin/fit-svscan.js")`. A
monorepo-wide grep (`rg '@forwardimpact/\w+/bin/' --type js`) confirms this is
the **only** cross-package reference into a `bin/` directory today. libsupervise
therefore MUST keep `"./bin/fit-svscan.js": "./bin/fit-svscan.js"` in its
exports map and — as a symmetry choice — also maps `./bin/fit-logger.js`.

Every other tier-B library with a `bin/` gets the bin subpath keys added anyway.
This is zero-cost (no extra files) and future-proofs against new
`require.resolve` calls landing from librc-style service managers.

## Pre-move discovery

Before any tier-B library is migrated, run two separate greps:

**1. Static imports into tier-B libraries by subpath:**

```
rg '@forwardimpact/(libagent|libcli|libcodegen|libconfig|libeval|libformat|libindex|libllm|libpolicy|librc|librepl|libsecret|libstorage|libsupervise|libutil|libweb)/[^"'\''`]+' --type js -g '!libraries/*/src/**' -g '!libraries/*/test/**'
```

The `-g` excludes are important: a library's own internal relative imports don't
count as cross-package subpath access. Report every hit.

**2. `require.resolve` calls into any `@forwardimpact/*` package:**

```
rg 'require\.resolve\(["'\''`]@forwardimpact' --type js
```

These are trickier because they bypass static analysis. The known hit is
`librc/manager.js:12` into libsupervise's bin — documented above. Any new hit
needs the same treatment: add a subpath export key.

For each hit from either grep, decide:

- **Re-export from index.js** (preferred). Add the needed symbol to the
  library's `src/index.js`. Consumer's import specifier changes from
  `@forwardimpact/libfoo/bar` → `@forwardimpact/libfoo`.
- **Add a new subpath export**. Only if the symbol is large enough to warrant a
  separate entry point.

Document every decision inline in the commit message. The research phase
confirmed this sweep is expected to be quiet (only the librc/libsupervise
`require.resolve` hit is known).

## Per-library specifics

### libagent

3 root files + `processor/` subdir + `bin/fit-process-agents.js`. `processor/`
moves to `src/processor/`.

### libcli

6 root files, no subdirs. The file `cli.js` is the core `createCli()` factory —
make sure `src/cli.js` still re-exports correctly after moving.

### libcodegen

5 root files + `templates/` (allowed, stays) + `bin/fit-codegen.js` (stays).
**libcodegen has no `test/` directory** — skip the per-library test step for
libcodegen; the full-suite `bun run test` at repo root exercises it indirectly.
Note: libcodegen itself was NOT modified in Part 02 — Part 02 only edited
`libutil/finder.js`. libcodegen's `fit-codegen.js` CLI entry point stays at
`bin/fit-codegen.js` and its imports of `../base.js`, `../services.js`, etc.
need to be rewritten to `../src/base.js`, `../src/services.js`, etc. when the
root sources move.

### libconfig

2 root files, no subdirs. Unremarkable.

### libeval

**Already half-migrated.** Existing `src/commands/` tree stays. Root `index.js`
moves to `src/index.js`. The existing `src/` structure (`src/commands/run.js`,
`src/commands/supervise.js`, etc.) is unchanged. `bin/fit-eval.js` already
imports from `../src/...` in places; audit and complete the migration.

### libformat

1 root file. Unremarkable.

### libindex

3 root files, no subdirs. Unremarkable.

### libllm

3 root files + `bin/fit-completion.js`. Unremarkable.

### libpolicy

1 root file. Unremarkable.

### librc

2 root files + `bin/fit-rc.js`. **Careful:** `librc/manager.js` line 12 runs
`require.resolve("@forwardimpact/libsupervise/bin/fit-svscan.js")`. After Part
07 adds an explicit `exports` field to libsupervise, this resolve would break
unless libsupervise's exports map includes `"./bin/fit-svscan.js"`. Part 07's
"Case B" template handles this — see § libsupervise below. librc itself needs no
special handling beyond the standard case B (its own `bin/fit-rc.js` gets
mirrored into its own exports map).

### librepl

1 root file. Unremarkable.

### libsecret

1 root file. Stateless crypto (exempt from OO+DI); internal style preserved.

### libstorage

4 root files + `bin/fit-storage.js`. libstorage is not touched by Part 02 — the
`"generated"` bucket mapping in `libstorage/index.js` stays as is (monorepo-root
`generated/` is the load-bearing target for `Finder.findUpward`). Part 07 only
moves `index.js`, `local.js`, `s3.js`, `supabase.js` into `src/` and updates
`package.json`.

### libsupervise

6 root files + `bin/{fit-logger.js,fit-svscan.js}`. **Case B library with a
known cross-package `require.resolve` consumer.** The `package.json` exports map
MUST include both bin subpaths:

```jsonc
{
  "main": "./src/index.js",
  "bin": {
    "fit-logger": "./bin/fit-logger.js",
    "fit-svscan": "./bin/fit-svscan.js"
  },
  "exports": {
    ".": "./src/index.js",
    "./bin/fit-logger.js": "./bin/fit-logger.js",
    "./bin/fit-svscan.js": "./bin/fit-svscan.js"
  },
  "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
}
```

Without the `./bin/fit-svscan.js` subpath key, `require.resolve` from
`librc/manager.js:12` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`. This is a
**runtime breakage**, not a build-time one — the fit-rc CLI would fail the first
time it tries to start a supervised service. Add both bin subpaths regardless of
current consumer count.

### libutil

9 root files + `bin/{fit-download-bundle.js,fit-tiktoken.js}`. **Part 02 already
edited `libutil/finder.js`#findGeneratedPath** (line 117). After Part 07 moves
`finder.js` into `src/finder.js`, the edit travels with the file via `git mv`
and no re-edit is needed. The `bin/` entries stay and get mirrored into the
exports map per case B.

### libweb

4 root files, no subdirs. Unremarkable.

## Ordering

1. Run the pre-move discovery grep. Resolve every surprise consumer before
   touching any file.
2. Alphabetically, for each tier-B library: a. Move root sources into `src/`. b.
   Move any allowed non-conforming subdirs into `src/<name>/` (none in tier B
   except libagent's `processor/`). c. Add or update `main`, `exports`, `files`
   in `package.json`. d. Rewrite `bin/fit-<name>.js` imports (`../foo.js` →
   `../src/foo.js`). e. Rewrite `test/*.test.js` imports. f. Run
   `bun run node --test <pkg>/test/*.test.js`.
3. After all 16 libraries:
4. `bun run check`
5. `bun run test`
6. `bun run layout` — every library should be conformant (only the Part 08
   strict-mode enable remains).
7. Commit.

## Verification

- `git ls-files 'libraries/libagent/*.js' 'libraries/libcli/*.js' ... 'libraries/libweb/*.js'`
  returns nothing (no root sources across any tier-B library).
- Every tier-B library has `src/index.js`.
- Every tier-B library has an `exports` field with at least `"."` mapped to
  `./src/index.js`.
- `bun run layout` shows zero drift across `libraries/*`.
- `bun run test` passes.
- Success criterion #1 is mechanically satisfied:
  `git ls-files 'libraries/*/*.js' 'libraries/*/*.ts'` returns nothing.

## Risks

1. **Adding an explicit `exports` field can break deep imports and
   `require.resolve` calls that used to work.** Today libsupervise (and every
   other tier-B library) has no `exports` field, so Node resolves any subpath
   freely. Adding `{ ".": "./src/index.js" }` without the bin entries locks
   subpath access and breaks `librc/manager.js:12`'s
   `require.resolve("@forwardimpact/libsupervise/bin/fit-svscan.js")` with
   `ERR_PACKAGE_PATH_NOT_EXPORTED` — at runtime, not build time. This is a
   **load-bearing fit-rc path**: without it, services cannot start. Mitigation:
   every tier-B library with a `bin/` directory follows Case B (bin subpaths
   mirrored into the exports map) — see § Approach. Running the pre-move
   discovery grep is the second line of defence.

2. **`libcli` is used by 22 CLIs across the monorepo** (per the staff engineer's
   Apr 10 log). All use the default export. No subpath deep imports are known.
   Still, run the discovery grep for libcli specifically as a sanity check.

3. **`libeval` is half-migrated** — existing `src/commands/` tree means some
   tests may already use `../src/` imports while others use `../`. Audit both
   patterns. Finishing libeval means bringing all root source files into the
   existing `src/` tree.

4. **`libcodegen` has the `fit-codegen` CLI** — the staff engineer's Apr 10 log
   shows libcli migration already touched `fit-codegen.js`, which calls into the
   package's own root-level `services.js` and `types.js`. After Part 07 moves
   those into `src/`, the bin file imports need rewriting. Read
   `bin/fit-codegen.js` carefully before the move — it has several imports from
   the package root.

5. **`libstorage` and `libutil` were edited in Part 02.** The Part 02 edits are
   on files at the package root (`libstorage/index.js` and `libutil/finder.js`).
   When Part 07 moves those files into `src/`, the Part 02 edits come with them.
   No re-edit is needed, but verify the resulting `src/index.js` and
   `src/finder.js` still have the Part 02 changes. Diff against the main branch
   baseline if in doubt.

6. **Transitive missing dependencies.** The staff engineer's Apr 10 log notes:
   "libvector (fit-search imports libconfig, libllm, libstorage which are not in
   libvector's package.json) and libmemory (fit-window imports libconfig,
   librpc)". These are pre-existing issues, not introduced by this spec, and
   remain pre-existing after the migration. Do not fix them as part of Part 07 —
   that is scope creep. Note them in the commit message as "preserved
   pre-existing transitive issues".

## Deliverable commit

```
refactor(layout): migrate 16 libraries (tier B) into src/ (part 07/08)

Moves every tier-B library (no published subpath exports) into a src/
subtree. Adds an explicit { ".": "./src/index.js" } exports field to
every library that lacked one, closing the deep-import bypass.

Libraries: libagent, libcli, libcodegen, libconfig, libeval, libformat,
libindex, libllm, libpolicy, librc, librepl, libsecret, libstorage,
libsupervise, libutil, libweb.

librpc, libtype handled in part 02; libharness in part 04.

Pre-existing transitive dep issues in libvector (fit-search) and
libmemory (fit-window) are preserved — out of scope for 390.

Part 07 of 08 for spec 390.
```

— Staff Engineer 🛠️
