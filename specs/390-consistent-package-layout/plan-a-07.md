# Plan A — Part 07: Libraries tier B (no subpath exports)

Migrate the remaining 18 libraries — those that publish only a default
export (or no explicit `exports` field) and therefore have no subpath
targets to rewrite. Lower blast radius than tier A.

## Libraries in tier B

| Library | Root source files | Non-conforming root subdirs | Exports |
| --- | ---:| --- | ---:|
| libagent | hands.js, index.js, mind.js | processor/ | — |
| libcli | cli.js, color.js, format.js, help.js, index.js, summary.js | — | — |
| libcodegen | base.js, definitions.js, index.js, services.js, types.js | — | — |
| libconfig | config.js, index.js | — | — |
| libeval | index.js (plus existing src/) | — | — |
| libformat | index.js | — | — |
| libindex | base.js, buffered.js, index.js | — | — |
| libllm | hallucination.js, index.js, models.js | — | — |
| libpolicy | index.js | — | — |
| librc | index.js, manager.js | — | — |
| librepl | index.js | — | — |
| libsecret | index.js | — | — |
| libstorage | index.js, local.js, s3.js, supabase.js | — | — |
| libsupervise | index.js, logger.js, longrun.js, oneshot.js, state.js, tree.js | — | — |
| libutil | downloader.js, extractor.js, finder.js, http.js, index.js, processor.js, retry.js, tokenizer.js, wait.js | — | — |
| libweb | auth.js, cors.js, index.js, validation.js | — | — |

(librpc and libtype handled in Part 02. libharness handled in Part 04.)

**Total: 16 libraries** (after excluding librpc, libtype, libharness which
are in earlier parts). Each gets a minimal `exports` field added when one
does not already exist — at a minimum `{ ".": "./src/index.js" }` — so the
package root is properly walled off.

## Approach

Apply the cross-cutting move recipe for each library. Because there are no
subpath exports, the `package.json` edit is minimal:

```jsonc
{
  "main": "./src/index.js",
  "bin": { /* unchanged */ },
  "exports": {
    ".": "./src/index.js"
  },
  "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
}
```

**Key decision — add an `exports` field even where none exists today.** A
bare `main` field without an `exports` field means Node resolves any
subpath freely by falling back to on-disk file lookup, which means
consumers could bypass the contract. The spec's rules (especially rule 1:
"no source at the root") are weakened if subpath bypass is allowed.
Therefore every tier-B library gets an explicit `exports` field that maps
only `"."`. Subsequent subpath access throws, catching any accidental deep
import at runtime.

**Exception:** if an existing consumer already depends on a tier-B
library's deep import, the import must be rewritten to either use the
library's default export (if the needed symbol is exported from
`index.js`) or a new subpath key must be added. Part 07 runs a discovery
grep before the rewrite to find such consumers.

## Pre-move discovery

Before any tier-B library is migrated, run:

```
rg '@forwardimpact/(libagent|libcli|libcodegen|libconfig|libeval|libformat|libindex|libllm|libpolicy|librc|librepl|libsecret|libstorage|libsupervise|libutil|libweb)/[^"'\'']+' --type js
```

Report every hit. Each hit is a call site that reaches into the library by
subpath without being listed in the current exports map. For each hit,
decide:

- **Re-export from index.js.** Preferred — add the needed symbol to the
  library's `src/index.js`. Consumer's import specifier changes from
  `@forwardimpact/libfoo/bar` → `@forwardimpact/libfoo`.
- **Add a new subpath export.** Only if the symbol is large enough to
  warrant a separate entry point. Add `"./bar": "./src/bar.js"` to the
  library's exports and leave the consumer alone.

Document every decision inline in the commit message. The research phase
already flagged four cross-package references (all in comments or
`require.resolve` calls using package names, not subpaths) so this sweep
is expected to be quiet.

## Per-library specifics

### libagent

3 root files + `processor/` subdir + `bin/fit-process-agents.js`.
`processor/` moves to `src/processor/`.

### libcli

6 root files, no subdirs. The file `cli.js` is the core `createCli()`
factory — make sure `src/cli.js` still re-exports correctly after moving.

### libcodegen

5 root files + `templates/` (allowed, stays) + `bin/fit-codegen.js`
(stays). Note: libcodegen itself was modified in Part 02; verify that
Part 02's changes to `fit-codegen.js` still work after the root sources
move to `src/`. The edits in Part 02 modified `bin/fit-codegen.js` which
stays at `bin/`, so its imports of `../base.js`, `../services.js`, etc.
need to be updated to `../src/base.js`, `../src/services.js`, etc.

### libconfig

2 root files, no subdirs. Unremarkable.

### libeval

