# Changelog

This file records all notable changes to `@forwardimpact/libwiki`.

## Unreleased

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-wiki` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-wiki`. This change removes the `bin` field and the `bin/`
directory. libwiki is an import-only library. The modules the bin needs are
now package exports (`./wiki-sync.js`, `./util/wiki-dir.js`,
`./cli-definition.js`). **Migration:** install `@forwardimpact/gemba` for
the command. Import `@forwardimpact/libwiki` for the APIs.
