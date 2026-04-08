# Forward Impact Engineering

## Goal

> "The aim of leadership should be to improve the performance of [engineers] and
> [agents], to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

## Users

Three external user groups use the system. Every product serves at least two.
Internal contributors build and maintain the monorepo; external users consume
products via npm.

- **Leadership** — Define what good engineering looks like, staff teams to
  succeed, and measure outcomes without blaming individuals.
- **Engineers** — Understand expectations, find growth areas, stay prepared for
  daily work, and receive guidance grounded in their organization's framework.
- **Agents** — Operate with the same shared definitions, skill markers, and
  quality standards that humans use, so human–agent collaboration is coherent.

## Products

### Map — `fit-map`

Helps leadership and agents answer _what does good engineering look like here?_
Validates, stores, and publishes YAML frameworks.
[Overview](website/map/index.md) ·
[Internals](website/docs/internals/map/index.md)

### Pathway — `fit-pathway`

Helps engineers and agents answer _where does my career path go from here?_ Web
app, CLI, and static site generator for job definitions, agent profiles, and
interview questions. [Overview](website/pathway/index.md) ·
[Internals](website/docs/internals/pathway/index.md)

### Basecamp — `fit-basecamp`

Helps engineers and agents answer _am I prepared for what's ahead today?_
Personal operations center providing scheduled AI tasks, knowledge graphs, and
meeting briefings (macOS status menu). [Overview](website/basecamp/index.md) ·
[Internals](website/docs/internals/basecamp/index.md)

### Guide — `fit-guide`

Helps engineers answer _how do I find my bearing?_ AI agent that reasons about
your engineering framework in context. [Overview](website/guide/index.md) ·
[Internals](website/docs/internals/guide/index.md)

### Landmark — `fit-landmark`

Helps leadership and engineers answer _what milestones has my engineering
reached?_ Analysis layer combining GitHub artifact evidence with GetDX
snapshots. No LLM calls. [Overview](website/landmark/index.md)

### Summit — `fit-summit`

Helps leadership answer _is this team supported to reach peak performance?_
Models team capability as a system: skill matrices, coverage gaps, risks, and
staffing scenarios. [Overview](website/summit/index.md) ·
[Internals](website/docs/internals/summit/index.md)

## Distribution Model

The monorepo is open source but external users never clone it. They consume
products exclusively via npm packages. The monorepo exists solely for internal
contributors.

### How External Users Consume Products

External users install products with `npm install`, bringing their own framework
data. All CLIs use `#!/usr/bin/env node` — no Bun required.

Products using gRPC (currently Guide) require generated clients. External users
run `npx fit-codegen --all` after install. Generated code is
**installation-specific** and must never be bundled in npm packages — each
install may define custom `.proto` files that `fit-codegen` auto-discovers from
`@forwardimpact/*` packages. See
[Codegen Internals](website/docs/internals/codegen/index.md) for the full
pipeline.

Published skills (`fit-*` entries in [.claude/skills/](.claude/skills/)) help
external users understand how products **work** — not how they are
**implemented**. Synced to `forwardimpact/skills` on push to `main`. External
users install them with `npx skills add forwardimpact/skills`.

### How Internal Contributors Develop

- **External users** — Node.js + npm, run `npx fit-*`.
- **Internal contributors** — Bun 1.2+ + bun, run `bunx fit-*` and `just`.

`just codegen` (included in `just quickstart`) runs `fit-codegen` internally.
Internal skills (`libs-*`, product internals) help contributors understand
architecture — these are never published.

**Documentation rule:** External-facing docs must use `npm`/`npx`.
`bun`/`bunx`/`just` appear only in internal docs:
[CONTRIBUTING.md](CONTRIBUTING.md), the
[Operations Reference](website/docs/internals/operations/), and other
[internals pages](website/docs/internals/).

## Contributor Workflow

Everything below this point is for internal contributors. External users should
consult the [Getting Started guides](website/docs/getting-started/).

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — PR workflow, git conventions, quality
  commands, security policies. **Read before your first commit.**
- **[Operations Reference](website/docs/internals/operations/index.md)** —
  Environment setup, service management, common tasks.

Two checklists frame every contribution, following Atul Gawande's _Checklist
Manifesto_:

