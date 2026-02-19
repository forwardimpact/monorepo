# Forward Impact Engineering

## Vision

> "The aim of leadership should be to improve the performance of man and
> machine, to improve quality, to increase output, and simultaneously to bring
> pride of workmanship to people."
>
> — W. Edwards Deming

**Pathway** defines skills, behaviours, and career paths for human engineers and
AI coding agents alike. **Basecamp** gives every engineer a personal knowledge
system powered by scheduled AI tasks. Together, they raise quality, increase
output, and bring pride of workmanship to engineering teams.

## Monorepo Structure

### Products

| Product                   | CLI            | Purpose                                           |
| ------------------------- | -------------- | ------------------------------------------------- |
| `@forwardimpact/pathway`  | `fit-pathway`  | Web app and CLI for career progression            |
| `@forwardimpact/basecamp` | `fit-basecamp` | Personal knowledge system with scheduled AI tasks |
| `@forwardimpact/map`      | `fit-map`      | Public data model for AI agents and engineers     |

### Libraries

| Library                     | CLI       | Purpose                                |
| --------------------------- | --------- | -------------------------------------- |
| `@forwardimpact/libpathway` | —         | Derivation engine for roles and agents |
| `@forwardimpact/libdoc`     | `fit-doc` | Documentation build and serve tools    |

```
products/
  pathway/      Web app, CLI, formatters
  basecamp/     Personal knowledge system, scheduler
  map/          Public data model for AI agents and engineers
libs/
  libpathway/   Derivation logic, job/agent models
  libdoc/       Documentation build and serve tools
```

**This is a data-driven monorepo.** The model layer defines derivation logic,
but actual entities (disciplines, tracks, skills, grades, behaviours) are
defined entirely in YAML files. Different installations may have completely
different data while using the same model.

**Tech**: Node.js 18+, Plain JS + JSDoc, YAML, npm workspaces, no frameworks

## 3-Layer System

1. **Map** (`products/map/src/`) — Public data model, validation, loading
2. **Model** (`libs/libpathway/src/`) — Pure business logic, derivation
3. **Presentation** (`products/pathway/src/`) — Formatters, views, UI components

```
Map (data) → Model (derivation) → Presentation (display)
```

- **Map** publishes the data model and validates entities
- **Model** transforms entities into derived outputs (jobs, agents)
- **Presentation** formats outputs for display (web, CLI, markdown)

### Key Paths

| Purpose      | Location                                     |
| ------------ | -------------------------------------------- |
| User data    | `data/`                                      |
| Example data | `products/map/examples/`                     |
| JSON Schema  | `products/map/schema/json/`                  |
| RDF/SHACL    | `products/map/schema/rdf/`                   |
| Derivation   | `libs/libpathway/src/`                       |
| Formatters   | `products/pathway/src/formatters/`           |
| Templates    | `products/pathway/templates/`                |
| Scheduler    | `products/basecamp/basecamp.js`              |
| KB template  | `products/basecamp/template/`                |
| KB skills    | `products/basecamp/template/.claude/skills/` |

### Dependency Chain

```
map → libpathway → pathway
```

When updating data structure, change:

1. `products/map/schema/json/` and `rdf/` — Schema definitions (both formats,
   same commit)
2. `products/map/examples/` — Example data
3. `libs/libpathway/src/` — Derivation logic if needed
4. `products/pathway/src/formatters/` — Presentation if needed

## Core Rules

1. **Clean breaks** - Fully replace, never leave old and new coexisting
2. **No defensive code** - Trust the architecture, let errors surface
3. **Pure functions** - Model layer has no side effects
4. **Use formatters** - All presentation logic in
   `products/pathway/src/formatters/`
5. **No transforms in views** - Pages/commands pass raw entities to formatters
6. **JSDoc types** - All public functions
7. **Test coverage** - New derivation logic requires tests
8. **No frameworks** - Vanilla JS only
9. **ESM modules** - No CommonJS
10. **Conventional commits** - `type(scope): subject`
11. **Co-located files** - All entities have `human:` and `agent:` sections in
    the same file

## Simple vs Easy

**Distinguish easy (hiding complexity) from simple (reducing complexity). Always
prioritize simple.**

- **Easy** = convenient now, complexity hidden (abstractions, wrappers, magic)
- **Simple** = fewer moving parts, less to understand (composition, directness)

ALWAYS:

- Reduce total complexity, don't just relocate it
- Prefer explicit over implicit
- Choose direct solutions over clever abstractions
- Fewer layers, fewer indirections

