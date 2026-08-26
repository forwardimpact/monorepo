---
title: "Getting Started: Contributors"
description: "Go from a fresh clone to a development environment that works, with synthetic data, checks that pass, and a clear picture of the project structure."
---

Set up the Forward Impact monorepo for development. This guide covers
installation, data generation, and the quality checks.

> External users install products with npm (see
> [Engineering Leaders](/docs/getting-started/leaders/) or
> [Engineers](/docs/getting-started/engineers/)). This page is for contributors
> who work on the monorepo itself.

## Prerequisites

- [Bun](https://bun.sh) 1.2+
- [just](https://github.com/casey/just) (command runner)

## Clone and install

```sh
git clone https://github.com/forwardimpact/monorepo.git
cd monorepo
bun install
just quickstart
```

The `quickstart` target bootstraps environment files, generates data, runs
codegen, and processes resources.

## Generate synthetic data

The monorepo includes a synthetic data pipeline for tests and development:

```sh
just synthetic
```

This uses cached prose from `data/synthetic/prose-cache.json` and requires no
LLM access. It produces definitions for the agent-aligned engineering standard,
organizational documents, and activity data. The products consume that data
during development and tests.

Other generation modes:

```sh
just synthetic-update     # Regenerate prose via LLM and update the cache
```

## Run checks

Run the format and lint checks, then the unit tests, before you commit:

```sh
bun run check
bun run test
```

`bun run check` runs `format`, `lint`, `jsdoc`, `invariants`, and `context`
sequentially so you can spot failures easily. `bun run test` runs unit tests
(`bun test`) separately so test output does not bury check failures.

To fix format and lint issues automatically:

```sh
bun run check:fix
```

## Understand the structure

```text
products/       Products that turn the standard into tooling
libraries/      Shared libraries (libskill, libdoc, libbridge, etc.)
services/       gRPC microservices supervised by fit-rc
data/           Generated and standard data
config/         Service and tool configuration
specs/          Feature specifications and plans
websites/       Site sources: fit, gemba, kata, jidoka, monorepo
```

The products tree holds these
<!-- enum:products-tree:count -->
ten
<!-- /enum -->
products:

<!-- enum:products-tree:list -->

- gear
- gemba
- guide
- jidoka
- kata
- landmark
- map
- outpost
- pathway
- summit

<!-- /enum -->

The services tree holds these gRPC microservices:

<!-- enum:services-tree:list -->

- bridge
- embedding
- ghbridge
- ghserver
- ghuser
- graph
- map
- mcp
- msbridge
- oauth
- oidc
- pathway
- span
- tenancy
- vector

<!-- /enum -->

**Products** answer specific questions for specific users. Map defines what good
engineering looks like. Pathway renders agent-aligned engineering standards.
Outpost manages personal knowledge. Guide interprets artifacts. Summit models
team capability. Landmark surfaces engineering-system signals from Map's
activity layer. Gear is a meta-package that re-exports all service and library
CLIs as dependencies. Kata, Gemba, and Jidoka are repository neighbours that
publish their own sites at [kata.team](https://www.kata.team/),
[gemba.team](https://www.gemba.team/), and
[jidoka.team](https://www.jidoka.team/).

**Libraries** provide shared logic that follows OO+DI patterns. Classes accept
dependencies through constructors. Factory functions wire real implementations.
Tests inject mocks directly.

**Services** are gRPC microservices that `fit-rc` supervises. Start them with
`bunx fit-rc start`.

## Development workflow

1. Create a branch from `main`
2. Make your changes
3. Run `bun run check` and `bun run test`
4. Run `just audit` (npm audit and a gitleaks secret scan)
5. Commit and push

Commit messages follow conventional format: `type(scope): subject`. Types
include `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, and `spec`. Scope is
the package name (e.g., `map`, `libskill`, `pathway`). Add `!` after scope for
breaking changes.

## What's next

<div class="grid">

<!-- part:card:../../internals/operations -->

</div>