- **Before starting**, run [CONTRIBUTING.md § READ-DO](CONTRIBUTING.md#read-do)
  — the rules to hold in mind while writing, including _Simple over easy_.
- **Before committing**, run
  [CONTRIBUTING.md § DO-CONFIRM](CONTRIBUTING.md#do-confirm) — the gates to
  verify, including `bun run check`, `bun run test`, and commit format.

## LLM Environment

If `LLM_TOKEN` is not set in `.env` it will **always** be set in the shell
environment. Testers or contributors never need to generate or configure an LLM
key — `libconfig` reads `LLM_TOKEN` and `LLM_BASE_URL` from the process
environment, so testing with an LLM will always "just work".

## Structure

```
products/
  map/                 # fit-map — data product, validation
    schema/json/       #   JSON Schema
    schema/rdf/        #   RDF/SHACL
  pathway/             # fit-pathway — web app, CLI, formatters
    src/formatters/    #   output formatters
    starter/           #   framework YAML (installs to data/pathway/)
  basecamp/            # fit-basecamp — knowledge system, scheduler
    template/          #   KB template
  guide/               # fit-guide — LLM agent, artifact interpretation
  landmark/            # fit-landmark — signal analysis on Map data
  summit/              # fit-summit — team capability as a system
libraries/
  libskill/            # derivation logic, job/agent models
  libuniverse/         # fit-universe — synthetic data DSL and generation
  libui/               # web UI framework, components, CSS
  libdoc/              # fit-doc — documentation build/serve
services/
  agent/ graph/ llm/ memory/ tool/ trace/ vector/ web/
config/
  config.json          # service definitions, model settings, eval config
  tools.yml            # tool endpoint definitions
  agents/              # agent prompt files (*.agent.md)
data/
  synthetic/           # synthetic data DSL and generated artifacts
specs/
  {feature}/           # feature specifications and plans
```

Data-driven: entities defined in YAML, each external installation may have
completely different framework data while using the same product code.

## OO+DI Architecture

Every library and product follows a standard pattern:

- **Classes** accept collaborators through constructors
- **Factory functions** (`createXxx`) wire real implementations
- **Composition roots** (CLI `bin/` entry points) wire all instances
- **Tests** bypass factories and inject mocks directly

**Exceptions:** libskill (pure functions), libui (functional DOM), libsecret
(stateless crypto), libtype (generated protobuf). Pure stateless functions do
not need DI.

## Skill Groups

Library skills are organized into capability groups with corresponding skill
files in [.claude/skills/](.claude/skills/):

- **`libs-service-infrastructure`** — librpc, libconfig, libtelemetry, libtype,
  libharness
- **`libs-data-persistence`** — libstorage, libindex, libresource, libpolicy,
  libgraph, libvector
- **`libs-llm-orchestration`** — libllm, libmemory, libprompt, libagent
- **`libs-web-presentation`** — libui, libformat, libweb, libdoc, libtemplate
- **`libs-system-utilities`** — libutil, libsecret, libsupervise, librc,
  libcodegen
- **`libs-synthetic-data`** — libsyntheticgen, libsyntheticprose,
  libsyntheticrender

`libskill` retains its own skill (pure-function design, exempt from OO+DI).

## Domain Concepts

Framework entities are defined in YAML under
[products/pathway/starter/](products/pathway/starter/) (the monorepo's starter
template, which installs to `data/pathway/` in consuming projects). Use
`bunx fit-pathway <entity> --list` to discover available values.

- **Disciplines** — `disciplines/{id}.yaml`
- **Levels** — `levels.yaml`
- **Tracks** — `tracks/{id}.yaml`
- **Capabilities** — `capabilities/{id}.yaml`
- **Skills** — `capabilities/{id}.yaml` (under `skills:`)
- **Behaviours** — `behaviours/{id}.yaml`
- **Stages** — `stages.yaml`
- **Drivers** — `drivers.yaml`

All entities use co-located `human:` and `agent:` sections.

- **Skill proficiencies**: awareness → foundational → working → practitioner →
  expert
- **Behaviour maturities**: emerging → developing → practicing → role_modeling →
  exemplifying
- **Disciplines** define role types with T-shaped skill tiers
  (core/supporting/broad)
- **Tracks** are pure modifiers — adjust expectations via `skillModifiers`
- **Capabilities** group skills, define responsibilities, provide stage handoffs
- **Stages** define lifecycle phases with constraints and checklists
- **Tools** derived from `toolReferences` at runtime via `bunx fit-pathway tool`

Validate data: `bunx fit-map validate`. Vocabulary standards in the
[Authoring Frameworks guide](website/docs/guides/authoring-frameworks/index.md).

## Documentation Map

Policy entries have one canonical location — other files reference, never
restate. Per-product Overview and Internals pages are in [§ Products](#products)
above.

**Internal:**

- **Core rules & architecture** — [CLAUDE.md](CLAUDE.md)
- **Contributor workflow** — [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security policies** — [CONTRIBUTING.md § Security](CONTRIBUTING.md#security)
- **Dependency policy** —
  [CONTRIBUTING.md § Dependency Policy](CONTRIBUTING.md#dependency-policy)
- **Repo self-maintenance** —
  [CONTINUOUS_IMPROVEMENT.md](CONTINUOUS_IMPROVEMENT.md)
- **Environment, services, tasks** —
  [Operations Reference](website/docs/internals/operations/)
- **Supply chain & app security** —
  [security-audit skill](.claude/skills/security-audit)
- **Security update** — [security-update skill](.claude/skills/security-update)
- **Release readiness** —
  [release-readiness skill](.claude/skills/release-readiness)
- **Release review** — [release-review skill](.claude/skills/release-review)
- **Codegen pipeline** — [Codegen Internals](website/docs/internals/codegen/)
- **REPL API** — [librepl internals](website/docs/internals/librepl/)
- **Getting started (contributors)** —
  [website/docs/getting-started/contributors/](website/docs/getting-started/contributors/)

**External:**

- **Getting started (engineers)** —
  [website/docs/getting-started/engineers/](website/docs/getting-started/engineers/)
- **Getting started (leadership)** —
  [website/docs/getting-started/leadership/](website/docs/getting-started/leadership/)
- **User guides** — [website/docs/guides/](website/docs/guides/)
- **Published skills** — [.claude/skills/](.claude/skills/) (`fit-*` entries,
  externally consumable)
