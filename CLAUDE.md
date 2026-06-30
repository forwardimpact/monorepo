# Forward Impact Engineering

## Goal

> "The aim of leadership should be to improve the performance of [engineers] and
> [agents], to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## Primary Products

Two external user groups hire these products; internal contributors build the
monorepo. See [JTBD.md](JTBD.md) for each persona's jobs.

- **Engineering Leaders** — Define what good engineering looks like, staff teams
  to succeed, and measure outcomes without blaming individuals.
- **Empowered Engineers** — See what's expected of them and their agents, get
  judgment grounded in the standard, and stay prepared.

### Map — `fit-map`

Hired by leaders to turn 'good engineering' into an operational definition the
organization trusts, catching structural mistakes before they ship.
[Overview](websites/fit/map/index.md)

### Pathway — `fit-pathway`

Hired by engineers to see what's expected of them at their level and of the
agents they configure, rendered from one shared standard.
[Overview](websites/fit/pathway/index.md)

### Guide — `fit-guide`

Hired by engineers to get career guidance and output review grounded in their
organization's actual standard, not generic advice or impressions.
[Overview](websites/fit/guide/index.md)

### Landmark — `fit-landmark`

Hired by leaders to demonstrate engineering progress without making individuals
feel surveilled, and by engineers to see their evidence of growth.
[Overview](websites/fit/landmark/index.md)

### Summit — `fit-summit`

Hired by leaders to replace staffing guesswork with team composition analysis.
Surfaces capability gaps before someone gets set up to fail.
[Overview](websites/fit/summit/index.md)

### Outpost — `fit-outpost`

Hired by engineers to track people, projects, and threads without continuous
effort, assembling context so they walk into every meeting oriented.
[Overview](websites/fit/outpost/index.md)

## Secondary Products

**Platform Builders** and **Teams Using Agents** hire these to build and run
agent-capable systems. See [JTBD.md](JTBD.md) for their jobs.

- **Gear — `fit-skills`** — Shared capabilities for humans and agents through
  one interface, with tooling to prove changes improved outcomes.
  [Overview](websites/fit/gear/index.md) ·
  [Libraries](libraries/README.md#catalog) ·
  [Services](services/README.md#catalog)
- **Kata — `kata-skills`** — A self-improving agent team running a daily
  Plan-Do-Study-Act cycle: write specs, ship features, study traces, act on
  findings. [KATA.md](KATA.md)
- **Co-Aligned Instructions Standard** — The layered instruction architecture
  for aligned coding agents. [COALIGNED.md](COALIGNED.md)
- **Monorepo Structure Standard** — The directory shape and root files a
  repository shared by humans and agents follows. [MONOREPO.md](MONOREPO.md)

## Distribution Model

The monorepo is open source but internal-only; external users consume via
npm. It is the source of truth for `forwardimpact/*` sibling repos:

- **npm packages** — `fit-*` and `kata-*` CLIs and libraries via `npx fit-*`;
  bare names are launchers ([launchers/README.md](launchers/README.md)). CLIs
  use `#!/usr/bin/env node`, no Bun. gRPC products need `npx fit-codegen --all`
  ([Typed Contracts](websites/fit/docs/libraries/typed-contracts/index.md)).
- **Skill packs** — `forwardimpact/{fit-skills,kata-skills,coaligned-skills}`
  sync on push to `main`; install with `apm install forwardimpact/<pack>`.
  Internal skills (`libs-*`, product internals) never publish.
- **Composite actions** — co-located with their owning unit
  (`libraries/*/actions/`, `products/*/actions/`, `.github/actions/`), published
  to siblings by subtree split. Edit in-repo
  ([`.github/CLAUDE.md`](.github/CLAUDE.md)):

  <!-- enum:sibling-composite-actions:list -->
  `benchmark`, `bootstrap`, `harness`, `kata-agent`, `wiki`
  <!-- /enum -->

Published skills teach how products **work** and **use**, not how they're
implemented. Use fully qualified URLs, e.g.
`https://www.forwardimpact.team/docs/products/authoring-standards/index.md`.

External users run Node.js + `npx`; internal contributors run Bun 1.2+ +
`bunx` + `just`. `just codegen` (in `just quickstart`) runs `fit-codegen`.
External docs use `npm`/`npx`; `bun`/`bunx`/`just` appear only in internal docs.

## Contributor Workflow

Everything below is for internal contributors; external users should consult the
[Getting Started guides](websites/fit/docs/getting-started/).

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Invariants, structure, quality
  commands, releasing, security policies. **Read before your first commit.**
- **[Operations Reference](websites/fit/docs/internals/operations/index.md)** —
  Environment setup, service management, common tasks.

### Jobs and Checklists

Product jobs live in [JTBD.md](JTBD.md); service and library jobs in their
README.md. Tagged checklists gate pause points. Discover both with `rg`:

```sh
rg '<job '                  # Jobs To Be Done
rg '<read_do_checklist'     # Entry gates — read each item, then do it
rg '<do_confirm_checklist'  # Exit gates — do from memory, then confirm
```

`benchmarks/` is excluded via [`.rgignore`](.rgignore) — see
[benchmarks/README.md](benchmarks/README.md) § Fixture safety.

**Every contribution** runs [§ READ-DO](CONTRIBUTING.md#read-do) then
[§ DO-CONFIRM](CONTRIBUTING.md#do-confirm). Domain checklists in
`.claude/skills/kata-*/SKILL.md`; shared libraries in
[libraries/README.md](libraries/README.md).

When `.claude/**` writes are blocked, use `echo … | bunx fit-selfedit <path>` —
gated to `.claude/settings.json` Edit() rules + non-`main` branch.

## Writing Style

All prose, from marketing copy to commit messages, is simple and direct.
Avoid the tells of AI-generated text: em-dash asides, antithesis pairs,
rhetorical questions, and stacked noun chains. One idea per sentence.

## Memory and Coordination

Wiki is **memory** — own state (summaries, logs, metrics), not a handoff
channel. **Coordination** needs a named receiver and addressable artifact:
Issue, PR/issue comment, Discussion, or `kata-dispatch`. See
[memory-protocol](.claude/agents/x-memory-protocol.md) and
[coordination-protocol](.claude/agents/x-coordination-protocol.md).

## Domain Concepts

Agent-aligned engineering standards are defined in YAML under
[products/map/starter/](products/map/starter/) (installed to `data/pathway/` in
consuming projects). Use `bunx fit-pathway <entity> --list` to list values.

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
- **Kata Agent Team** — [KATA.md](KATA.md)

**External:**

- **Getting started** — [Getting Started](websites/fit/docs/getting-started/)
- **Product guides** — [products/](websites/fit/docs/products/)
- **Library guides** — [libraries/](websites/fit/docs/libraries/)
- **Service guides** — [services/](websites/fit/docs/services/)
- **Published skills** — [fit-\*](.claude/skills/) · [kata-\*](.claude/skills/)
