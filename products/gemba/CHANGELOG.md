# Changelog

All notable changes to `@forwardimpact/gemba` are recorded here.

## Unreleased

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
