# Forward Impact Engineering

> "The aim of leadership should be to improve the performance of [developers]
> and [agents], to improve quality, to increase output, and simultaneously to
> bring pride of workmanship to people."
>
> — W. Edwards Deming (paraphrased)

## Goal

Improve the performance of developers and agents, improve quality, increase
output, and bring pride of workmanship to engineering teams.

## Audiences

Three audiences use the system. Every product serves at least two.

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

| Product      | Question it answers                               | Audiences              | CLI            |
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

**Tech**: Node.js 18+, Plain JS + JSDoc, YAML, npm workspaces, no frameworks

## Structure

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
| Universe DSL   | `examples/universe.dsl`                      |
| Generated data | `data/` (output of `fit-universe`)           |
| JSON Schema    | `products/map/schema/json/`                  |
| RDF/SHACL      | `products/map/schema/rdf/`                   |
| Formatters     | `products/pathway/src/formatters/`           |
| KB template    | `products/basecamp/template/`                |
| KB skills      | `products/basecamp/template/.claude/skills/` |

## Core Rules

1. **Clean breaks** — Fully replace, never leave old and new coexisting. Delete
   old code, update all call sites, remove unused imports in one commit.
2. **No backward compatibility** — No shims, aliases, or feature flags for the
   old path. If there are no consumers yet, remove the old interface entirely —
   don't build bridges to code that doesn't exist.
3. **No defensive code** — Trust the architecture, let errors surface. No
   optional chaining for non-optional data, no try-catch "just to be safe."
4. **Simple over easy** — Reduce complexity, don't relocate it. Prefer explicit
   over implicit, direct solutions over clever abstractions, fewer layers.
5. **OO+DI everywhere** — All libraries and products use constructor-injected
   dependencies. No module-level singletons, no inline dependency creation, no
   default parameter fallbacks that silently create real dependencies.
   Constructors validate that all required deps are provided. Factory functions
   (`createXxx`) are the only place that wires real implementations. Tests
   bypass factories and inject mocks directly via constructors.
6. **JSDoc types** — All public functions (`@param`, `@returns`)
7. **Test coverage** — New logic requires tests
8. **No frameworks** — Vanilla JS only, ESM modules only
9. **Co-located files** — All entities have `human:` and `agent:` sections

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

## Environment Management

Environment is configured via layered `.env` files, loaded by `scripts/env.sh`:

```sh
# Load order (later files override earlier):
.env                      # Base: API credentials, service secrets
.env.{ENV}                # Network: local (localhost) or docker (container DNS)
.env.storage.{STORAGE}    # Storage: local, minio (S3), or supabase
.env.auth.{AUTH}           # Auth: none, gotrue, or supabase
```

Three variables control the environment stack:

| Variable  | Values                       | Default |
| --------- | ---------------------------- | ------- |
| `ENV`     | `local`, `docker`            | `local` |
| `STORAGE` | `local`, `minio`, `supabase` | `local` |
| `AUTH`    | `none`, `gotrue`, `supabase` | `none`  |

All `make` targets automatically load the correct env files. Pass overrides:

```sh
make rc-start                              # local env, local storage, no auth
make rc-start ENV=docker STORAGE=minio     # docker networking, MinIO storage
```

### Setup

```sh
make env-setup     # Reset from examples, generate secrets and storage creds
make env-reset     # Reset .env* and config files from *.example counterparts
make env-secrets   # Generate SERVICE_SECRET, JWT_SECRET, JWT_ANON_KEY
make env-storage   # Generate storage backend credentials
make env-github    # GitHub token utility (LLM_TOKEN, LLM_BASE_URL)
```

### LLM Testing

`LLM_TOKEN` and `LLM_BASE_URL` are always set in the environment (provided by
the hosting platform or `.env`). This means any code using `libconfig` to access
LLM credentials works out of the box — no extra setup is needed to test LLM
interactions locally or in CI.

## Configuration