NEVER:

- Add abstraction just to hide complexity
- Create "easy" APIs that obscure what's happening
- Trade long-term simplicity for short-term convenience

## Clean Breaks

**When changing code, fully replace—never leave old and new coexisting.**

ALWAYS:

- Replace completely in one change
- Delete old code immediately
- Update all call sites in the same commit
- Remove unused imports, functions, and files

NEVER:

- Keep old code "just in case"
- Add compatibility shims or adapters
- Leave TODO comments for later cleanup
- Comment out old implementations
- Create wrapper functions to support both old and new

**Why:** Coexisting code paths create confusion, increase maintenance burden,
and hide bugs. A clean break is easier to review, test, and understand.

## No Defensive Code

**Trust the architecture. Don't guard against problems that shouldn't happen.**

ALWAYS:

- Let errors surface loudly and immediately
- Trust that callers pass valid data
- Rely on TypeScript/JSDoc for type safety
- Use assertions for invariants during development

NEVER:

- Optional chaining unless data is genuinely optional
- Try-catch "just to be safe"
- Null checks for data that should always exist
- Fallback values that mask real problems
- Silently swallow errors or return defaults

**Why:** Defensive code hides bugs instead of fixing them. When something is
wrong, fail fast and fix the root cause. Silent failures are harder to debug
than loud ones.

## Domain Concepts

> **Data-Driven Model**: The model defines schema and derivation logic, but
> actual entities are defined in YAML files under `products/map/examples/`. Use
> `npx fit-pathway <entity> --list` to discover what's available.

### Core Entities

| Entity           | Question                  | File Location                       |
| ---------------- | ------------------------- | ----------------------------------- |
| **Disciplines**  | What kind of engineer?    | `disciplines/{id}.yaml`             |
| **Grades**       | What career level?        | `grades.yaml`                       |
| **Tracks**       | Where/how do you work?    | `tracks/{id}.yaml`                  |
| **Skills**       | What can you do?          | `capabilities/{id}.yaml` (skills:)  |
| **Behaviours**   | How do you approach work? | `behaviours/{id}.yaml`              |
| **Capabilities** | What capability area?     | `capabilities/{id}.yaml`            |
| **Stages**       | What lifecycle phase?     | `stages.yaml`                       |
| **Drivers**      | What outcomes matter?     | `drivers.yaml`                      |
| **Tools**        | What utilities to use?    | Derived from skill `toolReferences` |

All entities use **co-located files** with `human:` and `agent:` sections.

### Skill Levels

| Level          | Description                           |
| -------------- | ------------------------------------- |
| `awareness`    | Learning fundamentals, needs guidance |
| `foundational` | Can apply basics independently        |
| `working`      | Solid competence, handles ambiguity   |
| `practitioner` | Deep expertise, leads and mentors     |
| `expert`       | Authority, shapes org direction       |

### Skill Structure

Skills are defined within capability files and include:

| Property                  | Required | Description                                             |
| ------------------------- | -------- | ------------------------------------------------------- |
| `id`                      | Yes      | Unique identifier (snake_case)                          |
| `name`                    | Yes      | Human-readable name                                     |
| `human`                   | Yes      | Human-specific content (description, levelDescriptions) |
| `agent`                   | No       | Agent-specific content for AI skill generation          |
| `toolReferences`          | No       | Required tools with usage guidance                      |
| `implementationReference` | No       | Code examples shared by human and agent                 |
| `isHumanOnly`             | No       | If true, excluded from agent profiles                   |

#### Agent Skill Sections

Skills with `agent:` sections generate SKILL.md files for AI coding agents:

```yaml
agent:
  name: skill-name-kebab-case # Required, kebab-case
  description: Brief description
  useWhen: When to apply this skill
  stages:
    plan:
      focus: What to accomplish
      activities: [...]
      ready: [...]
    code:
      focus: ...
```

Stage-specific guidance includes: `specify`, `plan`, `code`, `review`, `deploy`.

### Tools

Tools are derived from `toolReferences` arrays within skills. They aggregate
required utilities across all skills with guidance on when to use them.

| Property      | Required | Description                |
| ------------- | -------- | -------------------------- |
| `name`        | Yes      | Tool name                  |
| `description` | Yes      | What the tool does         |
| `useWhen`     | Yes      | When to use this tool      |
| `url`         | No       | Link to tool documentation |

Tools are not stored separately—they're extracted and aggregated from skills at
runtime via `npx fit-pathway tool`.

### Behaviour Maturities

