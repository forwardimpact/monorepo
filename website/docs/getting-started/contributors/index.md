---
title: "Getting Started: Contributors"
description: "Clone the monorepo, generate synthetic data, run checks, and understand the project structure."
---

Set up the Forward Impact monorepo for development. This guide covers
installation, data generation, and running the quality checks.

> External users install products via npm (see [Leadership](/docs/getting-started/leadership/)
> or [Developers](/docs/getting-started/developers/)). This page is for
> contributors working on the monorepo itself.

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
LLM access. It produces framework definitions, organizational documents, and
activity data that the products consume during development and testing.

Other generation modes:

```sh
just synthetic-update     # Regenerate prose via LLM and update the cache
just synthetic-no-prose   # Structural data only, no prose content
```

## Run checks

Run the full quality suite before committing:

```sh
bun run check
```

This runs formatting (Prettier), linting (ESLint), unit tests (`node --test`),
and data validation (`fit-map validate`) in sequence.

To auto-fix formatting and lint issues:

```sh
bun run check:fix
```

## Understand the structure

```
products/       Six products (map, pathway, basecamp, guide, summit, landmark)
libraries/      Shared libraries (libskill, libui, libdoc, etc.)
services/       gRPC microservices (agent, graph, llm, memory, etc.)
data/           Generated and framework data
config/         Service and tool configuration
specs/          Feature specifications and plans
website/        Documentation website
```

**Products** answer specific questions for specific users. Map defines what good
engineering looks like. Pathway renders career frameworks. Basecamp manages
personal knowledge. Guide interprets artifacts. Summit models team capability.

**Libraries** provide shared logic following OO+DI patterns — classes accept
dependencies through constructors, factory functions wire real implementations,
tests inject mocks directly.

**Services** are gRPC microservices supervised by `fit-rc`. Start them with
`just rc-start`.

## Development workflow

1. Create a branch from `main`
2. Make your changes
3. Run `bun run check`
4. Run `just audit` (npm audit + gitleaks secret scanning)
5. Commit and push

Commit messages follow conventional format: `type(scope): subject`. Types
include `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, and `perf`.
Scope is the package name (e.g., `map`, `libskill`, `pathway`). Add `!` after
scope for breaking changes.

## Next steps

- [Architecture internals](/docs/internals/) — dependency chains, data flow,
  and design decisions
- [CONTRIBUTING.md](https://github.com/forwardimpact/monorepo/blob/main/CONTRIBUTING.md)
  — full contributing guide with PR checklist and release process
