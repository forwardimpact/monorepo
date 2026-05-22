# Forward Impact Engineering

## Goal

> "The aim of leadership should be to improve the performance of [engineers] and
> [agents], to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## Primary Products

Three external user groups hire these products. Internal contributors build and
maintain the monorepo. See [JTBD.md](JTBD.md) for each persona's jobs.

- **Engineering Leaders** — Define what good engineering looks like, staff teams
  to succeed, and measure outcomes without blaming individuals.
- **Empowered Engineers** — Understand expectations, find growth areas, prepare
  for the day ahead, and equip and trust their agent teams — grounded in their
  organization's agent-aligned engineering standard.
- **Teams Using Agents** — Run an autonomous, continuously improving development
  team that plans, ships, studies its own traces, and acts on findings.

### Map — `fit-map`

Hired by engineering leaders to turn 'good engineering' into an operational
definition the organization trusts. Catches structural mistakes before they
ship. [Overview](websites/fit/map/index.md)

### Pathway — `fit-pathway`

Hired by leaders to define roles, engineers to see what's expected, and agents to
be configured to match. Makes expectations visible and coherent across
evaluations. [Overview](websites/fit/pathway/index.md)

### Guide — `fit-guide`

Hired by engineers to get career guidance and output review grounded in their
organization's actual standard, not generic advice or subjective impressions.
[Overview](websites/fit/guide/index.md)

### Landmark — `fit-landmark`

Hired by leaders to demonstrate engineering progress and by engineers to show
evidence of growth — both without making individuals feel surveilled.
[Overview](websites/fit/landmark/index.md)

### Summit — `fit-summit`

Hired by engineering leaders to replace staffing guesswork with evidence-based
team composition analysis. Surfaces capability gaps before someone gets set up to
fail. [Overview](websites/fit/summit/index.md)

### Outpost — `fit-outpost`

Hired by engineers to maintain continuous awareness of people, projects, and
threads without continuous effort. Assembles context so they walk into every
meeting already oriented. [Overview](websites/fit/outpost/index.md)

### Kata — `kata-skills`

Hired by teams using agents to run an autonomous development team that keeps
getting better. Organized as a daily Plan-Do-Study-Act cycle where agents plan by
writing specs, ship features, study their own traces, and act on findings.
[Internals](websites/fit/docs/internals/kata/)

## Secondary Products

