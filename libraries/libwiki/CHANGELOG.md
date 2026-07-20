# Changelog

All notable changes to `@forwardimpact/libwiki` are recorded here.

## Unreleased

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-wiki` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-wiki`. The `bin` field and `bin/` directory are removed —
libwiki is an import-only library. The modules the bin needs are now
package exports (`./wiki-sync.js`, `./util/wiki-dir.js`,
`./cli-definition.js`). **Migration:** install `@forwardimpact/gemba` for
the command; import `@forwardimpact/libwiki` for the APIs.
