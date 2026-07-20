# Libraries

Conventions when working under `libraries/`. The catalog and jobs live in
[README.md](README.md); this file documents the metadata, rules, and
conventions a library must follow.

## Audience

External agents and engineers with limited context and no access to the
monorepo. They reach a tool via `npx fit-<name>` or by loading the matching
skill — without ever cloning the repo.

Write `--help` output, skill instructions, and published guides for that
reader: self-contained, no insider tooling references, no relative paths
into `libraries/` or `websites/`, and every doc link a fully-qualified
public URL.

### Mandate

Before writing a generic capability under products, services, websites, or
scripts, check the [catalog](README.md). If a library covers it, use it; if
not, note that in the commit or plan so the next contributor does not
re-search. This rule lives next to the other invariants in
[CONTRIBUTING.md](../CONTRIBUTING.md#checklists).

## Configuration

Libraries that need runtime config layer on top of
[`config/`](../config/CLAUDE.md) via [`libconfig`](libconfig/CLAUDE.md).
Pick the factory that matches the consumer: `createServiceConfig`,
`createProductConfig`, `createInitConfig`, `createExtensionConfig`, or
`createScriptConfig`. `libconfig`, `librc`, and `libsupervise` form the
config-to-runtime pipeline.

## `package.json` metadata

Every library carries metadata the catalog generators consume. `description`
becomes the catalog row in [README.md](README.md). `keywords` are 4–6
lowercase tokens; last is always `agent`. `jobs` are Little Hire entries —
no `forces` or `firedWhen` — generating the jobs block in README.md. See
`libraries/librpc/package.json` for a worked example. After editing,
regenerate: `bun run context:fix`.

## Invocation context

Libraries that ship a CLI can opt into `InvocationContext` — a frozen
`{ data, args, options, deps }` contract that libcli produces from argv.
Declare named positionals with `args: string[]` on the subcommand and a
`handler: (ctx) => …`; call `cli.dispatch(parsed, { data, deps })`. Use
`ctx.deps` for host-injected ambient collaborators (the `runtime` bag — see
[MONOREPO.md § Ambient Dependencies](../MONOREPO.md)); use `ctx.data` for
host-loaded domain values. See the
[Every Surface guide](https://www.forwardimpact.team/docs/libraries/every-surface/index.md)
for the full contract.

## CLIs and progressive documentation

If a library ships a CLI (a `bin/` entry in `package.json`), three artifacts
must exist together so an external reader lands on the same docs from any
entry point:

- **User guides** under `websites/fit/docs/libraries/<task-slug>/index.md`.
  A CLI may carry multiple task guides (e.g. `gemba-harness` links to
  `agent-evaluations`, `agent-collaboration`, `trace-analysis`).
- **Skill** at `.claude/skills/fit-<name>/SKILL.md`.
- **CLI `--help`** — `documentation` entries on the libcli definition, one
  per linked guide.

The six runtime commands (`gemba-harness`, `gemba-trace`, `gemba-benchmark`,
`gemba-selfedit`, `gemba-wiki`, `gemba-xmr`) are the exception: their bins
and skills belong to the Gemba product (`products/gemba/bin/`,
`.claude/skills/gemba-*/`), while `libharness`, `libwiki`, and `libxmr`
remain import-only libraries whose guides still live under
`/docs/libraries/`.

### Linking rule

Skill `## Documentation` list and CLI `documentation` array carry the same
entries in the same order — same titles, same URLs:

```text
https://www.forwardimpact.team/docs/libraries/<task-slug>/index.md
```

Slugs are task-shaped (`trace-analysis`), not library-name-shaped. The `.md`
extension is deliberate — agents fetch markdown more reliably than rendered
HTML, and the URL maps one-to-one to the source file. Product-task guides
(engineer/leadership audience) live under `/docs/products/` instead — see
[products/CLAUDE.md](../products/CLAUDE.md). A library CLI may cross-link to
a product guide when the task naturally cuts across both audiences.

## Adding a library

- `package.json` — `@forwardimpact/lib<name>`, ESM, with `description`,
  `keywords`, `jobs`.
- `README.md` — purpose, key exports, one composition example.
- `src/` — implementation (no tests in `src`).
- `test/` — `*.test.js` files, runner-independent (`bun:test` and
  `node:test` both work, see `libmock`).
- Run `bun run context:fix` to regenerate the catalog and jobs tables.
  Update any consuming product or service to import from the new library.