**Platform Builders** hire these products to _construct agent-capable systems
using shared libraries and services designed for humans and agents alike._
[Libraries § Jobs To Be Done](libraries/README.md#jobs-to-be-done) ·
[Services § Jobs To Be Done](services/README.md#jobs-to-be-done)

### Gear — `fit-skills`

Hired by platform builders to give humans and agents shared capabilities through
the same interface, with tooling to prove changes actually improved outcomes.
[Overview](websites/fit/gear/index.md) ·
[Libraries § Catalog](libraries/README.md#catalog) ·
[Services § Catalog](services/README.md#catalog)

## Distribution Model

The monorepo is open source but internal-only — external users consume via
npm. It's the source of truth for several sibling repos under
`forwardimpact/*` we maintain alongside it:

- **npm packages** — `fit-*` and `kata-*` CLIs and libraries, installed via
  `npx fit-*`. All CLIs use `#!/usr/bin/env node` (no Bun required). gRPC
  products (currently Guide) need `npx fit-codegen --all` — see
  [Typed Contracts](websites/fit/docs/libraries/typed-contracts/index.md).
- **Skill packs** — `forwardimpact/fit-skills` and `forwardimpact/kata-skills`
  sync on push to `main`. Install: `npx skills add forwardimpact/fit-skills`
  (or `kata-skills`). Internal skills (`libs-*`, product internals) never
  publish.
- **Composite actions** — `forwardimpact/{kata-agent,fit-eval,fit-benchmark}`
  tagged at `v1`. Edit procedure in
  [`.github/CLAUDE.md`](.github/CLAUDE.md).

Published skills teach how products **work** and **use** — not how they're
implemented. Use fully qualified URLs (e.g.
`https://www.forwardimpact.team/docs/products/authoring-standards/index.md`).

External users run Node.js + `npx`; internal contributors run Bun 1.2+ +
`bunx` + `just`. `just codegen` (included in `just quickstart`) runs
`fit-codegen` internally. External docs use `npm`/`npx`; `bun`/`bunx`/`just`
appear only in internal docs.

## Contributor Workflow

Everything below this point is for internal contributors. External users should
consult the [Getting Started guides](websites/fit/docs/getting-started/).

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Invariants, structure, quality
  commands, security policies. **Read before your first commit.**
- **[Operations Reference](websites/fit/docs/internals/operations/index.md)** —
  Environment setup, service management, common tasks.

### Jobs and Checklists

Product-level jobs live in [JTBD.md](JTBD.md). Service and library jobs live in
their respective README.md files. Tagged checklists gate pause points. Discover
both with `rg`:

```sh
rg '<job '                  # Jobs To Be Done
rg '<read_do_checklist'     # Entry gates — read each item, then do it
rg '<do_confirm_checklist'  # Exit gates — do from memory, then confirm
```

`benchmarks/` is excluded via [`.rgignore`](.rgignore) — see
[benchmarks/README.md](benchmarks/README.md) § Fixture safety.

**Every contribution** runs [§ READ-DO](CONTRIBUTING.md#read-do) then
[§ DO-CONFIRM](CONTRIBUTING.md#do-confirm). Domain checklists in
`.claude/skills/kata-*/SKILL.md`. Shared libraries:
[libraries/README.md](libraries/README.md).

## Memory and Coordination

Wiki is **memory** — own state (summaries, logs, metrics), not a handoff
channel. **Coordination** requires a named receiver and addressable artifact:
Issue, PR/issue comment, Discussion, or `kata-dispatch`. See
[memory-protocol](.claude/agents/references/memory-protocol.md) and
[coordination-protocol](.claude/agents/references/coordination-protocol.md).

## Domain Concepts

Agent-aligned engineering standards are defined in YAML under
[products/map/starter/](products/map/starter/) (the monorepo's starter template,
which installs to `data/pathway/` in consuming projects). Use
`bunx fit-pathway <entity> --list` to discover available values.

- **Disciplines** — `disciplines/{id}.yaml`
- **Levels** — `levels.yaml`
- **Tracks** — `tracks/{id}.yaml`
- **Capabilities** & **Skills** — `capabilities/{id}.yaml` (skills nested)
- **Behaviours** — `behaviours/{id}.yaml`
- **Drivers** — `drivers.yaml`

Validate data: `bunx fit-map validate`. Vocabulary standards in the
[Authoring Agent-Aligned Engineering Standards guide](websites/fit/docs/products/authoring-standards/index.md).

## Documentation Map

One home per policy.

**Internal:**

- **Project identity & orientation** — [CLAUDE.md](CLAUDE.md)
- **Contribution standards & security** — [CONTRIBUTING.md](CONTRIBUTING.md)
- **CLI/skill linking policy** — [products/](products/CLAUDE.md) ·
  [libraries/](libraries/CLAUDE.md)
- **Kata Agent Team** — [KATA.md](KATA.md) ·
  [Internals](websites/fit/docs/internals/kata/)

**External:**

- **Getting started** — [Getting Started](websites/fit/docs/getting-started/)
- **Product guides** — [websites/fit/docs/products/](websites/fit/docs/products/)
- **Library guides** — [websites/fit/docs/libraries/](websites/fit/docs/libraries/)
- **Service guides** — [websites/fit/docs/services/](websites/fit/docs/services/)
- **Published skills** — [fit-\*](.claude/skills/) · [kata-\*](.claude/skills/)