**Already half-migrated.** Existing `src/commands/` tree stays. Root
`index.js` moves to `src/index.js`. The existing `src/` structure
(`src/commands/run.js`, `src/commands/supervise.js`, etc.) is unchanged.
`bin/fit-eval.js` already imports from `../src/...` in places; audit and
complete the migration.

### libformat

1 root file. Unremarkable.

### libindex

3 root files, no subdirs. Unremarkable.

### libllm

3 root files + `bin/fit-completion.js`. Unremarkable.

### libpolicy

1 root file. Unremarkable.

### librc

2 root files + `bin/fit-rc.js`. **Careful:** `librc/manager.js` currently
includes `require.resolve("@forwardimpact/libsupervise/bin/fit-svscan.js")`
— this resolves through the libsupervise package and is unaffected by the
move (bin/ stays at the libsupervise root).

### librepl

1 root file. Unremarkable.

### libsecret

1 root file. Stateless crypto (exempt from OO+DI); internal style
preserved.

### libstorage

4 root files + `bin/fit-storage.js`. libstorage is not touched by Part 02
— the `"generated"` bucket mapping in `libstorage/index.js` stays as is
(monorepo-root `generated/` is the load-bearing target for
`Finder.findUpward`). Part 07 only moves `index.js`, `local.js`, `s3.js`,
`supabase.js` into `src/` and updates `package.json`.

### libsupervise

6 root files + `bin/{fit-logger.js,fit-svscan.js}`. `require.resolve`
from librc (above) keeps working because `bin/` stays at the root.

### libutil

9 root files + `bin/{fit-download-bundle.js,fit-tiktoken.js}`. **Part 02
already edited `libutil/finder.js`** to change `createPackageSymlinks()`.
After Part 07 moves `finder.js` into `src/finder.js`, the edit travels
with it. The `bin/` entries stay.

### libweb

4 root files, no subdirs. Unremarkable.

## Ordering

1. Run the pre-move discovery grep. Resolve every surprise consumer
   before touching any file.
2. Alphabetically, for each tier-B library:
   a. Move root sources into `src/`.
   b. Move any allowed non-conforming subdirs into `src/<name>/` (none in
      tier B except libagent's `processor/`).
   c. Add or update `main`, `exports`, `files` in `package.json`.
   d. Rewrite `bin/fit-<name>.js` imports (`../foo.js` → `../src/foo.js`).
   e. Rewrite `test/*.test.js` imports.
   f. Run `bun run node --test <pkg>/test/*.test.js`.
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
- Every tier-B library has an `exports` field with at least `"."` mapped
  to `./src/index.js`.
- `bun run layout` shows zero drift across `libraries/*`.
- `bun run test` passes.
- Success criterion #1 is mechanically satisfied:
  `git ls-files 'libraries/*/*.js' 'libraries/*/*.ts'` returns nothing.

## Risks

1. **Adding an explicit `exports` field can break deep imports that used
   to work.** The pre-move discovery grep catches these. If a consumer is
   found that depends on a deep import, either:
   - Add a new subpath key to the library's exports (preferred when the
     internal file is a coherent module boundary), or
   - Rewrite the consumer to import the symbol from the library's default
     export (preferred when the deep path was incidental).
   Do not leave the deep import broken.

2. **`libcli` is used by 22 CLIs across the monorepo** (per the staff
   engineer's Apr 10 log). All use the default export. No subpath deep
   imports are known. Still, run the discovery grep for libcli
   specifically as a sanity check.

3. **`libeval` is half-migrated** — existing `src/commands/` tree means
   some tests may already use `../src/` imports while others use `../`.
   Audit both patterns. Finishing libeval means bringing all root source
   files into the existing `src/` tree.

4. **`libcodegen` has the `fit-codegen` CLI** — the staff engineer's Apr
   10 log shows libcli migration already touched `fit-codegen.js`, which
   calls into the package's own root-level `services.js` and `types.js`.
   After Part 07 moves those into `src/`, the bin file imports need
   rewriting. Read `bin/fit-codegen.js` carefully before the move — it has
   several imports from the package root.

5. **`libstorage` and `libutil` were edited in Part 02.** The Part 02
   edits are on files at the package root (`libstorage/index.js` and
   `libutil/finder.js`). When Part 07 moves those files into `src/`, the
   Part 02 edits come with them. No re-edit is needed, but verify the
   resulting `src/index.js` and `src/finder.js` still have the Part 02
   changes. Diff against the main branch baseline if in doubt.

6. **Transitive missing dependencies.** The staff engineer's Apr 10 log
   notes: "libvector (fit-search imports libconfig, libllm, libstorage
   which are not in libvector's package.json) and libmemory (fit-window
   imports libconfig, librpc)". These are pre-existing issues, not
   introduced by this spec, and remain pre-existing after the migration.
   Do not fix them as part of Part 07 — that is scope creep. Note them in
   the commit message as "preserved pre-existing transitive issues".

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
