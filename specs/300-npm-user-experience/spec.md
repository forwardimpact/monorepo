# Spec 300: npm User Experience

## Problem Statement

External users installing `@forwardimpact/guide` from npm have a poor first-time
experience. Multiple user testing sessions have surfaced consistent friction
points.

### Prior Art

Spec 240 (guide-npm-package, done) published `@forwardimpact/guide` to npm and
added early `--help`/`--version` handling in `bin/fit-guide.js`. Spec 230
(pathway-init-npm, done) fixed `fit-pathway init` for npm installs. This spec
addresses the problems that remain despite those efforts.

### Evidence

Issues #179, #180, #181, #182, #183 all originated from first-time user
evaluation testing. The patterns are consistent:

1. **`--help` and `--version` fail despite spec 240's fix** (#180) — Spec 240
   placed `--help`/`--version` checks before the service imports in source order
   (`bin/fit-guide.js:17-44`). However, the service imports on lines 66-72 are
   static `import` declarations. In ES modules, all static imports are resolved
   during module loading before any code executes — `process.exit(0)` on line 34
   never runs because the import of `@forwardimpact/librpc` fails first. The fix
   is to convert lines 66-72 from static `import` to dynamic `await import()`
   inside the `try` block at line 101.

2. **librpc requires generated code that isn't in the package** (#178, fix
   PR #184) — `librpc/index.js:7` imports `./generated/services/exports.js`,
   which is produced by `just codegen` (libcodegen). The root `.gitignore`
   correctly excludes `generated/` and `**/generated` — generated code is
   installation-specific and should not be committed or bundled in npm tarballs.
   The fix is not to include `generated/` in the package, but to document that
   external users must run `npx fit-codegen --all` after installing. The
   getting-started docs and root README must include this step.

3. **Conflicting package manager guidance** (#183) — The Guide README
   (`products/guide/README.md:18`) says `bun install @forwardimpact/guide`. The
   getting-started docs (`website/docs/getting-started/engineers/index.md:86`)
   say `npm install @forwardimpact/guide`. The CLI shebang is
   `#!/usr/bin/env node`. The `engines` field in all 46 `package.json` files
   across the monorepo specifies only `"bun": ">=1.2.0"` with no `node` entry.
   The established policy (CLAUDE.md) is clear: bun for development, node for
   distribution. The `engines` fields and README don't reflect this policy.

   The Guide README itself is the deeper problem. It is the only per-package
   README in the monorepo — no other product or library ships one. It duplicates
   content from the getting-started guide and product page, creating a third
   location that drifts out of sync. Committing to per-package READMEs would
   require maintaining one for every product and library. The fix is to delete it,
   update the root `README.md` Quick Start to serve external users (covering
   Pathway and Guide), and remove `README.md` from Guide's `files` field in
   `package.json`.

4. **No smoke test for npm packages** (#182) — `publish-npm.yml` runs monorepo
   tests (`bun run test`) but never validates the published tarball in isolation.
   The librpc `generated/` omission reached npm because nothing tested
   `npm pack && npm install <tarball>` outside the workspace.

5. **npm vs monorepo install path unclear** (#181) — The root README Quick
   Start only shows the monorepo contributor path (`git clone`, `just quickstart`).
   External users arriving via npm have no quick start in the root README. The
   monorepo clone path belongs in CONTRIBUTING.md (where it already exists). The
   root Quick Start should be rewritten for external users.

### User Impact

- **Time to first value**: Currently >30 minutes (should be <5 minutes for
  `--help`, with clear next steps for full setup)
- **Abandonment risk**: High — `npx fit-guide --help` crashes before showing any
  value
- **Support burden**: Issues describe the same friction repeatedly

## Scope

This spec covers the Guide product's npm user experience. Similar patterns may
exist in other products but those are out of scope except for the `engines` field
fix, which applies to all 46 `package.json` files as a consistency correction.

### In Scope

- Convert static service imports to dynamic imports in `bin/fit-guide.js`
- Document `npx fit-codegen --all` as a required post-install step
- Add `"node": ">=18.0.0"` to `engines` in all 46 `package.json` files
- Delete `products/guide/README.md` and remove it from Guide's `files` field
- Remove "Product READMEs" row from CLAUDE.md § Documentation Map
- Rewrite root `README.md` Quick Start for external users (Pathway + Guide)
- Add a smoke test step to `publish-npm.yml`

### Out of Scope

- Service stack deployment automation (separate effort)
- Pathway/Map npm experience beyond the `engines` field fix
- New features — this is about fixing the existing installation path
- Per-package READMEs for other products or libraries

## Success Criteria

1. **`npx fit-guide --help` works**: Prints help text and exits 0 without any
   service stack running or `SERVICE_SECRET` set, when installed from the npm
   registry.

2. **`npx fit-guide --version` works**: Prints version and exits 0 under the
   same conditions.

3. **Post-install codegen documented**: The root README and getting-started
   docs include `npx fit-codegen --all` as a required step after
   `npm install`. The generated code is installation-specific and is never
   committed or bundled in npm tarballs.

4. **Consistent `engines` field**: Every `package.json` in the monorepo declares
   both `"bun": ">=1.2.0"` and `"node": ">=18.0.0"` in `engines`.

5. **No per-package README**: `products/guide/README.md` is deleted. No product
   or library ships a per-package README — the root README and getting-started
   docs are the authoritative locations. The "Product READMEs" row in CLAUDE.md
   § Documentation Map is removed.

6. **Root README serves external users**: The Quick Start section of `README.md`
   covers the npm install path (Pathway + Guide). The monorepo development path
   is in CONTRIBUTING.md.

7. **CI smoke test**: `publish-npm.yml` includes a step that runs `npm pack`,
   installs the tarball in an isolated directory, and verifies the CLI entry
   point loads without error.

## Non-Goals

- Making Guide work without the service stack (that's the product architecture)
- Docker/container-based deployment (future enhancement)
- Windows support (currently untested, out of scope)

## References

- Issue #178: Critical: @forwardimpact/librpc npm package missing generated/
  directory (fix PR #184)
- Issue #179: Documentation: Installation instructions unclear and scattered
- Issue #180: Enhancement: --help and --version should work without service
  dependencies
- Issue #181: Documentation: Clarify npm vs workspace install paths
- Issue #182: Testing: Add npm package smoke tests to CI/CD
- Issue #183: Documentation: Clarify package manager support (npm vs bun)
- Spec 230: pathway-init-npm (done — Pathway npm install fix)
- Spec 240: guide-npm-package (done — Guide npm publishing, early flag handling)
