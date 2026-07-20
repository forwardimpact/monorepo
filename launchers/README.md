# Launchers

One thin npm package per **public CLI** — a CLI invoked as `npx fit-<name>`
or `npx gemba-<name>` in external docs, published skill packs, or published
composite actions, and backed by a real `bin` in a non-private workspace
package. Each launcher's npm name equals the invoked name (`gemba-harness`,
`gemba-wiki`, `fit-map`, …), so the documented `npx` contract resolves from
the registry
([originating spec](../specs/1670-public-cli-launcher-packages/spec.md)).

The one non-`fit-*` public CLI is `coaligned` (backed by
`@forwardimpact/libcoaligned`), invoked as `npx coaligned …` in the published
setup skills. The fit-only invocation scan cannot see it, so it is named in the
rule's `PUBLISHED_NON_FIT_CLIS` — the launcher stays computed, not
hand-maintained.

## Contract

- **npm name = invoked name.** The launcher's only content is a two-line
  `bin/<cli>.js` that imports the scoped source package's bin in-process —
  argv, signals, and exit codes pass through untouched.
- **Version stamped at publish.** Checked-in `version` and the dependency pin
  hold a `0.0.0` placeholder; `publish-npm.yml` stamps both with the source's
  `package.json` version, so launcher-version = source-version is true by
  construction and launchers publish atomically with their source.
- **Exact-pinned dependency.** Each launcher depends on exactly its scoped
  source at the stamped version — no ranges, no registry skew window.
- **Not a workspace.** `launchers/` is outside root `workspaces`; publish
  packs each dir by path. Nothing here is imported by repo code.

## Enforcement

`.coaligned/invariants/public-cli-set.rules.mjs` (auto-discovered by the root
`invariants` check) recomputes the public set from the rule — invoked names in
`websites/fit/docs` + published skills + sibling actions, intersected with
non-private workspace bins — and fails CI when `launchers/` drifts from it, a
launcher's bin file or `package.json` strays from the canonical shape, a
placeholder is overwritten, or a source package stops exporting the bin subpath
its launcher imports.
