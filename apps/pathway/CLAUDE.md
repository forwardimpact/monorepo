# Pathway Package

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

`npx fit-pathway <command>`

| Command     | Purpose                    |
| ----------- | -------------------------- |
| `dev`       | Start web server           |
| `build`     | Generate static site       |
| `init`      | Create data directory      |
| `skill`     | Browse skills              |
| `behaviour` | Browse behaviours          |
| `job`       | Generate job definitions   |
| `agent`     | Generate agent profiles    |
| `interview` | Generate interview sets    |
| `progress`  | Analyze career progression |
| `questions` | Browse interview questions |

## Formatter Layer

Single place for presentation logic:

```
src/formatters/{entity}/
  shared.js    # Helpers shared between outputs
  dom.js       # Entity → DOM elements
  markdown.js  # Entity → markdown string
```

**Rule**: Pages/commands pass raw entities to formatters—no transforms in views.

## Code Style

### Formatter Organization

```
src/formatters/{entity}/
  shared.js    # Helpers used by both DOM and markdown
  dom.js       # Entity → DOM elements
  markdown.js  # Entity → markdown string
```

**Rule**: All presentation logic lives in formatters. Pages and commands pass
raw entities—no transforms in views.

### Component Pattern

Reusable UI components in `src/components/`:

```javascript
/**
 * Create a skill card component
 * @param {Skill} skill - The skill to display
 * @param {Object} options - Display options
 * @returns {HTMLElement}
 */
export function createSkillCard(skill, options = {}) {
  return article(
    { class: "card skill-card" },
    header({ class: "card__header" }, h3(skill.name)),
    div({ class: "card__body" }, p(skill.description)),
  );
}
```

### Reactive State

Use `createReactive` for component-local state:

```javascript
import { createReactive } from "../lib/reactive.js";

const selectedGrade = createReactive(null);
selectedGrade.subscribe((grade) => updateDisplay(grade));
```

### DOM Rendering

Never use innerHTML. Use render helpers:

```javascript
import { div, h2, p, ul, li, render } from "../lib/render.js";

render(
  container,
  div({ class: "skills" }, h2("Skills"), ul(skills.map((s) => li(s.name)))),
);
```

### Page Structure

Pages export a `render` function and optionally a `cleanup`:

```javascript
/**
 * Render the skill detail page
 * @param {HTMLElement} container - Target container
 * @param {Object} params - Route parameters
 */
export function render(container, params) {
  // ... render page content
}

export function cleanup() {
  // ... cleanup subscriptions
}
```

### CLI Command Pattern

Commands in `src/commands/`:

```javascript
/**
 * Execute the skill command
 * @param {Object} data - Loaded data
 * @param {Object} args - Command arguments
 * @returns {string} Output
 */
export function execute(data, args) {
  if (args.list) return formatSkillList(data.skills);
  if (args.id) return formatSkillDetail(data.skills, args.id);
  return formatSkillSummary(data.skills);
}
```

### CSS Class Names

Use BEM-style naming:

```css
.card {
}
.card__header {
}
.card__body {
}
.card--highlighted {
}
```

## CSS Architecture

### Layer Order

The application uses CSS `@layer` for predictable cascade control. Layers are
declared in order of increasing specificity:

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

All CSS files live under `apps/pathway/src/css/`.

### CSS Directory Structure

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

### Bundle Files

Each HTML file imports a single bundle. Bundles declare layer order and import
all required CSS files:

- **app.css** → `index.html` (web application)
- **slides.css** → `slides.html` (slide presentation view)
- **handout.css** → `handout.html` (printable handout view)

### CSS File Conventions

Every CSS file starts with a JSDoc-style comment:

```css
/**
 * Component Name
 *
 * Brief description of what styles this file contains.
 */
```

All styles must be wrapped in the appropriate `@layer`:

```css
@layer components {
  .my-component {
    /* styles */
  }
}
```

