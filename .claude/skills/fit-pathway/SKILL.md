---
name: fit-pathway
description: Work with the @forwardimpact/pathway package. Use when modifying the web app, CLI commands, formatters, pages, components, CSS, or agent/skill output templates.
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

- Adding or modifying web app pages, CLI commands, or formatters
- Working with UI components, reactive state, or CSS
- Updating agent or skill output templates
- Setting up an organization's career framework project
- Understanding the engineer install flow

---

## Audience: Maintainers

Maintainers work inside the `@forwardimpact/pathway` monorepo. Their goal is to
develop the package so organizations can use it.

### Running from the Workspace

The monorepo has `products/map/examples/` data. The CLI resolves data
automatically (see Data Resolution below).

```sh
npx fit-pathway dev                # Start dev server at http://localhost:3000
npx fit-pathway dev --port=8080    # Custom port
npx fit-pathway build              # Generate static site to ./public/
npx fit-pathway build --url=https://pathway.myorg.com  # With distribution bundle
```

### Package Structure

```
products/pathway/
  bin/
    fit-pathway.js    # CLI entry point
  src/
    commands/         # CLI command handlers
    formatters/       # Entity → output (DOM/markdown)
    pages/            # Web app page handlers
    components/       # Reusable UI components
    lib/              # Shared utilities (router, state, render)
    css/              # Styles (layers, tokens, components)
    slides/           # Slide presentation handlers
  templates/          # Mustache templates for agent/skill/install output
```

---

## Audience: Organizations

Organizations maintain a standalone project that depends on
`@forwardimpact/pathway`. They define YAML data unique to their engineering
culture and publish a static site for their engineers.

### Setting Up a New Organization Project

```sh
mkdir my-pathway && cd my-pathway
npm init -y
npm install @forwardimpact/pathway

# Scaffold example data into ./data/
npx fit-pathway init

# Edit data files to match your organization
# data/framework.yaml — title, icon, distribution.siteUrl
# data/disciplines/   — your engineering disciplines
# data/grades.yaml    — your career levels
# ...
```

### Validating and Previewing

```sh
npx fit-pathway dev        # Preview the web app locally
npx fit-map validate       # Validate data integrity
```

### Publishing for Engineers

The `build` command generates a static site. When a `--url` is provided (or
`distribution.siteUrl` is set in `framework.yaml`), it also produces:

- **`bundle.tar.gz`** — A minimal package with `package.json` + `data/` for
  engineers to install locally
- **`install.sh`** — A curl-pipe-bash script that downloads the bundle and sets
  up global access

```sh
npx fit-pathway build --url=https://pathway.myorg.com
# Output: ./public/ (static site, bundle.tar.gz, install.sh)

# Deploy ./public/ to your hosting (GitHub Pages, S3, etc.)
```

Once deployed, engineers install with a single command:

```sh
curl -fsSL https://pathway.myorg.com/install.sh | bash
```

---

## Audience: Engineers

Engineers install `fit-pathway` locally to explore their organization's career
framework from the terminal. They don't need the source code or the monorepo.

### Installing

The organization publishes an install script at their Pathway site URL:

```sh
curl -fsSL https://pathway.myorg.com/install.sh | bash
```

This installs `@forwardimpact/pathway` globally via `npm install -g` and
downloads the organization's data to `~/.fit/pathway/data/`.

### Updating

```sh
fit-pathway update                         # Re-download latest bundle
fit-pathway update --url=https://...       # Override site URL
```

### Exploring

```sh
fit-pathway skill --list                   # List all skill IDs
fit-pathway skill architecture_design      # Skill detail
fit-pathway job --list                     # Valid job combinations
fit-pathway job software_engineering L4 --track=platform
fit-pathway agent software_engineering --track=platform
fit-pathway progress software_engineering L3 --track=platform
```

---

## Data Resolution

The CLI resolves data in this order:

1. `--data=<path>` flag (explicit)
2. `PATHWAY_DATA` environment variable
3. `~/.fit/pathway/data/` (engineer install)
4. `./data/` (organization project)
5. `./examples/` (standalone examples)
6. `products/map/examples/` (monorepo development)

---

## CLI Reference

### Entity Browsing

All entity commands support three modes:

| Mode    | Pattern                        | Description                 |
| ------- | ------------------------------ | --------------------------- |
| Summary | `npx fit-pathway <command>`    | Concise overview with stats |
| List    | `npx fit-pathway <cmd> --list` | IDs for piping              |
| Detail  | `npx fit-pathway <cmd> <id>`   | Full entity details         |

### Job Generation

```sh
npx fit-pathway job --list                                # Valid combinations
npx fit-pathway job <discipline> <grade>                  # Trackless job
npx fit-pathway job <discipline> <grade> --track=<track>  # With track
npx fit-pathway job <discipline> <grade> --checklist=code # With checklist
npx fit-pathway job <discipline> <grade> --skills         # Skill IDs only
npx fit-pathway job <discipline> <grade> --tools          # Tool names only
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
npx fit-pathway interview <discipline> <grade>
npx fit-pathway interview <d> <g> --track=<t> --type=mission
npx fit-pathway progress <discipline> <grade>
npx fit-pathway progress <d> <g> --compare=<to_grade>
npx fit-pathway questions --level=practitioner
npx fit-pathway questions --skill=<id> --format=yaml
```

