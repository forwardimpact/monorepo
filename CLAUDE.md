# Forward Impact Engineering

> "The aim of leadership should be to improve the performance of [developers]
> and [agents], to improve quality, to increase output, and simultaneously to
> bring pride of workmanship to people."
>
> — W. Edwards Deming (paraphrased)

## Goal

Improve the performance of developers and agents, improve quality, increase
output, and bring pride of workmanship to engineering teams.

## Users

Three user groups use the system. Every product serves at least two.

- **Leadership** — Define what good engineering looks like, staff teams to
  succeed, and measure outcomes without blaming individuals.
- **Developers** — Understand expectations, find growth areas, stay prepared for
  daily work, and receive guidance grounded in their organization's framework.
- **Agents** — Operate with the same shared definitions, skill markers, and
  quality standards that humans use, so human–agent collaboration is coherent.

## Products

Six products provide the means. The design follows Deming throughout: **Map**
establishes operational definitions so "good engineering" means something
concrete. **Pathway** and **Guide** build quality in at the point of work rather
than inspecting it in after the fact. **Landmark** measures the system's outputs
without blaming individuals. **Summit** treats the team as a system, not a
collection of parts. All six share one data model and one dependency chain —
constancy of purpose in architecture.

| Product      | Question it answers                               | Users                  | CLI            |
| ------------ | ------------------------------------------------- | ---------------------- | -------------- |
| **Map**      | What does good engineering look like here?        | Leadership, Agents     | `fit-map`      |
| **Pathway**  | Where does my career path go from here?           | Developers, Agents     | `fit-pathway`  |
| **Basecamp** | Am I prepared for what's ahead today?             | Developers, Agents     | `fit-basecamp` |
| **Guide**    | How do I find my bearing?                         | Developers             | `fit-guide`    |
| **Landmark** | What milestones has my engineering reached?       | Leadership, Developers | `fit-landmark` |
| **Summit**   | Is this team supported to reach peak performance? | Leadership             | `fit-summit`   |

**Map** is the data product that provides shared context for every product in
the suite. Teams define their engineering framework once — skills, levels,
behaviours, markers — import operational signals continuously (organization
hierarchy, GitHub activity, GetDX snapshots), and publish that data for
consumption by humans and agents. Leadership authors the definitions; agents
consume them as operational context.

**Pathway** is the interface to the engineering framework — a web app, CLI, and
static site generator. Feed it a discipline, track, and level and it produces a
complete job definition. It generates agent teams and skills to support and
empower the engineers, VS Code agent profiles, and interview question sets.
Developers see their career path; agents receive the skill definitions they work
against.

**Basecamp** is a personal operations center. It syncs email and calendar,
builds a knowledge graph of people, projects, and topics, drafts responses,
prepares meeting briefings, and organizes files — all running as scheduled AI
tasks in the background with a macOS status menu. Developers stay prepared;
agents handle the background work.

**Guide** is an AI agent that understands your organization's engineering
framework — skills, levels, behaviours, and expectations — and reasons about
them in context. It helps developers onboard, find growth areas, and interpret
engineering artifacts against skill markers.

**Landmark** is the analysis layer for engineering-system signals. It combines
objective marker evidence from GitHub artifacts with subjective outcomes from
GetDX snapshots, then presents team-level and individual views grounded in your
framework. Leadership sees system outcomes; developers see their own progress.
No LLM calls — query, aggregate, explain.

**Summit** treats a team as a system, not a collection of individuals. It
aggregates skill matrices into capability coverage, structural risks, and
what-if staffing scenarios so leadership can build teams that succeed. Fully
local and deterministic — no external dependencies, no LLM calls.

## Required Development Workflow

- **[CONTRIBUTING.md](CONTRIBUTING.md)** — Pull request workflow, git
  conventions, quality commands, and security policies. **Read before your first
  commit.**
- **[Operations Reference](website/docs/internals/operations/index.md)** —
  Environment setup, service management, and common tasks.

Commit format: `type(scope): subject` — see CONTRIBUTING.md § Git Conventions.

Run `npm run check` before every commit to catch format, lint, and test failures
early.

## Policy Ownership

Each policy area has one canonical location. Other files reference it, never
restate it. Update the canonical location only.

