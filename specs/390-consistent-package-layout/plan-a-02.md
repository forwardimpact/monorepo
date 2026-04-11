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

All steps below land in a **single atomic commit**. Do not commit
intermediate states — an intermediate commit leaves the tree in a state
where codegen writes symlinks to paths whose `src/` parent may or may not
exist.

1. Read `libraries/libutil/finder.js` lines 108–167 to confirm the exact
   shape of `findGeneratedPath` and `createPackageSymlinks`.
2. Change `findGeneratedPath` line 117 from `"generated"` →
   `path.join("src", "generated")`.
3. Add the target-parent `mkdir -p` in `createSymlink` before the
   `fsAsync.symlink(...)` call on line 143.
4. Move `librpc` root sources to `src/` (7 files: auth.js, base.js,
   client.js, health.js, index.js, interceptor.js, server.js). Use
   `git mv` so history is preserved.
5. Move `libtype` root source to `src/` (1 file: index.js).
6. Remove both old symlinks explicitly:
   `rm libraries/librpc/generated libraries/libtype/generated`.
7. Update `librpc` and `libtype` `package.json` files (`main`, `files`).
8. Run `just codegen` — recreates symlinks at the new `src/generated`
   paths. Verify both symlinks now point at the monorepo-root
   `generated/` directory (still absolute). If `just codegen` fails at
   this point, **roll back the finder.js edit**, investigate, and do not
   proceed. Do not commit a partial state.
9. Run `bun run node --test libraries/librpc/test/*.test.js` and
   `bun run node --test libraries/libtype/test/*.test.js`.
10. Run `bun run check` and `bun run test` (full suite).
11. Run `npm pack --workspace=@forwardimpact/librpc --dry-run` and
    `npm pack --workspace=@forwardimpact/libtype --dry-run`. Confirm the
    tarball contents include `src/*.js` and do not include the
    `src/generated/` symlink. If either tarball's file list differs from
    the pre-move baseline in unexpected ways, investigate before
    committing.
12. Verify the monorepo-root `generated/` directory is unchanged (still
    contains `types/`, `services/`, `definitions/`, `proto/`,
    `bundle.tar.gz`, `package.json`).
13. Verify the new symlinks resolve:
    `ls libraries/librpc/src/generated/services/` and
    `ls libraries/libtype/src/generated/types/`.
14. Commit all changes as one atomic commit.

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

2. **Symlink path is absolute.** Verified on disk:
   `libraries/librpc/generated → /home/user/monorepo/generated` — an
   absolute path. `createSymlink()` passes `sourcePath` (the resolved
   `generatedPath` argument to `createPackageSymlinks`) straight through
   `fsAsync.symlink`. Absolute is fine inside a single working tree and
   survives `just codegen` runs. The migration preserves this convention —
   the target directory moves, the source target stays absolute.

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

5. **The published npm tarballs never contain the generated tree —
   confirmed, and this is fine.** `npm pack --workspace=@forwardimpact/librpc
   --dry-run` against `main` (version 0.1.88) produces a 13-file tarball
   containing `auth.js`, `base.js`, `bin/fit-unary.js`, `client.js`,
   `health.js`, `index.js`, `interceptor.js`, `package.json`, `server.js`,
   and four test files. The `generated/` symlink is silently dropped by
   `npm pack` (npm excludes dangling/absolute symlinks). No `files` field
   exists in `librpc` or `libtype` today, so npm uses its default include
   list.

   External consumers of `@forwardimpact/librpc` install the package and
   then run `npx fit-codegen --all` as documented in the distribution
   model (`CLAUDE.md § Distribution Model`). fit-codegen writes the
   generated tree into the consumer's own project root and creates
   symlinks at `node_modules/@forwardimpact/{librpc,libtype}/generated`
   pointing at the consumer's generated directory.

   **Post-move behaviour:** after Part 02 the tarball contents become
   `src/auth.js`, `src/base.js`, `src/client.js`, `src/health.js`,
   `src/index.js`, `src/interceptor.js`, `src/server.js`, plus
   `bin/fit-unary.js`, `package.json`, and `test/*.test.js`. The symlink
   is still silently dropped. When the consumer runs `npx fit-codegen`,
   the new `findGeneratedPath` creates the symlink at
   `node_modules/@forwardimpact/librpc/src/generated` — which requires
   `node_modules/@forwardimpact/librpc/src/` to exist, which it does
   because the published tarball contains `src/*.js` files. The `mkdir -p`
   guard added to `createSymlink()` in Part 02 ensures this works even
   on packages that end up without a `src/` directory in the tarball.

   **Contributor-local behaviour** (`just codegen` in the monorepo): the
   symlink is created at `libraries/librpc/src/generated` pointing at
   `/home/user/monorepo/generated` (absolute path). Running tests loads
   through the symlink and still works.

   Fresh-install smoke test (Part 08) must include at least one
   `librpc`/`libtype` import to catch any regression.

6. **Both `librpc` and `libtype` lack a `files` field.** This is the
   reason the smoke-tested pack works: npm defaults include everything
   not explicitly gitignored. Part 02 introduces a `files` field for
   cleanliness:
   ```jsonc
   "files": ["src/**/*.js", "bin/**/*.js", "README.md"]
   ```
   `src/generated/**` is **not** listed — the generated files are never
   checked into the tarball; they are regenerated client-side. If
   `npm pack --dry-run` post-Part-02 shows a different file set than the
   pre-move baseline (minus the moved paths), investigate before
   committing.

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
