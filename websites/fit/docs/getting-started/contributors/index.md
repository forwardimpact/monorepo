---
title: "Getting Started: Contributors"
description: "Go from a fresh clone to a working development environment — with synthetic data, passing checks, and a clear picture of the project structure."
---

Set up the Forward Impact monorepo for development. This guide covers
installation, data generation, and running the quality checks.

> External users install products via npm (see
> [Engineering Leaders](/docs/getting-started/leaders/) or
> [Engineers](/docs/getting-started/engineers/)). This page is for contributors
> working on the monorepo itself.

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

The monorepo includes a synthetic data pipeline for testing and development:

```sh
just synthetic
```

This uses cached prose from `data/synthetic/prose-cache.json` and requires no
LLM access. It produces agent-aligned engineering standard definitions,
organizational documents, and activity data that the products consume during
development and testing.

Other generation modes:

```sh
just synthetic-update     # Regenerate prose via LLM and update the cache
```

## Run checks

Run formatting and linting, then unit tests, before committing:

```sh
bun run check
bun run test
```

`bun run check` runs `format`, `lint`, `jsdoc`, `invariants`, `context`, and
`wiki` sequentially so failures are easy to spot. `bun run test` runs unit tests
(`bun test`) separately so test output does not bury check failures.

To auto-fix formatting and lint issues:

```sh
bun run check:fix
```

## Understand the structure

```
products/       Products that turn the standard into tooling
libraries/      Shared libraries (libskill, libdoc, libbridge, etc.)
services/       gRPC microservices supervised by fit-rc
data/           Generated and standard data
config/         Service and tool configuration
specs/          Feature specifications and plans
websites/       Public site sources (websites/fit/, websites/kata/, …)
```

The products tree holds these
<!-- enum:products-tree:count -->
eight
<!-- /enum -->
products:

<!-- enum:products-tree:list -->

- gear
- guide
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
- tenancy
- trace
- vector

<!-- /enum -->

**Products** answer specific questions for specific users. Map defines what good
engineering looks like. Pathway renders agent-aligned engineering standards.
Outpost manages personal knowledge. Guide interprets artifacts. Summit models
team capability. Landmark surfaces engineering-system signals from Map's
activity layer. Kata orchestrates an autonomous agent team that ships and
improves itself. Gear is a meta-package that re-exports all service and library
CLIs as dependencies.

**Libraries** provide shared logic following OO+DI patterns — classes accept
dependencies through constructors, factory functions wire real implementations,
tests inject mocks directly.

**Services** are gRPC microservices supervised by `fit-rc`. Start them with
`bunx fit-rc start`.

## Development workflow

1. Create a branch from `main`
2. Make your changes
3. Run `bun run check` and `bun run test`
4. Run `just audit` (npm audit + gitleaks secret scanning)
5. Commit and push

Commit messages follow conventional format: `type(scope): subject`. Types
include `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, and `spec`. Scope is
the package name (e.g., `map`, `libskill`, `pathway`). Add `!` after scope for
breaking changes.

## What's next

<div class="grid">

<!-- part:card:../../internals/operations -->

</div>
