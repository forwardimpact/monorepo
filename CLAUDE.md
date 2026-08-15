# Forward Impact Engineering

## Critical: Writing Style

**All output and artifacts must follow ASD-STE100 Simplified Technical
English.** Use the active voice and one idea per sentence. Avoid AI tells:
em-dash asides, antithesis pairs, rhetorical questions, and stacked noun
chains.

## Goal

> "The aim of leadership should be to improve the performance of [engineers] and
> [agents], to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## Primary Products

Two external user groups hire these products. Internal contributors build the
monorepo. See [JTBD.md](JTBD.md) for each persona's jobs.

- **Engineering Leaders** — Define what good engineering looks like. Staff
  teams to succeed. Measure outcomes. Do not blame individuals.
- **Empowered Engineers** — See the expectations for them and their agents.
  Get judgment grounded in the standard. Stay prepared.

### Map — `fit-map`

Leaders hire Map to turn 'good engineering' into an operational definition the
organization trusts. It catches structural mistakes before they ship.
[Overview](websites/fit/map/index.md)

### Pathway — `fit-pathway`

Engineers hire Pathway to see the expectations for their level and the
agents they configure. It renders these from one shared standard.
[Overview](websites/fit/pathway/index.md)

### Guide — `fit-guide`

Engineers hire Guide to ground career guidance and output review in their
organization's actual standard instead of generic advice or impressions.
[Overview](websites/fit/guide/index.md)

### Landmark — `fit-landmark`

Leaders hire Landmark to demonstrate engineering progress. Individuals do not
feel surveilled. Engineers hire it to see their evidence of growth.
[Overview](websites/fit/landmark/index.md)

### Summit — `fit-summit`

Leaders hire Summit to replace staffing guesswork with team composition
analysis. It surfaces capability gaps before someone gets set up to fail.
[Overview](websites/fit/summit/index.md)

### Outpost — `fit-outpost`

Engineers hire Outpost to track people, projects, and threads without
continuous effort. It assembles context. Engineers walk into every meeting
oriented. [Overview](websites/fit/outpost/index.md)

## Secondary Products

**Platform Builders** and **Teams Using Agents** hire these to build and run
agent-capable systems. See [JTBD.md](JTBD.md) for their jobs.

