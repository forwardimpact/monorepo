# Forward Impact Engineering

**Pathway** defines skills, behaviours, and career paths for human engineers and
AI coding agents. **Basecamp** gives every engineer a personal knowledge system
powered by scheduled AI tasks.

**Tech**: Node.js 18+, Plain JS + JSDoc, YAML, npm workspaces, no frameworks

## Structure

```
products/
  pathway/      Web app, CLI, formatters          (fit-pathway)
  basecamp/     Knowledge system, scheduler       (fit-basecamp)
  map/          Data model, validation            (fit-map)
libraries/
  libskill/     Derivation logic, job/agent models
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
```

When updating data structure: schema (`products/map/schema/`) → examples
(`products/map/examples/`) → derivation (`libraries/libskill/`) → formatters
(`products/pathway/src/formatters/`). All in the same commit.

### Key Paths

| Purpose      | Location                                     |
| ------------ | -------------------------------------------- |
| User data    | `data/`                                      |
| Example data | `examples/`                                  |
| JSON Schema  | `products/map/schema/json/`                  |
| RDF/SHACL    | `products/map/schema/rdf/`                   |
| Formatters   | `products/pathway/src/formatters/`           |
| KB template  | `products/basecamp/template/`                |
| KB skills    | `products/basecamp/template/.claude/skills/` |

## Core Rules

1. **Clean breaks** — Fully replace, never leave old and new coexisting.
   Delete old code, update all call sites, remove unused imports in one commit.
2. **No defensive code** — Trust the architecture, let errors surface. No
   optional chaining for non-optional data, no try-catch "just to be safe."
3. **Simple over easy** — Reduce complexity, don't relocate it. Prefer explicit
   over implicit, direct solutions over clever abstractions, fewer layers.
4. **Pure functions** — Model layer has no side effects
5. **Use formatters** — All presentation logic in
   `products/pathway/src/formatters/`
6. **No transforms in views** — Pages/commands pass raw entities to formatters
7. **JSDoc types** — All public functions (`@param`, `@returns`)
8. **Test coverage** — New derivation logic requires tests
9. **No frameworks** — Vanilla JS only, ESM modules only
10. **Co-located files** — All entities have `human:` and `agent:` sections

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

| Variable  | Values                        | Default |
| --------- | ----------------------------- | ------- |
| `ENV`     | `local`, `docker`             | `local` |
| `STORAGE` | `local`, `minio`, `supabase`  | `local` |
| `AUTH`    | `none`, `gotrue`, `supabase`  | `none`  |

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

## Configuration

`config/config.json` controls service startup and runtime behaviour:

- **`init.services`** — Ordered list of services for `fit-rc` to supervise
  (tei, trace, vector, graph, llm, memory, tool, agent, web)
- **`init.log_dir`** / **`init.shutdown_timeout`** — Logging and shutdown
- **`service.*`** — Per-service settings (model, temperature, max_tokens,
  tool filter thresholds, tool endpoints)
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

Services run on localhost in local mode (ports 3002–3008 for gRPC, 3001 for
web, 8090 for TEI embeddings). Port mapping is in `.env.local`.

TEI (Text Embeddings Inference) provides local embeddings:

```sh
make tei-install              # Install via cargo (first time)
make tei-start                # Start TEI service (downloads model on first run)
```

## Domain Concepts

> Entities are defined in YAML under `products/map/examples/`. Use
> `npx fit-pathway <entity> --list` to discover available values.

### Core Entities

| Entity         | File Location                      |
| -------------- | ---------------------------------- |
| Disciplines    | `disciplines/{id}.yaml`            |
| Levels         | `levels.yaml`                      |
| Tracks         | `tracks/{id}.yaml`                 |
| Capabilities   | `capabilities/{id}.yaml`           |
| Skills         | `capabilities/{id}.yaml` (skills:) |
| Behaviours     | `behaviours/{id}.yaml`             |
| Stages         | `stages.yaml`                      |
| Drivers        | `drivers.yaml`                     |

All entities use co-located `human:` and `agent:` sections. Skills with
`agent:` sections generate SKILL.md files for AI coding agents.

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

| Level          | Autonomy              | Scope                    | Verbs                               |
| -------------- | --------------------- | ------------------------ | ----------------------------------- |
| `awareness`    | with guidance         | team                     | understand, follow, use, learn      |
| `foundational` | with minimal guidance | team                     | apply, create, explain, identify    |
| `working`      | independently         | team                     | design, own, troubleshoot, decide   |
| `practitioner` | lead, mentor          | area (2–5 teams)         | lead, mentor, establish, evaluate   |
| `expert`       | define, shape         | business unit / function | define, shape, innovate, pioneer    |

## Code Style

- **ESM only**, no CommonJS. JSDoc on all public functions.
- **Naming**: files `kebab-case`, functions `camelCase`, constants
  `UPPER_SNAKE_CASE`, YAML IDs `snake_case`
- **Testing**: Node.js test runner (`node --test`), fixtures mirror YAML
- **Formatters** per entity: `shared.js` (logic), `dom.js` (web), `markdown.js`
  (CLI)

## Git Workflow

Format: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`
**Scope**: package name (`map`, `libskill`, `libui`, `pathway`, `basecamp`).
**Breaking**: add `!` after scope.

### Before Committing

1. Review with `git diff`
2. Group related changes into logical, atomic commits
3. Run `npm run check` and fix issues related to your changes
4. Assess version impact (breaking=major, feat=minor, other=patch)
5. Stage and commit: `git commit -m "type(scope): subject"`
6. Push all commits to remote

**Always commit your work before finishing a task.**

### Releasing

1. Bump version in `package.json`, update downstream deps (minor/major only)
2. Commit: `chore({pkg}): bump to {version}`
3. Tag at the final commit: `git tag {pkg}@v{version}`
4. Push commits, then push each tag individually (not `--tags`)
5. Verify each workflow: `gh run list --limit <n>`

## Common Tasks

```sh
npm run dev                   # Development server
npm run check                 # Format, lint, test, SHACL
npm run check:fix             # Auto-fix format and lint
npm run test                  # Unit tests
npm run test:e2e              # Playwright E2E tests
npx fit-map validate          # Validate data files
npx fit-pathway dev           # Pathway dev server
npx fit-pathway build --url=X # Static site + install bundle
npx fit-basecamp --init ~/Dir # Initialize knowledge base
npx fit-basecamp --daemon     # Run scheduler
make rc-start                 # Start all services
make rc-status                # Service health check
make process                  # Process all resources (agents, tools, vectors, graphs)
make codegen                  # Generate types, services, clients from proto/
make env-setup                # Initialize environment from examples
```

See each product's skill file for full CLI reference.
