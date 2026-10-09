# Changelog

All notable changes to `@forwardimpact/gemba` are recorded here.

## Unreleased

### gemba-xmr and gemba-wiki resolve their slice (breaking)

A read (`analyze`, `chart`, `list`, `summarize`) with no `--event-type` reads
the file's sole `event_type` value. When the file holds several values, or only
empty values, or when the named slice matches no row of a non-empty file, the
command exits 2 and lists the values present with their row counts. There is no
built-in default slice. `record` outside a workflow writes the reserved value
`interactive` instead of refusing the row. `validate` rejects a row whose field
count is outside 7 to 8. `gemba-wiki refresh` honours `event_type=<slice>` on an
XmR marker and renders every XmR failure as a notice inside the block, so a
board always shows the state of its sources. `gemba-wiki product-mix` takes
`--event-type` and fails when `record` fails. The `gemba-xmr` help examples name
a slice on every read and use a neutral workflow name. Two goldens cover the
ambiguous and the `*` read over a mixed file, and a real-bin replay test gates
every `gemba-xmr` golden case.

### New product: the Gemba agent-runtime platform (0.1.0)

Gemba packages the agent-runtime substrate as one product. The product holds
the command family and the CI actions a team uses to stand up and operate an
agent team. It consumes the runtime libraries. It exposes usage surfaces
only. It has no importable API.

- **CLI axis**: the six thin entry points move here from their libraries
  and take the product's names. They are `gemba-harness`, `gemba-trace`,
  `gemba-benchmark`, `gemba-selfedit` (from `@forwardimpact/libharness`),
  `gemba-wiki` (from `@forwardimpact/libwiki`), and `gemba-xmr` (from
  `@forwardimpact/libxmr`). The old `fit-*` names are removed. They are not
  aliased. This is a clean break.
- **Actions axis**: the composite actions that execute the runtime in CI
  live under `products/gemba/actions/`. They are `bootstrap`, `harness`,
  `wiki`, and `benchmark`. The published sibling repo names are
  unchanged.
- **APIs stay library-direct**: import `@forwardimpact/libharness`,
  `@forwardimpact/libwiki`, or `@forwardimpact/libxmr`. The product
  declares no `exports` and no `main`.
