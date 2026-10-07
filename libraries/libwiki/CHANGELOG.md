# Changelog

This file records all notable changes to `@forwardimpact/libwiki`.

## Unreleased

### `audit` reports what it checked

The text output ends with a `checked:` line that lists one subject count per
rule scope, and the JSON output carries the same counts under `checked`. A
run that checked no rows no longer reads like a run that checked every row
and found no problem.

### Bin moved to `@forwardimpact/gemba` (breaking)

The `fit-wiki` CLI entry point moved to the `@forwardimpact/gemba` product
package as `gemba-wiki`. This change removes the `bin` field and the `bin/`
directory. libwiki is an import-only library. The modules the bin needs are
now package exports (`./wiki-sync.js`, `./util/wiki-dir.js`,
`./cli-definition.js`). **Migration:** install `@forwardimpact/gemba` for
the command. Import `@forwardimpact/libwiki` for the APIs.

### `push --paths` refuses a pathspec that matches nothing

A declared pathspec that matches no tracked path and no pending change exits
with a usage error before any commit. A pathspec-scoped status read such a
path as clean, so the push could report success over an empty write-set.
