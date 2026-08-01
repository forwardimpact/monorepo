# Launchers

`launchers/` holds one thin npm package for each **public CLI**. A public CLI
is one that external docs, published skill packs, or published composite
actions invoke as `npx fit-<name>` or `npx gemba-<name>`. A real `bin` in a
non-private workspace package backs it. Each launcher's npm name equals the
invoked name (`gemba-harness`, `gemba-wiki`, `fit-map`, …). So the documented
`npx` contract resolves from the registry
([originating spec](../specs/1670-public-cli-launcher-packages/spec.md)).

The family-scoped invocation scan cannot see a public CLI outside the
`fit-*`/`gemba-*` families. The rule's `PUBLISHED_NON_FIT_CLIS` list is the
escape hatch that names such a CLI. The name keeps that CLI's launcher
computed. No contributor maintains it by hand. The list is empty today.

## Contract

- **npm name = invoked name.** The launcher's only content is a two-line
  `bin/<cli>.js` that imports the scoped source package's bin in-process.
  Argv, signals, and exit codes pass through untouched.
- **Version stamped at publish.** The checked-in `version` and the dependency
  pin hold a `0.0.0` placeholder. `publish-npm.yml` stamps both with the
  source's `package.json` version. So launcher-version = source-version is true
  by construction. Launchers publish atomically with their source.
- **Exact-pinned dependency.** Each launcher depends on exactly its scoped
  source at the stamped version. The pin allows no ranges and no registry skew
  window.
- **Not a workspace.** `launchers/` is outside root `workspaces`. Publish packs
  each dir by path. No repo code imports anything here.

## Enforcement

The root `invariants` check auto-discovers
`.jidoka/invariants/public-cli-set.rules.mjs`. That module recomputes the public
set from the rule. The set is the invoked names in `websites/fit/docs`,
published skills, and sibling actions, intersected with non-private workspace
bins. The check fails CI when `launchers/` drifts from the set. It also fails
when a launcher's bin file or `package.json` strays from the canonical shape. It
fails when someone overwrites a placeholder. It fails when a source package
stops exporting the bin subpath its launcher imports.
