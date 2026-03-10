---
name: fit-pathway
description: >
  Work with the @forwardimpact/pathway package. Use when exploring roles,
  skills, career progression, or agent profiles via the CLI, or when modifying
  the web app, CLI commands, formatters, pages, or templates.
---

# Pathway Package

Web application, CLI, and formatters for career progression, job definitions,
and agent profile generation. Three audiences use `fit-pathway` differently:

| Audience          | Goal                                                | How they run it                                   |
| ----------------- | --------------------------------------------------- | ------------------------------------------------- |
| **Maintainers**   | Develop and improve `@forwardimpact/pathway` itself | `npx fit-pathway` from the monorepo workspace     |
| **Organizations** | Publish a career framework for their engineers      | `npx fit-pathway build` in a standalone project   |
| **Engineers**     | Explore jobs, skills, and career progression        | `fit-pathway` installed globally on their machine |

## When to Use This Skill

**CLI exploration and discovery:**

- Exploring disciplines, tracks, levels, skills, behaviours, or drivers
- Generating or comparing job definitions across tracks and levels
- Analyzing career progression between levels
- Generating AI agent configurations from the framework
- Answering questions about roles, skill expectations, or career paths

**Development and maintenance:**

- Adding or modifying web app pages, CLI commands, or formatters
- Updating agent or skill output templates
- Working with the Mustache template system
- Setting up an organization's career framework project

---

## Discovery Workflows

Common patterns for exploring the framework using the CLI. The CLI is
data-driven — entity IDs depend on the YAML files in the active data directory.
Start with summary commands to discover what's available.

### Discover what roles exist on a track

```sh
# 1. See all tracks and which disciplines use them
npx fit-pathway track

# 2. See jobs filtered to a specific track
npx fit-pathway job --track=forward_deployed

# 3. List all job combinations on that track (for piping)
npx fit-pathway job --list --track=forward_deployed

# 4. View a specific role
npx fit-pathway job software_engineering J060 --track=forward_deployed
```

### Understand a discipline's structure

```sh
# 1. See all disciplines with their type (professional/management) and valid tracks
npx fit-pathway discipline

# 2. Drill into a discipline to see skill tiers and behaviour modifiers
npx fit-pathway discipline software_engineering

# 3. Compare the same discipline across tracks
npx fit-pathway job software_engineering J060 --track=platform
npx fit-pathway job software_engineering J060 --track=forward_deployed
```

### Explore career progression

```sh
# 1. See what changes between levels
npx fit-pathway progress software_engineering J060 --track=forward_deployed

# 2. Compare specific levels
npx fit-pathway progress software_engineering J060 --track=forward_deployed --compare=J100
```

### Discover what a track modifies

```sh
# 1. View track detail to see all skill and behaviour modifiers
npx fit-pathway track forward_deployed

# 2. Compare the resulting skill matrices side by side
npx fit-pathway job software_engineering J060 --skills
npx fit-pathway job software_engineering J060 --track=forward_deployed --skills
```

---

## CLI Reference

### Entity Browsing

All entity commands support three modes:

| Mode    | Pattern                        | Description                 |
| ------- | ------------------------------ | --------------------------- |
| Summary | `npx fit-pathway <command>`    | Concise overview with stats |
| List    | `npx fit-pathway <cmd> --list` | IDs for piping              |
| Detail  | `npx fit-pathway <cmd> <id>`   | Full entity details         |

Entity commands: `discipline`, `level`, `track`, `behaviour`, `driver`, `stage`,
`skill`, `tool`.

### Job Generation

```sh
npx fit-pathway job                                       # Summary with stats
npx fit-pathway job --track=<track>                       # Summary filtered by track
npx fit-pathway job --list                                # Valid combinations
npx fit-pathway job --list --track=<track>                # Combinations for a track
npx fit-pathway job <discipline> <level>                  # Trackless job
npx fit-pathway job <discipline> <level> --track=<track>  # With track
npx fit-pathway job <discipline> <level> --checklist=code # With checklist
npx fit-pathway job <discipline> <level> --skills         # Skill IDs only
npx fit-pathway job <discipline> <level> --tools          # Tool names only
```

### Agent Generation