| Maturity        | Description                       |
| --------------- | --------------------------------- |
| `emerging`      | Shows interest, needs prompting   |
| `developing`    | Regular practice with guidance    |
| `practicing`    | Consistent application, proactive |
| `role_modeling` | Influences team culture           |
| `exemplifying`  | Shapes organizational culture     |

### Capabilities

Capabilities group skills and define:

- **Track modifiers**: Level adjustments to all skills in a capability
- **Responsibilities**: Professional/management responsibilities by level
- **Checklists**: Transition criteria for stage handoffs

### Tracks

Tracks are pure modifiers—they adjust skill/behaviour expectations without
defining role types. Modifiers use capability names:

```yaml
skillModifiers:
  delivery: 1 # +1 to ALL delivery skills
  scale: -1 # -1 to ALL scale skills
```

### Disciplines

Disciplines define role types and valid tracks:

- `isProfessional: true` — IC roles, uses `professionalResponsibilities`
- `isManagement: true` — Manager roles, uses `managementResponsibilities`
- `validTracks: [...]` — Valid track configurations (`null` = trackless allowed)
- `minGrade: <grade_id>` — Minimum grade (optional)

#### Skill Tiers (T-shaped profiles)

| Tier               | Expected Level    | Purpose                 |
| ------------------ | ----------------- | ----------------------- |
| `coreSkills`       | Highest for grade | Core expertise          |
| `supportingSkills` | Mid-level         | Supporting capabilities |
| `broadSkills`      | Lower level       | General awareness       |

### Stages

Stages define engineering lifecycle phases with:

- **constraints**: Restrictions on behaviour
- **handoffs**: Transitions to other stages with prompts
- **readChecklist/confirmChecklist**: Read-Then-Do and Do-Then-Confirm
  checklists

Checklists are derived at stage transitions by gathering items from relevant
capabilities at the job's skill level.

### Data Validation

Run `npx fit-map validate` to check required fields, referential integrity,
valid enum values, and cross-entity consistency.

## Vocabulary Standards

Standard terms for skill definitions and behaviour maturity levels. Grades and
their mappings vary per installation—use `npx fit-pathway grade --list` to see
available grades.

### Scope Terms

Use these terms for spheres of influence (ascending breadth):

| Term              | Size             | Example Usage                   |
| ----------------- | ---------------- | ------------------------------- |
| **Team**          | 5–15 people      | "within your team"              |
| **Area**          | 2–5 teams        | "across teams in your area"     |
| **Business unit** | 500–5,000 people | "across the business unit"      |
| **Function**      | Major capability | "across the function"           |
| **Organization**  | Enterprise-wide  | "shapes organizational culture" |

### Skill Level Vocabulary

| Level          | Autonomy              | Complexity            | Verbs                                       |
| -------------- | --------------------- | --------------------- | ------------------------------------------- |
| `awareness`    | with guidance         | basic, simple         | understand, follow, use, ask, learn         |
| `foundational` | with minimal guidance | common, familiar      | apply, create, explain, identify            |
| `working`      | independently         | moderate, multiple    | design, own, troubleshoot, decide, document |
| `practitioner` | lead, mentor          | complex, large        | lead, mentor, establish, evaluate           |
| `expert`       | define, shape         | enterprise, strategic | define, shape, innovate, pioneer            |

**Sentence patterns:**

- **Awareness**: "You understand...", "You can use... with guidance"
- **Foundational**: "You apply...", "You create simple..."
- **Working**: "You design... independently", "You make appropriate..."
- **Practitioner**: "You lead... across teams in your area"
- **Expert**: "You define... across the business unit"

### Quick Reference: Scope by Level/Maturity

| Concept               | Use                             | Avoid                          |
| --------------------- | ------------------------------- | ------------------------------ |
| Practitioner (skill)  | "in your area", "across teams"  | "organizational", "enterprise" |
| Expert (skill)        | "across the business unit"      | "organizational"               |
| Role modeling (behav) | "across the function"           | "organizational"               |
| Exemplifying (behav)  | "shapes organizational culture" | —                              |

## Code Style

### JavaScript

- ESM modules only (no CommonJS)
- JSDoc on all public functions (`@param`, `@returns`)
- Pure functions, no side effects
- Descriptive names (`skillLevel`, `behaviourMaturity`)
- Prefix unused params with underscore (`_param`)
- Prefer `const`, use `let` when needed

### File Organization

**Map** (`products/map/src/`): `loader.js`, `validation.js`,
`schema-validation.js`, `index-generator.js`, `levels.js`

