# Libraries

Conventions when working under `libraries/`. The catalog and jobs live in
[README.md](README.md); this file documents the metadata, rules, and
conventions a library must follow.

## Audience

The primary audience for library CLIs and their matching skills is **external
agents and engineers** who have limited context and no direct access to this
monorepo. They reach a tool via `npx fit-<name>` or by loading the matching
skill — without ever cloning the repo.

Write `--help` output, skill instructions, and published guides for that reader:
self-contained, no insider tooling references, no relative paths into
`libraries/` or `websites/`, and every doc link a fully-qualified public URL.

## Mandate

When building a product, service, website, or script, you **must** check the
[catalog](README.md) before writing a generic capability. If a library here
covers it, use the library. If not, note that in the commit or plan so the next
contributor does not re-search.

This rule lives next to the other invariants in
[CONTRIBUTING.md](../CONTRIBUTING.md#read-do).

## `package.json` metadata

Every library carries metadata the catalog generators consume. `description`
becomes the catalog row in [README.md](README.md). `keywords` are 4–6 lowercase
tokens; last is always `agent`. `jobs` are Little Hire entries — no `forces` or
`firedWhen` — generating the jobs block in README.md.

### Worked example: `librpc`

```json
{
  "description": "gRPC server and client framework — how agent services talk to each other.",
  "keywords": ["grpc", "rpc", "server", "client", "agent"],
  "jobs": [
    {
      "user": "Platform Builders",
      "goal": "Stand Up Typed Services",
      "trigger": "Starting a new service and reaching for last project's copy-pasted transport boilerplate.",
      "bigHire": "ship a service endpoint without reimplementing transport.",
      "littleHire": "call a service without managing connections or retries.",
      "competesWith": "copy-pasting boilerplate; hand-writing protobuf clients; tolerating the duplication"
    }
  ]
}
```

After editing, regenerate: `bun run context:fix`.

## Invocation context

Libraries that ship a CLI can opt into `InvocationContext` — a frozen
`{ data, args, options }` contract that libcli produces from argv. Declare
named positionals with `args: string[]` on the subcommand definition and a
`handler: (ctx) => …`; call `cli.dispatch(parsed, { data })` to receive a
context with named args instead of a raw positionals array. See the
[Every Surface guide](websites/fit/docs/libraries/every-surface/index.md) for
the full contract and dispatch pattern.

## CLIs and progressive documentation

If a library ships a CLI (a `bin/` entry in `package.json`), three artifacts
must exist together so an external reader lands on the same docs from any entry
point:

- One or more **user guides** — markdown sources under
  `websites/fit/docs/libraries/<task-slug>/index.md`. A CLI may carry multiple
  task guides (e.g. `fit-eval` links to `agent-evaluations`,
  `agent-collaboration`, and `trace-analysis`).
- The **skill** — `.claude/skills/fit-<name>/SKILL.md`.
- The **CLI `--help`** — `documentation` entries on the libcli definition, one
  per linked guide.

### Linking rule

Skill and CLI both link each guide using the **fully-qualified URL of the
markdown source**:

```
https://www.forwardimpact.team/docs/libraries/<task-slug>/index.md
```

Slugs are task-shaped (e.g. `trace-analysis`, `agent-evaluations`), not
library-name-shaped — one library may host multiple task slugs and one task slug
may cut across multiple libraries.

The skill's `## Documentation` list and the CLI's `documentation` array must
carry the same entries in the same order. When you add, remove, or rename a
link in one, update the other in the same commit.

The `.md` extension is deliberate. Agents fetch markdown more reliably than
rendered HTML, and the `.md` URL maps one-to-one to the source file in
`websites/fit/docs/libraries/<task-slug>/index.md`. Use the same title and URL
across all three artifacts. Product-task guides (the engineer/leadership
audience) live under `/docs/products/` instead — see
[products/CLAUDE.md](../products/CLAUDE.md) for that policy. A library CLI may
cross-link to a product guide when the task naturally cuts across both
audiences.

### Worked example: `fit-foo` with one guide `bar`

Guide source: `websites/fit/docs/libraries/bar/index.md`.

Skill (`.claude/skills/fit-foo/SKILL.md`) carries this `## Documentation` block:

```markdown
## Documentation

- [Bar Guide](https://www.forwardimpact.team/docs/libraries/bar/index.md) —
  how to use `fit-foo` to do bar.
```

CLI definition (libcli) carries the same link:

```js
const cli = createCli({
  name: "fit-foo",
  documentation: [
    {
      title: "Bar Guide",
      url: "https://www.forwardimpact.team/docs/libraries/bar/index.md",
      description: "How to use fit-foo to do bar.",
    },
  ],
});
```

## Adding a library

Same shape as every other library here:

- `package.json` — `@forwardimpact/lib<name>`, ESM, with `description`,
  `keywords`, and `jobs`.
- `README.md` — purpose, key exports, one composition example.
- `src/` — implementation (no tests in `src`).
- `test/` — `*.test.js` files, runner-independent (`bun:test` and `node:test`
  both work, see `libharness`).
- Run `bun run context:fix` to regenerate the catalog and jobs tables. Update
  any consuming product or service to import from the new library.

## Configuration and supervision libraries

`libconfig` factories, `librc` (`fit-rc`), and `libsupervise` form the
config-to-runtime pipeline. Factory/namespace/env-prefix table:
[`libconfig/CLAUDE.md`](libconfig/CLAUDE.md). File format and merge rules:
[`config/CLAUDE.md`](../config/CLAUDE.md).

## Vocabulary

- **engineering-standard** — the agent-aligned engineering standard data model
  (disciplines, levels, tracks, capabilities, skills, behaviours, drivers)
  authored as YAML under [products/map/starter/](../products/map/starter/).
  Defines what good engineering looks like for the organization.
- **skill-doc** — the published markdown documentation for a skill or
  capability, surfaced to agents via `--help` links so they can locate
  authoritative usage docs without prior context.
- **MCP** — [Model Context Protocol](https://modelcontextprotocol.io/),
  Anthropic's standard for exposing tools to LLM agents. `libmcp` bridges gRPC
  services into MCP tools.
- **Plan-Do-Study-Act** — the Toyota-Kata improvement loop the Kata Agent Team
  uses: agents plan, ship, study their traces, and act on findings. See
  [KATA.md](../KATA.md).
