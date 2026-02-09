---
name: fit-pathway
description: Work with the @forwardimpact/pathway package. Use when modifying the web app, CLI commands, formatters, pages, components, CSS, or agent/skill output templates.
---

# Pathway Package

Web application, CLI, and formatters for career progression, job definitions,
and agent profile generation.

## When to Use

- Adding or modifying web app pages
- Adding or modifying CLI commands
- Changing entity formatters (DOM or markdown output)
- Working with UI components or reactive state
- Modifying CSS styles or design tokens
- Updating agent or skill output templates
- Running the development server or building the static site

## Package Structure

```
apps/pathway/
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
  templates/          # Mustache templates for agent/skill output
```

## CLI

```sh
npx fit-pathway dev                # Start at http://localhost:3000
npx fit-pathway dev --port=8080    # Custom port
npx fit-pathway build              # Generate static site to ./public/
```

### Entity Browsing

| Mode    | Pattern                        | Description                 |
| ------- | ------------------------------ | --------------------------- |
| Summary | `npx fit-pathway <command>`    | Concise overview with stats |
| List    | `npx fit-pathway <cmd> --list` | IDs for piping              |
| Detail  | `npx fit-pathway <cmd> <id>`   | Full entity details         |

```sh
npx fit-pathway skill --list
npx fit-pathway tool <tool_name>
```

### Job Generation

```sh
npx fit-pathway job --list                                # Valid combinations
npx fit-pathway job <discipline> <grade>                  # Trackless job
npx fit-pathway job <discipline> <grade> --track=<track>  # With track
npx fit-pathway job <discipline> <grade> --checklist=code # With checklist
```

### Agent Generation

```sh
npx fit-pathway agent --list                                        # Valid combinations
npx fit-pathway agent <discipline> --track=<track>                  # Preview
npx fit-pathway agent <discipline> --track=<track> --output=./agents # Write files
npx fit-pathway agent <discipline> --track=<track> --all-stages     # All stages
```

### Interview & Progression

```sh
npx fit-pathway interview <discipline> <grade>
npx fit-pathway progress <discipline> <grade>
npx fit-pathway questions --level=practitioner
```

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
import { getOrCreateJob } from "@forwardimpact/model/job-cache";
const job = getOrCreateJob({ discipline, grade, track, skills, behaviours });
```

## Error Handling

Router wraps all pages with error boundary. Pages throw:

- `NotFoundError` — Entity not found
- `InvalidCombinationError` — Invalid discipline/track/grade combination

## Agent Output

- Agent profiles: `.github/agents/{id}.agent.md` (VS Code Custom Agents)
- Skill files: `.claude/skills/{skill-name}/SKILL.md` (Agent Skills Standard)
- Templates: `apps/pathway/templates/`

## CSS Architecture

### Layer Order

Layers declared in order of increasing specificity:

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

### Directory Structure

```
apps/pathway/src/css/
├── tokens.css          # Design tokens (colors, spacing, typography)
├── reset.css           # Browser reset
├── base.css            # Base typography and links
├── components/         # Reusable components
│   ├── layout.css      # Stack, flex, grid utilities
│   ├── surfaces.css    # Cards, sections, page headers
│   ├── typography.css  # Labels, text utilities
│   ├── badges.css      # All badge variants
│   ├── buttons.css     # Button styles
│   ├── forms.css       # Form inputs, selects
│   ├── tables.css      # Table variants
│   ├── progress.css    # Level dots, progress bars
│   ├── nav.css         # Navigation component
│   ├── states.css      # Loading, error, empty states
│   └── utilities.css   # Margin utilities
├── pages/              # Page-specific styles
├── views/              # View-specific styles (slides, print)
└── bundles/            # Entry points for HTML files
    ├── app.css         # Main web app (index.html)
    ├── slides.css      # Slide view (slides.html)
    └── handout.css     # Handout view (handout.html)
```

### Design Tokens

All values from `css/tokens.css`—never use hardcoded values:

```css
/* Good */
.card {
  padding: var(--space-md);
  background: var(--color-surface);
}

/* Bad */
.card {
  padding: 16px;
  background: #ffffff;
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

Use BEM-style naming:

```css
.card { }
.card__header { }
.card__body { }
.card--highlighted { }
```

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