`config/config.json` controls service startup and runtime behaviour:

- **`init.services`** — Ordered list of services for `fit-rc` to supervise (tei,
  trace, vector, graph, llm, memory, tool, agent, web)
- **`init.log_dir`** / **`init.shutdown_timeout`** — Logging and shutdown
- **`service.*`** — Per-service settings (model, temperature, max_tokens, tool
  filter thresholds, tool endpoints)
- **`evals`** — Evaluation models and judge model

`config/tools.yml` — Tool endpoint definitions (purpose, parameters, evaluation
criteria) used by the tool service.

`config/agents/*.agent.md` — Agent prompt files (planner, researcher, editor,
eval_judge). Reset from examples with `make config-reset`.

## Service Management

Services are supervised by `fit-rc` (via `libraries/librc/`). The service list
is defined in `config/config.json` under `init.services`.

```sh
npx fit-rc start              # Start all services (or: make rc-start)
npx fit-rc stop               # Graceful shutdown    (or: make rc-stop)
npx fit-rc restart            # Restart all          (or: make rc-restart)
npx fit-rc status             # Show service status  (or: make rc-status)
npx fit-rc start tei          # Start a single service
```

Services run on localhost in local mode (ports 3002–3008 for gRPC, 3001 for web,
8090 for TEI embeddings). Port mapping is in `.env.local`.

TEI (Text Embeddings Inference) provides local embeddings:

```sh
make tei-install              # Install via cargo (first time)
make tei-start                # Start TEI service (downloads model on first run)
```

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

## Vocabulary Standards

Use `npx fit-pathway level --list` to see available levels.

| Level          | Autonomy              | Scope                    | Verbs                             |
| -------------- | --------------------- | ------------------------ | --------------------------------- |
| `awareness`    | with guidance         | team                     | understand, follow, use, learn    |
| `foundational` | with minimal guidance | team                     | apply, create, explain, identify  |
| `working`      | independently         | team                     | design, own, troubleshoot, decide |
| `practitioner` | lead, mentor          | area (2–5 teams)         | lead, mentor, establish, evaluate |
| `expert`       | define, shape         | business unit / function | define, shape, innovate, pioneer  |

## Code Style

- **ESM only**, no CommonJS. JSDoc on all public functions.
- **Naming**: files `kebab-case`, functions `camelCase`, constants
  `UPPER_SNAKE_CASE`, YAML IDs `snake_case`
- **Testing**: Node.js test runner (`node --test`), fixtures mirror YAML

## Security

Security policies (pre-commit hooks, secret scanning, npm audit, ESLint security
rules, dependency hygiene) are defined in CONTRIBUTING.md. During development,
follow those rules. Additionally:

- **GitHub Actions** — All third-party actions are pinned to SHA hashes. Use
  `Dependabot` for updates. Never change a pin to a tag.
- **Reporting** — See `SECURITY.md`. Contact `hi.security@senzilla.io`.

## Policy Ownership

Each policy area has one canonical location. Other files reference it instead of
restating the rules. Update the canonical location only — if the same rule
appears in two places, remove the duplicate and add a reference.

| Policy area                          | Canonical location                       |
| ------------------------------------ | ---------------------------------------- |
| Security workflows (hooks, scanning) | CONTRIBUTING.md § Security Workflows     |
| Dependency hygiene                   | CONTRIBUTING.md § Dependency Policy      |
| PR checklist                         | CONTRIBUTING.md § Before Submitting a PR |
| GitHub Actions SHA pinning           | CLAUDE.md § Security                     |
| Supply chain & app security          | `.claude/skills/security-audit`          |
| Dependabot triage process            | `.claude/skills/dependabot-triage`       |

## Git Workflow

