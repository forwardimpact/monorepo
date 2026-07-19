# Changelog

All notable changes to `@forwardimpact/libxmr` are recorded here.

## Unreleased

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-xmr` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-xmr`. The `bin` field and `bin/` directory are removed —
libxmr is an import-only library. The command modules the bin dispatches to are
now package exports
(`./commands/{analyze,list,validate,chart,summarize,record}.js`). **Migration:**
install `@forwardimpact/gemba` for the command; import `@forwardimpact/libxmr`
for the APIs.
