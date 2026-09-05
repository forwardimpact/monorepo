# Libraries

Follow these conventions under `libraries/`. The catalog and jobs live in
[README.md](README.md). This file documents the metadata, rules, and
conventions a library must follow.

## Audience

The audience is external agents and engineers with limited context and no
access to the monorepo. They reach a tool through `npx fit-<name>`. They also
reach it when they load the matching skill. They never clone the repo.

Write `--help` output, skill instructions, and published guides for that
reader. Keep each one self-contained. Do not reference insider tooling. Do not
use relative paths into `libraries/` or `websites/`. Make every doc link a
fully-qualified public URL on the library's own guide host (§ Linking rule).

### Mandate

Check the [catalog](README.md) before you write a generic capability under
products, services, websites, or scripts. If a library covers it, use the
library. If no library covers it, note that in the commit or plan so the next
contributor does not re-search. This rule lives next to the other invariants in
[CONTRIBUTING.md](../CONTRIBUTING.md#checklists).

## Configuration

Libraries that need runtime config layer on top of
[`config/`](../config/CLAUDE.md) through [`libconfig`](libconfig/CLAUDE.md).
Pick the factory that matches the consumer: `createServiceConfig`,
`createProductConfig`, `createInitConfig`, `createExtensionConfig`, or
`createScriptConfig`. `libconfig`, `librc`, and `libsupervise` form the
config-to-runtime pipeline.

## `package.json` metadata

Every library carries metadata the catalog generators consume. `description`
becomes the catalog row in [README.md](README.md). `keywords` are 4–6
lowercase tokens. The last one is always `agent`. `jobs` are Little Hire
entries with no `forces` or `firedWhen`. They generate the jobs block in
README.md. See `libraries/librpc/package.json` for a worked example. After you
edit, regenerate with `bun run context:fix`.

## Invocation context

Libraries that ship a CLI can opt into `InvocationContext`. It is a frozen
`{ data, args, options, deps }` contract that libcli produces from argv.
Declare named positionals with `args: string[]` on the subcommand and a
`handler: (ctx) => …`. Then call `cli.dispatch(parsed, { data, deps })`. Use
`ctx.deps` for host-injected ambient collaborators (the `runtime` bag). See
[MONOREPO.md § Ambient Dependencies](../MONOREPO.md). Use `ctx.data` for
host-loaded domain values. See the
[Every Surface guide](https://www.forwardimpact.team/docs/libraries/every-surface/index.md)
for the full contract.

## CLIs and progressive documentation

If a library ships a CLI (a `bin/` entry in `package.json`), three artifacts
must exist together. They give an external reader the same docs from any entry
point:

- **User guides** under `websites/fit/docs/libraries/<task-slug>/index.md`.
  A CLI may carry multiple task guides (e.g. `fit-terrain` links to
  `generate-dataset` and `substrate-contract`).
- **Skill** at `.claude/skills/fit-<name>/SKILL.md`.
- **CLI `--help`** — `documentation` entries on the libcli definition, one
  per linked guide.

The seven runtime commands (`gemba-harness`, `gemba-trace`, `gemba-benchmark`,
`gemba-selfedit`, `gemba-wiki`, `gemba-xmr`, `gemba-watchdog`) are the
exception. Their bins and skills belong to the Gemba product
(`products/gemba/bin/`, `.claude/skills/gemba-*/`). `libharness`, `libwiki`,
`libxmr`, and `libwatchdog` remain import-only libraries. Their guides live on
`www.gemba.team`, at `websites/gemba/docs/<task-slug>/index.md`, with no
`libraries/` tier. The `libbridge` and `libterrain` guides stay on
`www.forwardimpact.team`.

### Linking rule

The skill `## Documentation` list and the CLI `documentation` array carry the
same entries, in the same order, with the same titles and URLs. Each library
cites the host that publishes its guide:

```text
https://www.forwardimpact.team/docs/libraries/<task-slug>/index.md
https://www.gemba.team/docs/<task-slug>/index.md
```

The `libharness`, `libwiki`, `libxmr`, and `libwatchdog` guides cite
`www.gemba.team`. Every other library, `libbridge` and `libterrain` included,
cites `www.forwardimpact.team`.

Slugs are task-shaped (`every-surface`). Do not shape a slug after a library
name. The `.md` extension is deliberate. Agents fetch markdown more reliably
than rendered HTML. The URL also maps one-to-one to the source file.
Product-task guides (engineer/leadership audience) live under
`www.forwardimpact.team/docs/products/` instead. See
[products/CLAUDE.md](../products/CLAUDE.md). A library CLI may cross-link to a
product guide when the task naturally cuts across both audiences.

## Add a library

- `package.json` — `@forwardimpact/lib<name>`, ESM, with `description`,
  `keywords`, `jobs`.
- `README.md` — purpose, key exports, one composition example.
- `src/` — implementation (no tests in `src`).
- `test/` — `*.test.js` files, runner-independent (`bun:test` and
  `node:test` both work, see `libmock`).
- Run `bun run context:fix` to regenerate the catalog and jobs tables.
  Update any product or service that consumes it to import from the new
  library.
