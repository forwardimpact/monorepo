# Products

Conventions when working under `products/`. The catalog and jobs live in
[README.md](README.md); this file documents the metadata, rules, and
conventions a product must follow. Products are the eight end-user
applications (Map, Pathway, Guide, Landmark, Summit, Outpost, Gear, Gemba)
consumed via `npm install` and `npx` (`fit-<product>`, or `gemba-<name>` for
the platform's family). Gear is a meta-package
re-exporting the build-time service and library CLIs; Gemba is the
agent-runtime platform, owning the `gemba-*` command family
(`products/gemba/bin/gemba-<name>.js`) and the agent-run composite actions
(`products/gemba/actions/`) while the implementation stays in the runtime
libraries.

## Audience

External engineers, leaders, and agents with limited context and no access
to the monorepo. They reach a tool via `npx fit-<product>` or by loading
the matching skill — without ever cloning the repo.

Write `--help` output, skill instructions, and published guides for that
reader: self-contained, no insider tooling references, no relative paths
into `products/` or `websites/`, and every doc link a fully-qualified
public URL.

## Configuration

Products that need runtime config use `createProductConfig(name)`, which
merges constructor defaults → `config.json` `product.<name>` block →
`PRODUCT_{NAME}_*` env vars. See [`config/CLAUDE.md`](../config/CLAUDE.md)
for the file format and merge order, and
[`libraries/libconfig/CLAUDE.md`](../libraries/libconfig/CLAUDE.md) for the
factory.

## `package.json` metadata

Every product carries metadata the catalog generators consume.
`description` becomes the catalog row in [README.md](README.md). `jobs` are
Big Hire entries — with `forces` and `firedWhen` — generating
[JTBD.md](../JTBD.md) and the jobs block in README.md. See
`products/map/package.json` for a worked example. After editing,
regenerate: `bun run context:fix`.

`products/<name>/` metadata-only (e.g., Kata) — `"private": true`,
`description` + `jobs`, no `bin/` or CLI — is exempt from § Audience's
`npx fit-<product>` claim.

## Invocation context

Products with both a web UI and a CLI share handler logic through
`InvocationContext` — a frozen `{ data, args, options }` contract that
libui's `createBoundRouter` produces from the URL and libcli's `dispatch()`
produces from argv. Use `defineRoute` to bind a URL pattern to its CLI
command and graph entity in one descriptor. See the
[Every Surface guide](https://www.forwardimpact.team/docs/libraries/every-surface/index.md).

## CLIs and progressive documentation

Every product ships a CLI (a `bin/` entry in `package.json`). Three
artifacts must exist together so an external reader lands on the same docs
from any entry point:

- **User guides** under `websites/fit/docs/products/<task-slug>/index.md`.
  A product may carry multiple task guides (e.g. `fit-pathway` links to
  `authoring-standards`, `agent-teams`, `career-paths`).
- **Skill** at `.claude/skills/fit-<product>/SKILL.md` (Gemba's command
  family: `.claude/skills/gemba-<name>/SKILL.md`, whose guides live under
  `/docs/libraries/` with their implementing libraries).
- **CLI `--help`** — `documentation` entries on the libcli definition, one
  per linked guide.

### Linking rule

Skill `## Documentation` list and CLI `documentation` array carry the same
entries in the same order — same titles, same URLs:

```text
https://www.forwardimpact.team/docs/products/<task-slug>/index.md
```

Slugs are task-shaped (`authoring-standards`), not product-name-shaped —
one product may host multiple slugs and one slug may cut across multiple
products. The `.md` extension is deliberate — agents fetch markdown more
reliably than rendered HTML. Library-task guides (builder/agent audience)
live under `/docs/libraries/` instead — see
[libraries/CLAUDE.md](../libraries/CLAUDE.md). A product CLI may cross-link
to a library guide when the task cuts across both audiences.

## Workspace dependencies

Any `@forwardimpact/*` package imported by a file under `products/<name>/`
must appear in that product's `package.json` — in `dependencies`,
`devDependencies`, `peerDependencies`, or `optionalDependencies`.

The monorepo's workspace hoist masks missing declarations in `bun install`
and `bun test`; the gap only surfaces when a downstream consumer runs
`npx fit-<product>` against a clean machine. The
[`workspace-imports`](../.jidoka/invariants/workspace-imports.rules.mjs)
guard enforces the rule on every PR through `bun run invariants`.

## Adding a product

- `package.json` — `@forwardimpact/fit-<name>` with `description` and Big
  Hire `jobs`.
- `bin/fit-<name>.js` — CLI entry (`#!/usr/bin/env node`).
- `src/` — implementation. `test/` — `*.test.js` files.
- Add `product.<name>` block to `config/config.json` if runtime config is
  needed.
- Run `bun run context:fix` to regenerate the catalog, jobs tables, and
  JTBD.md.