Format: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`
**Scope**: package name (`map`, `libskill`, `libui`, `pathway`, `basecamp`).
**Breaking**: add `!` after scope.

### Before Committing

1. Review with `git diff`
2. Group related changes into logical, atomic commits
3. Follow the PR checklist in CONTRIBUTING.md (check, audit, no secrets, deps)
   - `npm run check:fix` auto-fixes formatting and lint issues
4. Assess version impact (breaking=major, feat=minor, other=patch)
5. Stage and commit: `git commit -m "type(scope): subject"`
6. Push all commits to remote

**Always commit your work before finishing a task.**

### Releasing

**Tag prefix mapping** — tag prefix matches the directory name, not the npm
scope:

| Directory          | Tag prefix | Example tag         |
| ------------------ | ---------- | ------------------- |
| `libraries/libfoo` | `libfoo`   | `libfoo@v0.1.5`     |
| `products/pathway` | `pathway`  | `pathway@v0.25.0`   |
| `services/agent`   | `svcagent` | `svcagent@v0.1.110` |

**Version rules** — pre-1.0 packages (`0.x.y`) bump patch for any change.
Post-1.0 packages use semver: breaking=major, feat=minor, fix/refactor=patch.

**Finding changed packages:**

```sh
# For each package, compare latest tag to HEAD:
latest=$(git tag --sort=-creatordate --list "${prefix}@v*" | head -1)
git log "${latest}..HEAD" --oneline -- "${directory}"
```

**Release steps:**

1. Commit all pending code changes first (version bumps go in a separate commit)
2. Bump `version` in each changed `package.json`
3. Update cross-workspace deps when bumping a major version (e.g. pathway's dep
   on libskill: `^3.0.0` → `^4.0.0`)
4. Run `npm install --package-lock-only` to sync `package-lock.json`
5. Run `npm run check:fix` to ensure formatting and lint pass
6. Commit: `chore({pkg}): bump to {version}` (or batch:
   `chore: bump versions for release`)
7. Tag at the final commit: `git tag {pkg}@v{version}`
8. Push commits, then push each tag individually (not `--tags`)
9. Verify each workflow: `gh run list --limit <n>`

## Common Tasks

### Bootstrap (First Run)

```sh
npm install                   # Install all workspace dependencies
make quickstart               # Full bootstrap: env, generate, data, codegen, process
make rc-start                 # Start services (supabase/tei skipped if not installed)
```

### Generation

```sh
make generate                 # Cached prose (default, no LLM needed)
make generate-update          # Generate new prose via LLM and update cache
make generate-no-prose        # Structural only, no prose (minimal data)
```

Generation uses cached prose by default from `.prose-cache.json`. Use
`make generate-update` to call the LLM and refresh the cache. The `no-prose`
mode produces minimal structural data without prose content.

### Development

```sh
npm run dev                   # Development server
npx fit-pathway dev           # Pathway dev server
npx fit-pathway build --url=X # Static site + install bundle
npx fit-basecamp --init ~/Dir # Initialize knowledge base
npx fit-basecamp --daemon     # Run scheduler
```

### Processing & Services

```sh
make process                  # Process all resources (agents, tools, vectors, graphs)
make process-fast             # Process without vectors (no TEI required)
make rc-start                 # Start all services
make rc-stop                  # Stop all services
make rc-status                # Service health check
```

### Quality

```sh
npm run check                 # Format, lint, test, validate (run before committing)
npm run check:fix             # Auto-fix format and lint issues
npm run format                # Check Prettier formatting
npm run format:fix            # Auto-fix Prettier formatting
npm run lint                  # Check ESLint linting
npm run lint:fix              # Auto-fix ESLint issues
npm run test                  # Unit tests (node --test)
npm run test:e2e              # Playwright E2E tests (requires generated data)
npx fit-map validate          # Validate data files
npx fit-map validate --shacl  # Validate with SHACL syntax check
```

### Infrastructure

```sh
make codegen                  # Generate types, services, clients from proto/
make env-setup                # Initialize environment from examples
make data-init                # Create data dirs, copy example data to data/knowledge/
make config-reset             # Reset config files from examples
```

See each product's skill file for full CLI reference.