**Model** (`libs/libpathway/src/`): `derivation.js`, `modifiers.js`,
`profile.js`, `job.js`, `agent.js`, `checklist.js`, `interview.js`

**Presentation** (`products/pathway/src/`): `formatters/`, `pages/`,
`components/`, `lib/`, `commands/`, `slides/`

**Basecamp** (`products/basecamp/`): `basecamp.js`, `build.js`, `config/`,
`scripts/`, `template/`

**Formatters** (`products/pathway/src/formatters/{entity}/`): `shared.js`,
`dom.js`, `markdown.js`

### Naming

- Files: `kebab-case`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- YAML IDs: `snake_case`

### Testing

- Node.js test runner: `node --test`
- Descriptive test names
- Test fixtures mirror YAML structure
- Test success and edge cases

## Git Workflow

### Conventional Commits

Format: `type(scope): subject`

**Types**: `feat`, `fix`, `refactor`, `docs`, `style`, `test`, `chore`, `perf`

**Scope**: Use package name (`map`, `libpathway`, `pathway`, `basecamp`) or
specific area. Omit if change spans multiple packages.

**Breaking changes**: Add `!` after scope: `refactor(libpathway)!: change API`

### Before Committing

1. Review with `git diff`
2. Group related changes into logical, atomic commits
3. Separate feature/logic changes from formatting changes
4. Run `npm run check` and fix any issues related to your changes
5. Assess version impact for affected packages (see below)
6. Stage and commit: `git commit -m "type(scope): subject"`
7. Push all commits to remote

**Always commit your work before finishing a task.**

### Version Bumps

Assess version impact at each commit:

| Change Type               | Bump  |
| ------------------------- | ----- |
| Breaking API change (`!`) | Major |
| New feature (`feat`)      | Minor |
| Bug fix, refactor, other  | Patch |

**Dependency chain**: `map` → `libpathway` → `pathway`

Find dependents:
`grep -rl "@forwardimpact/{pkg}" products/*/package.json libs/*/package.json`

When releasing a minor or major version, update dependent packages:

1. Bump version in the package's `package.json`
2. Update dependency version in downstream packages (minor/major only)
3. Commit: `chore({package}): bump to {version}`
4. Tag: `git tag {package}@v{version}`
5. Push commits: `git push origin main`
6. Push each tag individually: `git push origin {package}@v{version}`

**Push tags one at a time.** GitHub Actions triggers once per push event, so
`git push --tags` with multiple tags only triggers one workflow run. Push each
tag separately to trigger individual publish workflows.

**Tag at the final commit.** All tags must point to a commit where
`package-lock.json` is consistent with every `package.json`. CI runs `npm ci`,
which fails if the lockfile is out of sync. When releasing multiple packages,
make all version and dependency changes first, then tag them all at the final
commit—not at intermediate commits.

**Verify every publish workflow.** After pushing each tag, run
`gh run list --limit <n>` to confirm all publish workflows succeed. Re-push any
failed tags after fixing the root cause: delete the remote tag
(`git push origin :refs/tags/{tag}`), move it locally
(`git tag -d {tag} && git tag {tag} <commit>`), and push again.

## Common Tasks

> **Data-Driven Application**: All entity IDs (skills, disciplines, tracks,
> grades, behaviours) depend on YAML files in `products/map/examples/`. Use
> `npx fit-pathway <entity> --list` to discover available values.

### NPM Scripts (Root)

| Script              | Purpose                              |
| ------------------- | ------------------------------------ |
| `npm start`         | Build static site and serve it       |
| `npm run dev`       | Run live development server          |
| `npm run check`     | Format, lint, test, SHACL validation |
| `npm run check:fix` | Auto-fix format and lint issues      |
| `npm run test`      | Run unit tests                       |
| `npm run test:e2e`  | Run Playwright E2E tests             |
| `npm run validate`  | Validate data files                  |

### CLI Tools

| CLI            | Purpose                                 |
| -------------- | --------------------------------------- |
| `fit-pathway`  | Web app, entity browsing, agents        |
| `fit-basecamp` | Knowledge base scheduler and management |
| `fit-map`      | Data validation, index generation       |

### Quick Reference

```sh
npx fit-map validate                  # Validate data files
npx fit-pathway dev                   # Start development server
npx fit-pathway build --url=<URL>     # Generate static site + install bundle
npx fit-basecamp --init ~/Documents   # Initialize knowledge base
npx fit-basecamp --daemon             # Run scheduler
```

See each product's skill file for full CLI reference.
