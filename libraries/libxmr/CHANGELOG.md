# Changelog

This file records all notable changes to `@forwardimpact/libxmr`.

## Unreleased

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-xmr` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-xmr`. This change removes the `bin` field and the `bin/`
directory. libxmr is an import-only library. The command modules the bin
dispatches to are now package exports
(`./commands/{analyze,list,validate,chart,summarize,record}.js`). **Migration:**
install `@forwardimpact/gemba` for the command. Import `@forwardimpact/libxmr`
for the APIs.
