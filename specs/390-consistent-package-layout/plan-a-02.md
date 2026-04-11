# Plan A — Part 02: Codegen pipeline → `src/generated/`

Move the per-package codegen symlinks so that every package that consumes
generated code imports it via `src/generated/` instead of a root-level
`generated/`. The monorepo-root `generated/` directory — the real codegen
output target — is **unchanged**. Only the symlinks into it from `librpc`
and `libtype` move.

## Scope

- **libstorage is not touched.** The "generated" storage bucket continues
  to resolve to the monorepo-root `generated/` directory via
  `libstorage/index.js#_createLocalStorage` (lines 111–146, `switch (prefix)`
  at lines 114–123 maps `"generated"` → `"generated"`). This is correct and
  load-bearing: `Finder.findUpward` searches upward for the relative path
  literal, and the monorepo has exactly one `generated/` directory at the
  root. Changing this mapping would break the upward search.
- Update `libraries/libutil/finder.js#findGeneratedPath` so the per-package
  symlink targets `<packagePath>/src/generated` instead of
  `<packagePath>/generated`. This is a one-line change at line 117.
- Ensure `<packagePath>/src/` exists before the symlink is created — add a
  `mkdir -p` in `createPackageSymlinks` (or in `createSymlink` near line 128,
  wrapping the `targetPath`'s parent directory).
- Create `libraries/librpc/src/` and `libraries/libtype/src/` (the two
  packages that own the symlinks) and move every root-level source file into
  `src/` using the cross-cutting recipe in `plan-a.md`.
- The internal imports inside the moved files are **unchanged** because the
  symlink moves with the importing files:
  - `libraries/librpc/base.js` → `libraries/librpc/src/base.js`, import
    `./generated/definitions/exports.js` still resolves via the new
    symlink at `libraries/librpc/src/generated`.
  - `libraries/librpc/index.js` → `libraries/librpc/src/index.js`, import
    `./generated/services/exports.js` — same.
  - `libraries/libtype/index.js` → `libraries/libtype/src/index.js`, import
    `./generated/types/types.js` — same.
- Update `librpc` and `libtype` `package.json` fields (`main`, `files`) to
  point at `src/`.
- Re-run `just codegen` so the symlinks are recreated at their new targets.

## Rationale

`libraries/librpc/generated` and `libraries/libtype/generated` are
**symlinks** into the monorepo-root `generated/` directory. The symlinks are
created by `libutil/finder.js#createPackageSymlinks` (line 156), which
hardcodes the package list `["libtype", "librpc"]` and uses
`findGeneratedPath(projectRoot, packageName)` (line 115) to compute the
target: currently `join(packagePath, "generated")`.

Moving the **symlink target** — not the monorepo-root directory — into each
consumer's `src/` satisfies the "no generated/ at the package root" rule
while keeping the single codegen output tree at the monorepo root.

The internal imports that reach into `./generated/...` do **not** change
because they are relative to the importing file: when both the file and the
symlink move together into `src/`, `./generated/...` still resolves.

## Files modified

### libutil

- `libraries/libutil/finder.js` — single-line change at line 117 in
  `findGeneratedPath(projectRoot, packageName)`:
  ```js
  // Before:
  return path.join(packagePath, "generated");

  // After:
  return path.join(packagePath, "src", "generated");
  ```
  `createSymlink()` (lines 126–148) already removes any pre-existing target
  (symlink or directory) before creating the new one, so it cleans up the
  old `libraries/<pkg>/generated` location automatically the first time it
  runs against the new target path.

- Additionally, `createSymlink()` needs to ensure the target's **parent**
  directory exists. Today it does `mkdir -p` on the source, not the target.
  Add a `mkdir -p` for the target parent (`libraries/<pkg>/src/`) before
  the `fsAsync.symlink(sourcePath, targetPath)` call on line 143:
  ```js
  await fsAsync.mkdir(path.dirname(targetPath), { recursive: true });
  await fsAsync.symlink(sourcePath, targetPath, "dir");
  ```
  Without this, the first codegen run after the move fails with ENOENT
  because `libraries/librpc/src/` does not yet exist when the symlink is
  being created.

### Cleanup: remove pre-existing symlinks at old locations

`createSymlink()` removes pre-existing targets at the **new** location, but
it does not know about the **old** location. After the rewrite, the
previous symlinks at `libraries/librpc/generated` and
`libraries/libtype/generated` are still on disk (as lingering artifacts
from before the edit).

Delete them explicitly as part of Part 02:
```sh
rm libraries/librpc/generated
rm libraries/libtype/generated
```

Commit the removal in the same commit as the code change so the branch is
clean.

### librpc

Apply the cross-cutting move recipe from `plan-a.md`:

1. `mkdir -p libraries/librpc/src`
2. `git mv libraries/librpc/auth.js libraries/librpc/src/auth.js`
3. Same for `base.js`, `client.js`, `health.js`, `index.js`, `interceptor.js`,
   `server.js` (total 7 root `.js` files per the inventory).
4. Remove the existing dead symlink: `rm libraries/librpc/generated`.
5. Run `just codegen` — this recreates the symlink at
   `libraries/librpc/src/generated` pointing into the root `generated/`.
6. Update `libraries/librpc/package.json`:
   ```jsonc
   {
     "main": "./src/index.js",
     "bin": { "fit-unary": "./bin/fit-unary.js" },
     "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
   }
   ```
   No `exports` field is added — librpc does not currently publish subpath
   exports and this spec does not introduce new ones.
7. Confirm internal imports work unchanged — `./generated/services/exports.js`
   resolves because both files are now in `src/` and the symlink is at
   `src/generated`.
8. Run `bun run node --test libraries/librpc/test/*.test.js`.

### libtype

Same recipe, simpler because libtype has exactly one root source file:

1. `mkdir -p libraries/libtype/src`
2. `git mv libraries/libtype/index.js libraries/libtype/src/index.js`
3. `rm libraries/libtype/generated`.
4. `just codegen` — recreates `libraries/libtype/src/generated`.
5. Update `libraries/libtype/package.json`:
   ```jsonc
   {
     "main": "./src/index.js",
     "files": ["src/**/*.js", "README.md"]
   }
   ```
6. Internal import `./generated/types/types.js` still resolves through the
   new symlink.
7. Run `bun run node --test libraries/libtype/test/*.test.js`.

### Root generated/ — unchanged

The monorepo-root `generated/` directory is **not** moved. It is outside any
package and is the real codegen output target. Both `librpc/src/generated`
and `libtype/src/generated` symlink into it.

## Ordering

1. Read `libraries/libutil/finder.js` lines 108–167 to confirm the exact
   shape of `findGeneratedPath` and `createPackageSymlinks`.
2. Change `findGeneratedPath` line 117 from `"generated"` →
   `path.join("src", "generated")`.
3. Add the target-parent `mkdir -p` in `createSymlink` before the
   `fsAsync.symlink(...)` call on line 143.
4. Move `librpc` root sources to `src/` (7 files: auth.js, base.js,
   client.js, health.js, index.js, interceptor.js, server.js).
5. Move `libtype` root source to `src/` (1 file: index.js).
6. Remove both old symlinks explicitly:
   `rm libraries/librpc/generated libraries/libtype/generated`.
7. Run `just codegen` — recreates symlinks at the new `src/generated`
   paths. Verify both symlinks now point at the monorepo-root
   `generated/` directory.
8. Update `librpc` and `libtype` `package.json` files (`main`, `files`).
9. Verify internal imports still resolve — should be a no-op because the
   symlinks moved with the importing files.
10. Run `bun run check` and `bun run test`.
11. Verify the monorepo-root `generated/` directory is unchanged (still
    contains `types/`, `services/`, `definitions/`, `proto/`,
    `bundle.tar.gz`, `package.json`).
12. Verify the symlinks resolve: `ls libraries/librpc/src/generated/services/`
    should list the service subdirs;
    `ls libraries/libtype/src/generated/types/` should list `types.js`.
13. Commit.

## Verification

- `just codegen` succeeds and writes the same output as before.
- `libraries/librpc/src/generated` is a symlink to the root `generated/`.
- `libraries/libtype/src/generated` is a symlink to the root `generated/`.
- `bun run node --test libraries/librpc/test/*.test.js` passes.
- `bun run node --test libraries/libtype/test/*.test.js` passes.
- Every service under `services/*` still imports from `@forwardimpact/librpc`
  successfully — `bun run test` at repo root passes.
- No root-level `.js` files remain in `libraries/librpc/` or
  `libraries/libtype/`.
- `bun run layout` (permissive) no longer lists `librpc/generated` or
  `libtype/generated` as drift (the symlinks are now under `src/`).

## Risks

1. **`just codegen` is destructive if the root `generated/` is cleaned
   first.** Do not run `just data-reset` before this part — it will delete
   the root `generated/` directory, and then codegen must regenerate it.
   Codegen is idempotent but takes ~1 minute to run.

2. **Symlink path is relative vs absolute.** The current implementation of
   `createPackageSymlinks` uses either relative or absolute symlink targets.
   Read the code to find out which before editing. A relative symlink must
   reference `../../../generated` (from `libraries/librpc/src/generated`);
   an absolute symlink references the full monorepo root. Preserve whichever
   convention is currently in use.

3. **Stale symlinks left behind.** If the old `libraries/librpc/generated`
   and `libraries/libtype/generated` symlinks are not removed before
   recreating them, `git status` will show them as tracked files pointing at
   stale targets. Delete them explicitly in step 7 above.

4. **The `Finder.findUpward` search in libstorage is load-bearing.** The
   `"generated"` storage bucket maps through a switch case at
   `libstorage/index.js` line 116 that sets `relative = "generated"`.
   `Finder.findUpward(cwd, "generated")` then searches upward for a
   directory ending in `generated/`, finding the monorepo root's
   `generated/`. **Do not change this case.** Changing it to `src/generated`
   would break the upward search because there is no monorepo-root
   `src/generated` — the `src/` directories only exist inside packages.

5. **`files` field in `package.json` for librpc and libtype.** Symlinks are
   not typically published in npm tarballs — `npm pack` may either follow
   them (including the target files) or skip them (leaving the consumer's
   install broken). Today this works because the symlink target is
   co-located inside the same package tree once codegen runs.

   Check with `npm pack --dry-run` in `librpc` and `libtype` post-move.
   The `files` field should include:
   ```jsonc
   "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
   ```

   If `npm pack` does not include the generated tree, either:
   - List `src/generated/**` explicitly in `files` (may not follow the
     symlink either), OR
   - Run codegen during publish and inline the generated files as real
     files before publishing (requires a prepublish step — out of scope
     for this spec).

   The fresh-install smoke test in Part 08 catches this at the end of the
   migration. If it fails, escalate and add a targeted fix.

## Deliverable commit

```
refactor(layout): move codegen symlinks under src/ (part 02/08)

Updates findGeneratedPath in libutil/finder.js so fit-codegen creates
per-package symlinks at libraries/<pkg>/src/generated pointing at the
(unchanged) monorepo-root generated/ directory. libstorage's bucket
resolution is untouched — the monorepo-root generated/ directory is
still the single codegen output target.

Moves librpc (7 files) and libtype (1 file) root sources into src/.
Both packages' internal ./generated/... imports resolve unchanged
because the symlinks move with the importing files.

Part 02 of 08 for spec 390.
```

— Staff Engineer 🛠️