| Policy area                          | Canonical location                   |
| ------------------------------------ | ------------------------------------ |
| Core rules & architecture            | CLAUDE.md                            |
| Development workflow & practices     | CONTRIBUTING.md                      |
| Environment, services, tasks         | `website/docs/internals/operations/` |
| Security workflows (hooks, scanning) | CONTRIBUTING.md § Security           |
| Dependency hygiene                   | CONTRIBUTING.md § Dependency Policy  |
| GitHub Actions SHA pinning           | CONTRIBUTING.md § Security           |
| Supply chain & app security          | `.claude/skills/security-audit`      |
| Dependabot triage process            | `.claude/skills/dependabot-triage`   |
| Release readiness (PR rebase/CI)     | `.claude/skills/release-readiness`   |
| Release process (versioning/tags)    | `.claude/skills/release-review`      |

## Distribution Model

The monorepo is open source — the repository is public and the products are
designed for external consumption. Organizations install Pathway, Map, and other
products in their own environments, bringing their own framework data. Coding
agents at those installations drive the CLIs (`fit-map`, `fit-pathway`, etc.).

Skills in `.claude/skills/` serve two distinct purposes:

- **Internal skills** (library groups like `libs-*`, product internals) help
  contributors to the monorepo understand architecture and make changes.
- **Published skills** (`fit-*`) help users and agents at external installations
  understand how the products **work** — not how they are **implemented**. These
  skills link to documentation for progressive disclosure, not to source code.

## Structure

**Tech**: Node.js 18+, Plain JS + JSDoc, YAML, npm workspaces, no frameworks

```
products/
  map/          Data product, validation          (fit-map)
  pathway/      Web app, CLI, formatters          (fit-pathway)
  basecamp/     Knowledge system, scheduler       (fit-basecamp)
  guide/        LLM agent, artifact interpretation
  landmark/     Signal analysis on Map data       (fit-landmark)
  summit/       Team capability as a system        (fit-summit)
libraries/
  libskill/     Derivation logic, job/agent models
  libuniverse/  Synthetic data DSL and generation  (fit-universe)
  libui/        Web UI framework, components, CSS
  libdoc/       Documentation build/serve         (fit-doc)
services/
  agent/ graph/ llm/ memory/ tool/ trace/ vector/ web/
config/
  config.json   Service definitions, model settings, eval config
  tools.yml     Tool endpoint definitions
  agents/       Agent prompt files (*.agent.md)
specs/
  {feature}/    Feature specifications and plans
```

**Data-driven monorepo.** Entities (disciplines, tracks, skills, levels,
behaviours) are defined in YAML files. Different installations may have
completely different data while using the same model.

### Dependency Chain

```
map → libskill → pathway
      libui   ↗
         libskill → summit

map → guide → landmark
```

- **Map → libskill → Pathway**: schema, data, derivation, formatters.
- **libskill → Summit**: aggregates individual skill matrices into team views.
- **Map → Guide → Landmark**: Map stores data, Guide interprets artifacts
  against markers, Landmark presents evidence and snapshots.

When updating data structure: schema (`products/map/schema/`) → data
(`data/pathway/`) → derivation (`libraries/libskill/`) → formatters
(`products/pathway/src/formatters/`). All in the same commit.

### Key Paths

| Purpose        | Location                                     |
| -------------- | -------------------------------------------- |
| Pathway data   | `data/pathway/`                              |
| Repo config    | `data/pathway/repository/`                   |
| Story DSL      | `data/synthetic/story.dsl`                   |
| Prose cache    | `data/synthetic/prose-cache.json`            |
| Generated data | `data/` (output of `fit-universe`)           |
| JSON Schema    | `products/map/schema/json/`                  |
| RDF/SHACL      | `products/map/schema/rdf/`                   |
| Formatters     | `products/pathway/src/formatters/`           |
| KB template    | `products/basecamp/template/`                |
| KB skills      | `products/basecamp/template/.claude/skills/` |

## OO+DI Architecture

Every library and product follows a standard pattern:

- **Classes** accept all collaborators through the constructor
- **Constructors** throw if required deps are missing
- **Factory functions** (`createXxx`) wire real implementations
- **Composition roots** (CLI `bin/` entry points) create and wire all instances
- **Tests** bypass factories and inject mocks directly via constructors

**Exceptions:** libskill (pure functions by design), libui (functional DOM),
libsecret (stateless crypto utilities), libtype (generated protobuf code). Pure
stateless functions (hashing, token counting, validation) do not need DI.

### Library Examples

| Library      | Classes                                                                                                                           | Factory                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| libsupervise | `SupervisionTree`                                                                                                                 | `createSupervisionTree`                                                           |
| libutil      | `Finder`, `BundleDownloader`, `TarExtractor`, `Retry`                                                                             | `createBundleDownloader`, `createRetry`                                           |
| libuniverse  | `DslParser`, `EntityGenerator`, `ProseEngine`, `PathwayGenerator`, `Renderer`, `ContentValidator`, `ContentFormatter`, `Pipeline` | `createDslParser`, `createEntityGenerator`, `createProseEngine`, `createRenderer` |