```sh
npx fit-pathway agent --list                                        # Valid combinations
npx fit-pathway agent <discipline> --track=<track>                  # Preview
npx fit-pathway agent <discipline> --track=<track> --output=./agents # Write files
npx fit-pathway agent <discipline> --track=<track> --stage=plan     # Single stage
npx fit-pathway agent <discipline> --track=<track> --skills         # Skill IDs only
npx fit-pathway agent <discipline> --track=<track> --tools          # Tool names only
```

### Interview & Progression

```sh
npx fit-pathway interview <discipline> <level>
npx fit-pathway interview <d> <l> --track=<t> --type=mission
npx fit-pathway progress <discipline> <level>
npx fit-pathway progress <d> <l> --compare=<to_level>
npx fit-pathway questions --level=practitioner
npx fit-pathway questions --skill=<id> --format=yaml
```

### Skill Detail

```sh
npx fit-pathway skill <id>          # Human-readable detail
npx fit-pathway skill <id> --agent  # Output as agent SKILL.md format
```

### Agent Output Paths

- Agent profiles: `.github/agents/{id}.agent.md` (VS Code Custom Agents)
- Skill files: `.claude/skills/{skill-name}/SKILL.md` (Agent Skills Standard)
- Templates: `products/pathway/templates/`

---

## Data Resolution

The CLI resolves data in this order:

1. `--data=<path>` flag (explicit)
2. `PATHWAY_DATA` environment variable
3. `~/.fit/pathway/data/` (engineer install)
4. `./data/pathway/` (monorepo primary)
5. `./examples/pathway/` (monorepo fallback)
6. `./data/` (organization project)
7. `./examples/` (standalone fallback)

---

## Developing Pathway

### Package Structure

```
products/pathway/
  bin/
    fit-pathway.js    # CLI entry point, arg parsing, help text, command dispatch
  src/
    commands/         # CLI command handlers (one per entity/feature)
    formatters/       # Entity → output (DOM/markdown), grouped by entity
    pages/            # Web app page handlers
    components/       # Reusable UI components (pathway-specific)
    lib/              # Shared utilities (cli-output, template-loader)
    slides/           # Slide presentation handlers
  templates/          # Mustache templates for agent/skill/install output
```

### Formatter Layer

All presentation logic lives in formatters. Pages and commands pass raw entities
— no transforms in views.

```
src/formatters/{entity}/
  shared.js    # Helpers shared between outputs
  dom.js       # Entity → DOM elements (web app)
  markdown.js  # Entity → markdown string (CLI)
```

### CLI Command Pattern

Commands export an async handler. Entity commands use `createEntityCommand` from
`command-factory.js`. Composite commands (job, interview, progress) use
`createCompositeCommand`.

```javascript
// Entity command (discipline, track, skill, etc.)
export const runFooCommand = createEntityCommand({
  entityName: "foo",
  pluralName: "foos",
  findEntity: (data, id) => data.foos.find((f) => f.id === id),
  presentDetail: (entity, data, options) => ({ /* view */ }),
  formatSummary: (items, data) => { /* console output */ },
  formatDetail: (view, framework) => { /* console output */ },
  formatListItem: (item) => `${item.id}, ${item.name}`,
});
```

### Page Structure

Pages export a `render` function and optionally a `cleanup`:

```javascript
export function render(container, params) {
  // render page content using libui helpers
}

export function cleanup() {
  // cleanup subscriptions
}
```

### CSS

Pathway uses the libui CSS design system. See the **libui** skill for layer
order, design tokens, file conventions, and naming rules. Pathway adds
product-specific styles in `css/pages/` and `css/views/`.

### Adding a New Command

1. Create `src/commands/{command}.js`
2. Export async handler function
3. Register in command dispatch (`bin/fit-pathway.js`)
4. Add help text in `HELP_TEXT` constant

### Adding a New Page

1. Create `src/pages/{page}.js`
2. Export `render(container, params)` and optionally `cleanup()`
3. Register route in `src/lib/router.js`
4. Use formatters from `src/formatters/` for presentation

## Verification

```sh
npm run test        # Unit tests
npm run test:e2e    # Playwright E2E tests
npm run check       # Full check (format, lint, test)
```
