# Changelog

All notable changes to `@forwardimpact/gemba` are recorded here.

## Unreleased

### New product: the Gemba agent-runtime platform (0.1.0)

Gemba packages the agent-runtime substrate as one product: the command
family and the CI actions a team uses to stand up and operate an agent
team. It consumes the runtime libraries and exposes usage surfaces only —
no importable API.

- **CLI axis**: the six thin entry points move here from their libraries
  and take the product's names — `gemba-harness`, `gemba-trace`,
  `gemba-benchmark`, `gemba-selfedit` (from `@forwardimpact/libharness`),
  `gemba-wiki` (from `@forwardimpact/libwiki`), and `gemba-xmr` (from
  `@forwardimpact/libxmr`). The old `fit-*` names are removed, not
  aliased — a clean break.
- **Actions axis**: the composite actions that execute the runtime in CI —
  `bootstrap`, `harness`, `wiki`, `benchmark` — live under
  `products/gemba/actions/`. The published sibling repo names are
  unchanged.
- **APIs stay library-direct**: import `@forwardimpact/libharness`,
  `@forwardimpact/libwiki`, or `@forwardimpact/libxmr`; the product
  declares no `exports` and no `main`.
