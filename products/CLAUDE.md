# Products

Follow these conventions under `products/`. The catalog and jobs live in
[README.md](README.md). This file documents the metadata, rules, and
conventions a product must follow. Products are the nine end-user
applications (Map, Pathway, Guide, Landmark, Summit, Outpost, Gear, Gemba,
Jidoka). Metadata-only Kata makes the catalog ten. Users consume the nine
through `npm install` and `npx` (`fit-<product>`, `gemba-<name>` for the
platform's family, or the scoped `@forwardimpact/jidoka`). Gear is a
meta-package that re-exports the build-time service and library CLIs. Gemba
is the agent-runtime platform. It owns the `gemba-*` command family
(`products/gemba/bin/gemba-<name>.js`) and the agent-run composite actions
(`products/gemba/actions/`), while the implementation stays in the runtime
libraries. Jidoka owns the `jidoka` check CLI and action. `libinvariant`
implements them.

## Audience

The audience is external engineers, leaders, and agents with limited context
and no access to the monorepo. They reach a tool through `npx fit-<product>`.
They also reach it when they load the matching skill. They never clone the
repo.

Write `--help` output, skill instructions, and published guides for that
reader. Keep each one self-contained. Do not reference insider tooling. Do
not use relative paths into `products/` or `websites/`. Make every doc link
a fully-qualified public URL on the product's own site (§ Linking rule).

## Configuration

Products that need runtime config use `createProductConfig(name)`. It merges
constructor defaults → `config.json` `product.<name>` block →
`PRODUCT_{NAME}_*` env vars. See [`config/CLAUDE.md`](../config/CLAUDE.md)
for the file format and merge order. See
[`libraries/libconfig/CLAUDE.md`](../libraries/libconfig/CLAUDE.md) for the
factory.

## `package.json` metadata

Every product carries metadata the catalog generators consume.
`description` becomes the catalog row in [README.md](README.md). `jobs` are
Big Hire entries with `forces` and `firedWhen`. They generate
[JTBD.md](../JTBD.md) and the jobs block in README.md. See
`products/map/package.json` for a worked example. After you edit, regenerate
with `bun run context:fix`.

A metadata-only `products/<name>/` (e.g., Kata) carries `"private": true`,
`description`, and `jobs`. It has no `bin/` and no CLI. It is exempt from
§ Audience's `npx fit-<product>` claim.

## Invocation context

Products with both a web UI and a CLI share handler logic through
`InvocationContext`. It is a frozen `{ data, args, options }` contract.
libui's `createBoundRouter` produces it from the URL. libcli's `dispatch()`
produces it from argv. Use `defineRoute` to bind a URL pattern to its CLI
command and graph entity in one descriptor. See the
[Every Surface guide](https://www.forwardimpact.team/docs/libraries/every-surface/index.md).

## CLIs and progressive documentation

Every product ships a CLI (a `bin/` entry in `package.json`). Three
artifacts must exist together. They give an external reader the same docs
from any entry point:

- **User guides** on the product's own site. FIT products publish at
  `websites/fit/docs/products/<task-slug>/index.md`. Gemba publishes at
  `websites/gemba/docs/<task-slug>/index.md`. A product may carry multiple
  task guides (e.g. `fit-pathway` links to `authoring-standards`,
  `agent-teams`, `career-paths`).
- **Skill** at `.claude/skills/fit-<product>/SKILL.md` (Gemba's command
  family: `.claude/skills/gemba-<name>/SKILL.md`).
- **CLI `--help`** — `documentation` entries on the libcli definition, one
  per linked guide.

### Linking rule

The skill `## Documentation` list and the CLI `documentation` array carry
the same entries, in the same order, with the same titles and URLs. Each
product family cites its own host:

```text
https://www.forwardimpact.team/docs/products/<task-slug>/index.md
https://www.gemba.team/docs/<task-slug>/index.md
```

`fit-*` products cite `www.forwardimpact.team`. The `gemba-*` family cites
`www.gemba.team`. Kata cites `www.kata.team`. Jidoka cites
`www.jidoka.team`.

Slugs are task-shaped (`authoring-standards`). Do not shape a slug after a
product name. One product may host multiple slugs. One slug may cut across
multiple products. The `.md` extension is deliberate. Agents fetch markdown
more reliably than rendered HTML. Library-task guides (builder/agent
audience) live under `www.forwardimpact.team/docs/libraries/` instead. See
[libraries/CLAUDE.md](../libraries/CLAUDE.md). A product CLI may cross-link
to a library guide when the task cuts across both audiences.

## Workspace dependencies

Any `@forwardimpact/*` package that a file under `products/<name>/` imports
must appear in that product's `package.json`. Declare it in `dependencies`,
`devDependencies`, `peerDependencies`, or `optionalDependencies`.

The monorepo's workspace hoist hides an absent declaration in `bun install`
and `bun test`. The gap only surfaces when a downstream consumer runs
`npx fit-<product>` against a clean machine. The
[`workspace-imports`](../.jidoka/invariants/workspace-imports.rules.mjs)
guard enforces the rule on every PR through `bun run invariants`.

## Add a product

- `package.json` — `@forwardimpact/fit-<name>` with `description` and Big
  Hire `jobs`.
- `bin/fit-<name>.js` — CLI entry (`#!/usr/bin/env node`).
- `src/` — implementation. `test/` — `*.test.js` files.
- Add `product.<name>` block to `config/config.json` if you need runtime
  config.
- Run `bun run context:fix` to regenerate the catalog, jobs tables, and
  JTBD.md.