File size target: under 300 lines. If a file grows larger, consider splitting by
concern.

### Adding New Styles

**New Component:**

1. Create `css/components/{component}.css`
2. Wrap in `@layer components { ... }`
3. Add `@import` to `css/bundles/app.css`

**New Page:**

1. Create `css/pages/{page}.css`
2. Wrap in `@layer pages { ... }`
3. Add `@import` to `css/bundles/app.css`

**Slide-Specific Styles:**

1. Add to appropriate file in `css/views/slide-*.css`
2. Use `@layer slides { ... }`

**Print Styles:**

1. Add to `css/views/print.css`
2. Use `@layer print { @media print { ... } }`

### Design Tokens

All colors, spacing, and typography values come from `css/tokens.css`. Never use
hardcoded values—always reference tokens:

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

### Consolidation Rules

To prevent duplication:

1. **Badges** → All badge variants in `badges.css` (level-badge, modifier, tag)
2. **Labels** → Single `.label` definition in `typography.css`
3. **Level dots** → All level indicators in `progress.css`
4. **Tables** → All table variants in `tables.css`
5. **Animations** → All `@keyframes` in `slide-animations.css`

## Key Patterns

### Builder Pages

For discipline/grade/track selection:

```javascript
import { createBuilder } from "../components/builder.js";
```

### Global State

Shared data across pages:

```javascript
import { getState, setData, subscribe } from "./lib/state.js";
```

### Job Caching

Always use the cache for job derivation in pages:

```javascript
import { getOrCreateJob } from "@forwardimpact/model/job-cache";
const job = getOrCreateJob({ discipline, grade, track, skills, behaviours });
```

### Error Handling

Router wraps all pages with error boundary. Pages throw:

- `NotFoundError` — Entity not found
- `InvalidCombinationError` — Invalid discipline/track/grade combination

### Agent Output

Agent profiles: `.github/agents/{id}.agent.md` (VS Code Custom Agents)

Skill files: `.claude/skills/{skill-name}/SKILL.md` (Agent Skills Standard)

See templates in `templates/` directory.

## Tasks

### Web App

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
# Browse skills
npx fit-pathway skill
npx fit-pathway skill --list
npx fit-pathway skill <skill_id>

# Browse tools (aggregated from skills)
npx fit-pathway tool
npx fit-pathway tool <tool_name>
```

### Job Generation

```sh
npx fit-pathway job --list                              # Valid combinations
npx fit-pathway job <discipline> <grade>                # Trackless job
npx fit-pathway job <discipline> <grade> --track=<track>
npx fit-pathway job <discipline> <grade> --checklist=code
```

### Agent Generation

```sh
npx fit-pathway agent --list                            # Valid combinations
npx fit-pathway agent <discipline>                      # Preview
npx fit-pathway agent <discipline> --track=<track>
npx fit-pathway agent <discipline> --track=<track> --output=./agents
npx fit-pathway agent <discipline> --track=<track> --all-stages
```

### Interview Preparation

```sh
npx fit-pathway interview <discipline> <grade>
npx fit-pathway interview <discipline> <grade> --track=<track>
npx fit-pathway interview <discipline> <grade> --type=short
```

### Career Progression

```sh
npx fit-pathway progress <discipline> <grade>
npx fit-pathway progress <discipline> <from_grade> --compare=<to_grade>
```

### Questions

```sh
npx fit-pathway questions
npx fit-pathway questions --level=practitioner
npx fit-pathway questions --skill=<skill_id>
npx fit-pathway questions --stats
```

### Adding New Pages

1. Create page in `src/pages/{page}.js`
2. Export `render(container, params)` and optionally `cleanup()`
3. Register route in `src/lib/router.js`
4. Use formatters from `src/formatters/` for presentation

### Adding New Commands

1. Create command in `src/commands/{command}.js`
2. Export `execute(data, args)` returning output string
3. Register in `src/commands/index.js`
4. Add help text in CLI entry point