Pure functions in libutil (`generateHash`, `generateUUID`, `countTokens`,
`parseJsonBody`) and libuniverse (`collectProseKeys`, `loadSchemas`) remain
standalone — they have no state or I/O to inject.

I/O wrappers in libutil require explicit deps:
`updateEnvFile(path, key, value, fsFns)`, `execLine(shift, deps)`,
`waitFor(fn, options)`.

### Product Examples

| Product  | Classes                                                                 | Composition Root     |
| -------- | ----------------------------------------------------------------------- | -------------------- |
| map      | `DataLoader`, `SchemaValidator`, `IndexGenerator`                       | `bin/fit-map.js`     |
| pathway  | Uses `createDataLoader`, `createTemplateLoader` from libraries          | `bin/fit-pathway.js` |
| basecamp | `StateManager`, `AgentRunner`, `Scheduler`, `KBManager`, `SocketServer` | `src/basecamp.js`    |

Basecamp uses a local `createLogger(logDir, fs)` function (not libtelemetry)
since it is a user-facing CLI tool. The composition root wires StateManager →
AgentRunner → Scheduler → SocketServer with explicit dependency passing.

## Skill Groups

Library skills are organized into 5 capability groups (not individual library
skills). Each group has a corresponding skill file (`.claude/skills/`) with
decision guides, composition recipes, and DI wiring patterns.

| Group                         | Libraries                                                         |
| ----------------------------- | ----------------------------------------------------------------- |
| `libs-service-infrastructure` | librpc, libconfig, libtelemetry, libtype, libharness              |
| `libs-data-persistence`       | libstorage, libindex, libresource, libpolicy, libgraph, libvector |
| `libs-llm-orchestration`      | libllm, libmemory, libprompt, libagent                            |
| `libs-web-presentation`       | libui, libformat, libweb, libdoc, libtemplate                     |
| `libs-system-utilities`       | libutil, libsecret, libsupervise, librc, libcodegen               |
| `libs-synthetic-data`         | libsyntheticgen, libsyntheticprose, libsyntheticrender            |

`libskill` retains its own individual skill (pure-function design, intentionally
exempt from OO+DI).

## Domain Concepts

> Entities are defined in YAML under `data/pathway/`. Use
> `npx fit-pathway <entity> --list` to discover available values.

### Core Entities

| Entity       | File Location                      |
| ------------ | ---------------------------------- |
| Disciplines  | `disciplines/{id}.yaml`            |
| Levels       | `levels.yaml`                      |
| Tracks       | `tracks/{id}.yaml`                 |
| Capabilities | `capabilities/{id}.yaml`           |
| Skills       | `capabilities/{id}.yaml` (skills:) |
| Behaviours   | `behaviours/{id}.yaml`             |
| Stages       | `stages.yaml`                      |
| Drivers      | `drivers.yaml`                     |

All entities use co-located `human:` and `agent:` sections. Skills with `agent:`
sections generate SKILL.md files for AI coding agents.

### Key Concepts

- **Skill proficiencies**: awareness → foundational → working → practitioner →
  expert
- **Behaviour maturities**: emerging → developing → practicing → role_modeling →
  exemplifying
- **Disciplines** define role types (professional/management) with T-shaped
  skill tiers (core/supporting/broad)
- **Tracks** are pure modifiers — adjust skill/behaviour expectations via
  `skillModifiers` per capability
- **Capabilities** group skills, define responsibilities, and provide stage
  handoff checklists
- **Stages** define lifecycle phases with constraints, handoffs, and checklists
- **Tools** are derived from `toolReferences` in skills at runtime via
  `npx fit-pathway tool`

Validate data: `npx fit-map validate`

### Vocabulary Standards

Use `npx fit-pathway level --list` to see available levels.

| Level          | Autonomy              | Scope                    | Verbs                             |
| -------------- | --------------------- | ------------------------ | --------------------------------- |
| `awareness`    | with guidance         | team                     | understand, follow, use, learn    |
| `foundational` | with minimal guidance | team                     | apply, create, explain, identify  |
| `working`      | independently         | team                     | design, own, troubleshoot, decide |
| `practitioner` | lead, mentor          | area (2–5 teams)         | lead, mentor, establish, evaluate |
| `expert`       | define, shape         | business unit / function | define, shape, innovate, pioneer  |