- **Gear — `fit-skills`** — Shared capabilities for humans and agents through
  one interface, with tools to prove changes improved outcomes.
  [Overview](websites/fit/gear/index.md) ·
  [Libraries](libraries/README.md#catalog) ·
  [Services](services/README.md#catalog)
- **Gemba — `gemba-skills`** — The agent-runtime platform Kata runs on:
  `gemba-*` CLIs and agent-run actions.
  [Overview](websites/fit/gemba/index.md)
- **Kata — `kata-skills`** — An agent team that improves itself on a daily
  Plan-Do-Study-Act cycle: write specs, ship features, study traces, act on
  findings. [KATA.md](KATA.md)
- **Jidoka — `jidoka-skills`** — Built-in instruction quality that stops the
  line on drift. [JIDOKA.md](JIDOKA.md)
- **Monorepo Structure Standard** — The directory shape and root files of a
  repository humans and agents share. [MONOREPO.md](MONOREPO.md)

## Distribution Model

The monorepo is open source but internal-only. External users consume
through npm. It is the source of truth for `forwardimpact/*` sibling repos:

- **npm packages** — `fit-*`/`gemba-*`/`kata-*` CLIs and libraries through
  `npx`. Bare names are launchers ([launchers/README.md](launchers/README.md)).
  CLIs use `#!/usr/bin/env node`, no Bun. gRPC products need
  `npx fit-codegen generate --all`
  ([Typed Contracts](websites/fit/docs/libraries/typed-contracts/index.md)).
- **Skill packs** —
  `forwardimpact/{fit-skills,gemba-skills,kata-skills,jidoka-skills}` sync on
  push to `main`. Install with `apm install forwardimpact/<pack>`. Internal
  skills (`libs-*`, product internals) never publish.
- **Composite actions** — co-located with their owner unit
  (`products/*/actions/`, `.github/actions/`). A subtree split publishes them.
  Edit in-repo ([`.github/CLAUDE.md`](.github/CLAUDE.md)):

  <!-- enum:sibling-composite-actions:list -->
  `gemba-benchmark`, `gemba-bootstrap`, `gemba-harness`, `gemba-wiki`, `jidoka`, `kata-agent`, `kata-interview`
  <!-- /enum -->

Published skills teach how products **work** and **use**. They never teach
implementation. Use fully qualified URLs, e.g.
`https://www.forwardimpact.team/docs/products/authoring-standards/index.md`.

External users run Node.js + `npx`. Internal contributors run Bun 1.2+ +
`bunx` + `just`. `just codegen` (in `just quickstart`) runs `fit-codegen`.
External docs use `npm`/`npx`. Only internal docs use `bun`/`bunx`/`just`.

## Contributor Workflow

Everything below is for internal contributors. External users consult the
[Getting Started guides](websites/fit/docs/getting-started/).

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Invariants, structure, quality
  commands, releases, security policies. **Read before your first commit.**
- **[Operations Reference](websites/fit/docs/internals/operations/index.md)** —
  Environment setup, service management, common tasks.

### Jobs and Checklists

Product jobs live in [JTBD.md](JTBD.md), service and library jobs in their
README.md. Tagged checklists gate pause points. Discover both with `rg`:

```sh
rg '<job '                  # Jobs To Be Done
rg '<read_do_checklist'     # Entry gates — read each item, then do it
rg '<do_confirm_checklist'  # Exit gates — do from memory, then confirm
```

[`.rgignore`](.rgignore) excludes `benchmarks/`. See
[benchmarks/README.md](benchmarks/README.md) § Fixture safety.

**Every contribution** runs [§ READ-DO](CONTRIBUTING.md#checklists) then
[§ DO-CONFIRM](CONTRIBUTING.md#checklists). Domain checklists live in
`.claude/skills/kata-*/SKILL.md`, shared libraries in
[libraries/README.md](libraries/README.md).

When settings block `.claude/**` writes, use
`echo … | bunx gemba-selfedit <path>`. `.claude/settings.json` Edit() rules
and a non-`main` branch gate it.

## Memory and Coordination

Wiki holds **memory**: own state (summaries, logs, metrics). It is not a
handoff channel. **Coordination** needs a named receiver and addressable
artifact: Issue, PR/issue comment, Discussion, or `kata-dispatch`. See
[memory-protocol](.claude/agents/x-memory-protocol.md) and
[coordination-protocol](.claude/agents/x-coordination-protocol.md).

## Domain Concepts

YAML files under [products/map/starter/](products/map/starter/) define
agent-aligned engineering standards (installed to `data/pathway/` in consumer
projects). Use `bunx fit-pathway <entity> --list` to list values.

- **Disciplines** — `disciplines/{id}.yaml`
- **Levels** — `levels.yaml`
- **Tracks** — `tracks/{id}.yaml`
- **Capabilities** & **Skills** — `capabilities/{id}.yaml` (skills nested)
- **Behaviours** — `behaviours/{id}.yaml`
- **Drivers** — `drivers.yaml`

Validate data: `bunx fit-map validate`. Vocabulary standards live in the
[Authoring Agent-Aligned Engineering Standards guide](websites/fit/docs/products/authoring-standards/index.md).

## Documentation Map

One home per policy.

**Internal:**

- **Project identity & orientation** — [CLAUDE.md](CLAUDE.md)
- **Contribution standards & security** — [CONTRIBUTING.md](CONTRIBUTING.md)
- **CLI/skill link policy** — [products/](products/CLAUDE.md) ·
  [libraries/](libraries/CLAUDE.md)
- **Kata Agent Team** — [KATA.md](KATA.md)

**External:**

- **Getting started** — [Getting Started](websites/fit/docs/getting-started/)
- **Product guides** — [products/](websites/fit/docs/products/)
- **Library guides** — [libraries/](websites/fit/docs/libraries/)
- **Service guides** — [services/](websites/fit/docs/services/)
- **Published skills** — [fit-\*](.claude/skills/) · [kata-\*](.claude/skills/)