### Agent Output Paths

- Agent profiles: `.github/agents/{id}.agent.md` (VS Code Custom Agents)
- Skill files: `.claude/skills/{skill-name}/SKILL.md` (Agent Skills Standard)
- Templates: `products/pathway/templates/`

---

## Formatter Layer

All presentation logic lives in formatters. Pages and commands pass raw
entities—no transforms in views.

```
src/formatters/{entity}/
  shared.js    # Helpers shared between outputs
  dom.js       # Entity → DOM elements
  markdown.js  # Entity → markdown string
```

## DOM Rendering

Never use innerHTML. Use render helpers:

```javascript
import { div, h2, p, ul, li, render } from "../lib/render.js";

render(
  container,
  div({ class: "skills" }, h2("Skills"), ul(skills.map((s) => li(s.name)))),
);
```

## Reactive State

Use `createReactive` for component-local state:

```javascript
import { createReactive } from "../lib/reactive.js";

const selectedGrade = createReactive(null);
selectedGrade.subscribe((grade) => updateDisplay(grade));
```

## Page Structure

Pages export a `render` function and optionally a `cleanup`:

```javascript
export function render(container, params) {
  // render page content
}

export function cleanup() {
  // cleanup subscriptions
}
```

## CLI Command Pattern

Commands in `src/commands/`:

```javascript
export function execute(data, args) {
  if (args.list) return formatSkillList(data.skills);
  if (args.id) return formatSkillDetail(data.skills, args.id);
  return formatSkillSummary(data.skills);
}
```

## Job Caching

Always use the cache for job derivation in pages:

```javascript
import { getOrCreateJob } from "@forwardimpact/libpathway/job-cache";
const job = getOrCreateJob({ discipline, grade, track, skills, behaviours });
```

## Error Handling

Router wraps all pages with error boundary. Pages throw:

- `NotFoundError` — Entity not found
- `InvalidCombinationError` — Invalid discipline/track/grade combination

## CSS Architecture

### Layer Order

```
tokens → reset → base → components → utilities → pages → slides → handout → print
```

| Layer        | Purpose                               | Files                          |
| ------------ | ------------------------------------- | ------------------------------ |
| `tokens`     | Design tokens (CSS custom properties) | `css/tokens.css`               |
| `reset`      | Browser normalization                 | `css/reset.css`                |
| `base`       | Typography, body defaults             | `css/base.css`                 |
| `components` | Reusable UI components                | `css/components/*.css`         |
| `utilities`  | Spacing, layout helpers               | `css/components/utilities.css` |
| `pages`      | Page-specific styles                  | `css/pages/*.css`              |
| `slides`     | Slide view styles                     | `css/views/slide-*.css`        |
| `handout`    | Handout view overrides                | `css/views/handout.css`        |
| `print`      | Print media queries                   | `css/views/print.css`          |

### Design Tokens

All values from `css/tokens.css`—never use hardcoded values:

```css
.card {
  padding: var(--space-md);
  background: var(--color-surface);
}
```

### File Conventions

Every CSS file starts with a JSDoc-style comment and wraps styles in the
appropriate `@layer`:

```css
/**
 * Component Name
 *
 * Brief description.
 */
@layer components {
  .my-component { /* styles */ }
}
```

Aim for files under 300 lines. Split by concern if larger.

### Adding New Styles

- **Component**: `css/components/{name}.css` → `@layer components`
- **Page**: `css/pages/{name}.css` → `@layer pages`
- **Slide**: `css/views/slide-*.css` → `@layer slides`
- **Print**: `css/views/print.css` → `@layer print`

### CSS Class Names

Use BEM-style naming: `.card`, `.card__header`, `.card--highlighted`

### Consolidation Rules

- **Badges** → All badge variants in `badges.css`
- **Labels** → Single `.label` definition in `typography.css`
- **Level dots** → All level indicators in `progress.css`
- **Tables** → All table variants in `tables.css`
- **Animations** → All `@keyframes` in `slide-animations.css`

## Common Tasks

### Adding a New Page

1. Create page in `src/pages/{page}.js`
2. Export `render(container, params)` and optionally `cleanup()`
3. Register route in `src/lib/router.js`
4. Use formatters from `src/formatters/` for presentation

### Adding a New Command

1. Create command in `src/commands/{command}.js`
2. Export `execute(data, args)` returning output string
3. Register in `src/commands/index.js`
4. Add help text in CLI entry point

## Verification

```sh
npm run test        # Unit tests
npm run test:e2e    # Playwright E2E tests
npm run check       # Full check (format, lint, test)
```
