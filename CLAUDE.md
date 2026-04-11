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

### Checklists

Tagged checklists act as gates at natural pause points. Follow the protocol
whenever you encounter one. Design and authoring rules:
[CHECKLISTS.md](CHECKLISTS.md).

- **`<read_do_checklist>`** — Entry gate. Read each item, then do it.
- **`<do_confirm_checklist>`** — Exit gate. Do from memory, then confirm every
  item before crossing a boundary (commit, merge, publish).

**Every contribution** must run both universal checklists:
[CONTRIBUTING.md § READ-DO](CONTRIBUTING.md#read-do) (before starting) and
[§ DO-CONFIRM](CONTRIBUTING.md#do-confirm) (before committing). Domain-specific
checklists live in `.claude/skills/gemba-*/SKILL.md`. Discover all checklists
repo-wide:

```sh
rg '<read_do_checklist'     # all entry gates
rg '<do_confirm_checklist'  # all exit gates
```

## LLM Environment

If `LLM_TOKEN` is not set in `.env` it will **always** be set in the shell
environment. Testers or contributors never need to generate or configure an LLM
key — `libconfig` reads `LLM_TOKEN` and `LLM_BASE_URL` from the process
environment, so testing with an LLM will always "just work".

## Structure

### Monorepo layout

```
products/
  map/       # fit-map — data product, validation, schema, starter YAML
  pathway/   # fit-pathway — web app, CLI, formatters
  basecamp/  # fit-basecamp — knowledge system, scheduler, macOS app
  guide/     # fit-guide — LLM agent, artifact interpretation
libraries/
  lib*/      # shared infrastructure and domain libraries
services/
  agent/ graph/ llm/ memory/ pathway/ tool/ trace/ vector/ web/
config/
  config.json  # service definitions, model settings, eval config
  tools.yml    # tool endpoint definitions
  agents/      # agent prompt files (*.agent.md)
data/
  synthetic/   # synthetic data DSL and generated artifacts
specs/
  {feature}/   # feature specifications and plans
wiki/          # GitHub wiki submodule — shared agent memory
website/       # public site content and docs
```

Git tracks `*.example.*` templates in `config/` — the live files above are
gitignored and created from examples during setup.

Data-driven: entities defined in YAML, each external installation may have
completely different framework data while using the same product code.

### Per-package layout

Every package under `products/`, `services/`, and `libraries/` follows the same
on-disk shape (spec 390). Source files live under `src/`; the package root
carries only metadata, declared CLI binaries, and published non-source assets.

```
<package>/
  package.json     Required
  justfile         Per-package task runner (optional)
  src/             All source files (index.js + any domain subdirs)
  bin/             One file per declared CLI binary — thin entry points only
  config/          Checked-in configuration files (optional)
  macos/           Packaged macOS app bundle, if the package ships one (optional)
  pkg/             Packaging / distribution artifacts, non-source (optional)
  proto/           Protobuf source files (optional)
  schema/          Published schemas (JSON Schema, SHACL, etc.) (optional)
  starter/         Starter data that installs to a consumer's data dir (optional)
  supabase/        Supabase edge project (optional)
  templates/       Template files consumed at runtime (optional)
  test/            Test files
```

Any directory at the package root must be one of: `bin/`, `config/`, `macos/`,
`pkg/`, `proto/`, `schema/`, `src/`, `starter/`, `supabase/`, `templates/`,
`test/`. Anything else fails `bun run layout`. Source files live under `src/` —
no `.js` or `.ts` files at the package root.

`bin/` holds one file per declared CLI binary and nothing else (no
subdirectories, no shared helpers). Each entry is a thin script that parses argv
and hands off to code in `src/`. CLI subcommand handlers live under
`src/commands/` and package-internal helpers live under `src/lib/`.

Published `package.json` `main`, `bin`, and `exports` fields point directly at
files under `src/`. Consumers import via subpath aliases
(`@forwardimpact/libskill/derivation`) which the `exports` map resolves to
`./src/derivation.js`. There is no publish-time build step and no root-level
proxy file.

### Services — the one exception

Services keep `index.js` and `server.js` at the package root because the runtime
supervisor and service harness load them by fixed path from
`config/config.example.json`. Any additional service source files live under
`src/`. Services do not have a `bin/` directory and do not have `src/index.js`.

```
services/<name>/
  index.js   # Service definition / exports (fixed path)
  server.js  # Entry point for the service process (fixed path)
  proto/     # Protobuf source (optional — services/web is HTTP-only)
  src/       # Any additional source files used by index.js/server.js
  test/
  package.json
```

### Per-package `justfile`

A package may carry its own `justfile` at the root for meaningful package-local
task targets (for example `products/basecamp/justfile`). The top-level
`justfile` remains the primary entry point; per-package `justfile` files
complement it.

### Enforcement

`bun run layout` (powered by `scripts/check-package-layout.js`) enforces the
allowed-root-subdirs contract in strict mode. `bun run check:exports` (powered
by `scripts/check-exports-resolve.js`) asserts that every published `main`,
`bin`, and `exports` target resolves to a real file. Both run as part of
`bun run check` and in the `check-quality` CI workflow.

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

- **`libs-grpc-services`** — librpc, libconfig, libtelemetry, libtype,
  libharness
- **`libs-storage`** — libstorage, libindex, libresource, libpolicy, libgraph,
  libvector
- **`libs-llm-and-agents`** — libllm, libmemory, libprompt, libagent, libtool
- **`libs-content`** — libui, libformat, libweb, libdoc, libtemplate
- **`libs-cli-and-tooling`** — libcli, librepl, libutil, libsecret,
  libsupervise, librc, libcodegen, libeval
- **`libs-synthetic-data`** — libsyntheticgen, libsyntheticprose,
  libsyntheticrender, libuniverse

`libskill` retains its own skill (pure-function design, exempt from OO+DI).

## Domain Concepts

Framework entities are defined in YAML under
[products/map/starter/](products/map/starter/) (the monorepo's starter template,
which installs to `data/pathway/` in consuming projects). Use
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
- **Repo self-maintenance** — [GEMBA.md](GEMBA.md)
- **Shared agent memory** — [wiki/](wiki/) (GitHub wiki submodule; gemba agents
  read and write per-agent summaries and weekly logs here)
- **Environment, services, tasks** —
  [Operations Reference](website/docs/internals/operations/)
- **Supply chain & app security** —
  [gemba-security-audit skill](.claude/skills/gemba-security-audit)
- **Security update** —
  [gemba-security-update skill](.claude/skills/gemba-security-update)
- **Release readiness** —
  [gemba-release-readiness skill](.claude/skills/gemba-release-readiness)
- **Release review** —
  [gemba-release-review skill](.claude/skills/gemba-release-review)
- **Documentation review** —
  [gemba-documentation skill](.claude/skills/gemba-documentation)
- **Wiki curation** —
  [gemba-wiki-curate skill](.claude/skills/gemba-wiki-curate)
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
