# Extract Reusable Libraries from Pathway

## Goal

Break out reusable UI infrastructure from `products/pathway/` into a new library
so multiple products can share the same web application framework. Clean break —
no backward compatibility.

## Decision: Rename libskill to libskill

**libskill becomes libskill.** The library contains derivation logic for skills,
behaviours, agents, and career progression. The name `libskill` better describes
the domain — it's the skill and role derivation engine.

The architecture becomes: `map` (data) → `libskill` (derivation) → `libui` (UI)
→ `pathway` (product).

## Decision: Create `libui`

One new library: **`@forwardimpact/libui`** — the web UI framework.

Why one library, not four:

- CSS classes are referenced by JS components — they're coupled
- The router is small (~160 lines) — doesn't justify its own package
- The slide system extends the router and uses the components
- Fewer packages = less coordination overhead
- Follows the project's "simple over easy" principle

## What Moves to libui

### CSS Design System

All generic CSS moves. Product-specific CSS stays.

**Moves:**

| File                             | Purpose                    |
| -------------------------------- | -------------------------- |
| `css/tokens.css`                 | Design tokens              |
| `css/reset.css`                  | Browser reset              |
| `css/base.css`                   | Base typography and links  |
| `css/components/layout.css`      | App shell layout           |
| `css/components/surfaces.css`    | Cards, panels              |
| `css/components/typography.css`  | Text styles                |
| `css/components/badges.css`      | Badge styles               |
| `css/components/buttons.css`     | Button styles              |
| `css/components/forms.css`       | Form controls              |
| `css/components/tables.css`      | Table styles               |
| `css/components/progress.css`    | Progress indicators        |
| `css/components/states.css`      | Loading, empty, error      |
| `css/components/nav.css`         | Drawer navigation          |
| `css/components/top-bar.css`     | Top bar layout             |
| `css/components/utilities.css`   | Utility classes            |
| `css/views/slide-base.css`       | Slide layout               |
| `css/views/slide-animations.css` | Slide transitions          |
| `css/views/slide-sections.css`   | Slide content sections     |
| `css/views/slide-tables.css`     | Slide table styles         |
| `css/views/print.css`            | Print styles               |
| `css/views/handout.css`          | Handout overrides          |
| `css/pages/detail.css`           | Detail page (shared style) |

**Stays in Pathway:**

| File                                   | Reason                |
| -------------------------------------- | --------------------- |
| `css/components/command-prompt.css`    | Pathway-specific      |
| `css/components/skill-file-viewer.css` | Pathway-specific      |
| `css/components/file-card.css`         | Pathway-specific      |
| `css/pages/landing.css`                | Pathway-specific page |
| `css/pages/job-builder.css`            | Pathway-specific page |
| `css/pages/agent-builder.css`          | Pathway-specific page |
| `css/pages/interview-builder.css`      | Pathway-specific page |
| `css/pages/self-assessment.css`        | Pathway-specific page |
| `css/pages/assessment-results.css`     | Pathway-specific page |
| `css/pages/progress-builder.css`       | Pathway-specific page |
| `css/pages/lifecycle.css`              | Pathway-specific page |

### JS — Core Utilities

**Moves to libui (generic):**

| File                    | What moves                                                                                         |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `lib/render.js`         | `createElement`, all tag helpers, `fragment`, `getContainer`, `render`, `showLoading`, `showError` |
| `lib/reactive.js`       | `createReactive`, `createComputed`, `bind` (entire file)                                           |
| `lib/state.js`          | Generic store: `subscribe`, `getState`, `getStatePath`, `updateState`, `notifyListeners`           |
| `lib/errors.js`         | `NotFoundError`, `InvalidCombinationError`, `DataLoadError` (entire file)                          |
| `lib/error-boundary.js` | `withErrorBoundary` (refactored to remove component import)                                        |
| `lib/markdown.js`       | `markdownToHtml` (entire file)                                                                     |
| `lib/utils.js`          | `getItemsByIds` (entire file)                                                                      |

**Stays in Pathway (domain-specific):**

| File                     | What stays                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `lib/render.js`          | `formatLevel`, `getSkillProficiencyIndex`, `getBehaviourMaturityIndex` (import from map)                     |
| `lib/state.js`           | `setData`, `setError`, `setFilter`, `getFilters`, `getBranding` — Pathway-specific state shape and accessors |
| `lib/cli-command.js`     | Pathway route-to-CLI mapping                                                                                 |
| `lib/cli-output.js`      | CLI formatting                                                                                               |
| `lib/template-loader.js` | Pathway template loading (fs-based)                                                                          |
| `lib/radar.js`           | Radar chart                                                                                                  |
| `lib/job-cache.js`       | Job caching                                                                                                  |
| `lib/card-mappers.js`    | Pathway entity-to-card mappers                                                                               |

### JS — Routing

All routing moves (it's fully generic):

| File                   | Purpose                        |
| ---------------------- | ------------------------------ |
| `lib/router-core.js`   | Hash-based router factory      |
| `lib/router-pages.js`  | Pages router factory           |
| `lib/router-slides.js` | Slide router with keyboard nav |

### JS — Generic Components

**Moves to libui:**

| File                          | What moves                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| `components/card.js`          | `createCard`, `createStatCard`, `createBadge`, `createTag`                                           |
| `components/grid.js`          | All grid functions (entire file)                                                                     |
| `components/list.js`          | `createSearchBar`, `createCardList`, `createGroupedList`                                             |
| `components/detail.js`        | `createDetailHeader`, `createDetailSection`, `createLinksList`, `createTagsList`, `createDetailItem` |
| `components/nav.js`           | `updateActiveNav`, `createBackLink`, `createBreadcrumbs`                                             |
| `components/error-page.js`    | All error rendering functions (entire file)                                                          |
| `components/form-controls.js` | `createSelectWithValue` (generic select)                                                             |

**Stays in Pathway:**

| File                              | Reason                                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `components/detail.js`            | `createLevelTable`, `createLevelDots`, `createLevelCell`, `createEmptyLevelCell`, `createExpectationsCard` (import from map) |
| `components/form-controls.js`     | `createDisciplineSelect` (domain-specific)                                                                                   |
| `components/top-bar.js`           | Pathway-specific (CLI command display)                                                                                       |
| `components/command-prompt.js`    | Pathway-specific                                                                                                             |
| `components/skill-matrix.js`      | Pathway-specific                                                                                                             |
| `components/behaviour-profile.js` | Pathway-specific                                                                                                             |
| `components/radar-chart.js`       | Pathway-specific                                                                                                             |
| `components/comparison-radar.js`  | Pathway-specific                                                                                                             |
| `components/skill-file-viewer.js` | Pathway-specific                                                                                                             |
| `components/file-card.js`         | Pathway-specific                                                                                                             |
| `components/checklist.js`         | Pathway-specific                                                                                                             |
| `components/modifier-table.js`    | Pathway-specific                                                                                                             |
| `components/progression-table.js` | Pathway-specific                                                                                                             |
| `components/builder.js`           | Pathway-specific                                                                                                             |
| `components/action-buttons.js`    | Pathway-specific                                                                                                             |
| `components/code-display.js`      | Pathway-specific                                                                                                             |

### Browser YAML Loading

**Moves to libui (generic utilities):**

- `loadYamlFile(path)` — fetch + parse YAML
- `tryLoadYamlFile(path)` — fetch + parse, null on 404
- `loadDirIndex(dir)` — load `_index.yaml` file list

**Stays in Pathway (entity-specific loaders):**

- `loadSkillsFromCapabilities()`
- `loadDisciplinesFromDir()`
- `loadTracksFromDir()`
- `loadBehavioursFromDir()`
- `loadCapabilitiesFromDir()`
- `loadQuestionFolder()`
- `loadAllData()`
- `loadAgentDataBrowser()`

### What Does NOT Move

- **Formatters** (`src/formatters/`) — Entirely Pathway-specific
- **Pages** (`src/pages/`) — Entirely Pathway-specific
- **Slides content** (`src/slides/`) — Entity-specific renderers
- **Commands** (`src/commands/`) — CLI commands
- **Templates** (`templates/`) — Mustache templates for agent/skill generation
- **HTML files** — Product-specific app shells (but they serve as examples)
- **CSS bundles** — Products compose their own bundles from libui + local CSS

## Package Structure

```
libraries/libui/
├── package.json
├── src/
│   ├── index.js                # Main exports
│   ├── render.js               # createElement, tag helpers, fragment
│   ├── reactive.js             # Reactive state containers
│   ├── state.js                # Generic state store (pub/sub)
│   ├── errors.js               # Error types
│   ├── error-boundary.js       # Error boundary wrapper
│   ├── router-core.js          # Hash-based router
│   ├── router-pages.js         # Pages router factory
│   ├── router-slides.js        # Slide router + keyboard nav
│   ├── yaml-loader.js          # Browser YAML loading (generic)
│   ├── markdown.js             # Markdown to HTML
│   ├── utils.js                # getItemsByIds
│   ├── components/
│   │   ├── index.js            # Component exports
│   │   ├── card.js             # Card, badge, tag
│   │   ├── grid.js             # Grid layouts
│   │   ├── list.js             # Search, card list, grouped list
│   │   ├── detail.js           # Detail header, section, items
│   │   ├── nav.js              # Navigation helpers
│   │   ├── error-page.js       # Error rendering
│   │   └── form-controls.js    # Generic form controls
│   └── css/
│       ├── tokens.css
│       ├── reset.css
│       ├── base.css
│       ├── components/
│       │   ├── layout.css
│       │   ├── surfaces.css
│       │   ├── typography.css
│       │   ├── badges.css
│       │   ├── buttons.css
│       │   ├── forms.css
│       │   ├── tables.css
│       │   ├── progress.css
│       │   ├── states.css
│       │   ├── nav.css
│       │   ├── top-bar.css
│       │   └── utilities.css
│       ├── views/
│       │   ├── slide-base.css
│       │   ├── slide-animations.css
│       │   ├── slide-sections.css
│       │   ├── slide-tables.css
│       │   ├── print.css
│       │   └── handout.css
│       └── pages/
│           └── detail.css
└── test/
    ├── render.test.js
    ├── router-core.test.js
    ├── reactive.test.js
    └── markdown.test.js
```

## Package Configuration

```json
{
  "name": "@forwardimpact/libui",
  "version": "1.0.0",
  "description": "Web UI framework: rendering, routing, components, and design system",
  "type": "module",
  "main": "src/index.js",
  "exports": {
    ".": "./src/index.js",
    "./render": "./src/render.js",
    "./reactive": "./src/reactive.js",
    "./state": "./src/state.js",
    "./errors": "./src/errors.js",
    "./error-boundary": "./src/error-boundary.js",
    "./router-core": "./src/router-core.js",
    "./router-pages": "./src/router-pages.js",
    "./router-slides": "./src/router-slides.js",
    "./yaml-loader": "./src/yaml-loader.js",
    "./markdown": "./src/markdown.js",
    "./utils": "./src/utils.js",
    "./components": "./src/components/index.js",
    "./components/*": "./src/components/*.js",
    "./css/*": "./src/css/*"
  },
  "engines": { "node": ">=18.0.0" }
}
```

No dependencies — libui is pure browser JS + CSS with zero npm dependencies. The
YAML parser is loaded via CDN ESM import in the browser.

## Refactoring Required

### 1. Split render.js

Current `render.js` mixes generic DOM helpers with domain-specific formatters.

**libui `render.js`** — Pure DOM utilities:

- `createElement`, all tag shorthand functions
- `fragment`, `getContainer`, `render`, `showLoading`, `showError`

**Pathway `lib/format-helpers.js`** (new file) — Domain display helpers:

- `formatLevel` (imports from `@forwardimpact/map/levels`)
- `getSkillProficiencyIndex` (imports from `@forwardimpact/map/levels`)
- `getBehaviourMaturityIndex` (imports from `@forwardimpact/map/levels`)

Pathway files that import `formatLevel` etc. update their imports.

### 2. Split detail.js

**libui `components/detail.js`** — Generic detail components:

- `createDetailHeader`, `createDetailSection`
- `createLinksList`, `createTagsList`, `createDetailItem`

**Pathway `components/detail-levels.js`** (new file) — Domain-specific:

- `createLevelTable`, `createLevelDots`, `createLevelCell`
- `createEmptyLevelCell`, `createExpectationsCard`
- These import from `@forwardimpact/map/levels` and from
  `@forwardimpact/libui/render` for tag helpers

### 3. Split form-controls.js

**libui `components/form-controls.js`** — Generic:

- `createSelectWithValue`

**Pathway `components/form-controls.js`** — Domain-specific:

- `createDisciplineSelect` (imports generic `select`, `option`, `optgroup` from
  libui)

### 4. Genericize state.js

**libui `state.js`** — Generic store:

```javascript
export function createStore(initialState) {
  // pub/sub with getState, getStatePath, updateState, subscribe
}
```

**Pathway `lib/state.js`** — Domain store:

```javascript
import { createStore } from "@forwardimpact/libui/state";

const store = createStore({
  data: { skills: [], behaviours: [], ... },
  ui: { currentRoute: "/", filters: { ... } },
});

export const { getState, getStatePath, updateState, subscribe } = store;
export function setData(data) { ... }
export function getBranding() { ... }
// etc.
```

### 5. Refactor error-boundary.js

Remove the import of `../components/error-page.js`. The error boundary already
supports a `renderErrorFn` option. Make the default rendering inline (simple DOM
creation) instead of importing from a component. The component file moves to
libui separately.

### 6. Update CSS Bundles

Pathway's CSS bundles change from relative imports to libui imports. The dev
server and build command need to serve/copy libui CSS.

**Pathway `css/bundles/app.css`:**

```css
@layer tokens, reset, base, components, utilities, pages;

/* From libui */
@import "/ui/css/tokens.css" layer(tokens);
@import "/ui/css/reset.css" layer(reset);
@import "/ui/css/base.css" layer(base);
@import "/ui/css/components/layout.css" layer(components);
/* ... more libui components ... */

/* Pathway-specific */
@import "../components/command-prompt.css" layer(components);
@import "../components/skill-file-viewer.css" layer(components);
@import "../components/file-card.css" layer(components);
@import "../pages/landing.css" layer(pages);
/* ... more Pathway pages ... */
```

### 7. Update Import Maps

HTML files add libui mappings:

```html
<script type="importmap">
{
  "imports": {
    "@forwardimpact/libui": "/ui/lib/index.js",
    "@forwardimpact/libui/render": "/ui/lib/render.js",
    "@forwardimpact/libui/router-core": "/ui/lib/router-core.js",
    "@forwardimpact/libui/components": "/ui/lib/components/index.js",
    ...
  }
}
</script>
```

### 8. Update Dev Server and Build

**Dev server** (`commands/dev.js`): Add `/ui/lib/` and `/ui/css/` path mappings
pointing to the resolved `@forwardimpact/libui` package.

**Build command** (`commands/build.js`): Copy libui files to `output/ui/lib/`
and `output/ui/css/` alongside existing `map/lib/` and `model/lib/`.

## Implementation Steps

### Phase 1: Create libui (empty shell)

1. Create `libraries/libui/` directory structure
2. Create `package.json` with exports
3. Add to workspace in root `package.json`
4. Add `@forwardimpact/libui` dependency to Pathway's `package.json`
5. Run `npm install` to link

### Phase 2: Extract CSS

1. Move generic CSS files from Pathway to libui
2. Update Pathway CSS bundles to import from libui paths
3. Update dev server to serve `/ui/css/` from libui
4. Update build command to copy libui CSS
5. Verify all three views (app, slides, handouts) render correctly

### Phase 3: Extract core JS

1. Split `render.js` — generic to libui, domain helpers to new Pathway file
2. Move `reactive.js`, `errors.js`, `markdown.js`, `utils.js` to libui
3. Extract generic `state.js` (createStore) to libui, refactor Pathway state
4. Refactor `error-boundary.js` to remove component import, move to libui
5. Move router files to libui
6. Move generic YAML loading functions to libui
7. Update all Pathway imports

### Phase 4: Extract components

1. Split `detail.js` — generic to libui, level components to Pathway
2. Split `form-controls.js` — generic to libui, discipline select to Pathway
3. Move `card.js`, `grid.js`, `list.js`, `nav.js`, `error-page.js` to libui
4. Create `components/index.js` barrel file in libui
5. Update all Pathway component imports

### Phase 5: Update import maps and infrastructure

1. Update HTML import maps in all three HTML files
2. Update dev server path mappings
3. Update build command to copy libui
4. Run `npm run check` and fix any issues
5. Test all three views work correctly

### Phase 6: Tests and cleanup

1. Move relevant tests from Pathway to libui
2. Delete moved files from Pathway (clean break)
3. Run full test suite: `npm run check`
4. Verify: `npm run dev`, `npm run build`

## Dependency Chain After Extraction

```
map (data) ──→ libskill (derivation) ──→ pathway (product)
                                              ↑
              libui (UI framework) ─────────┘
```

libui has no npm dependencies. libui has no dependency on map or libskill.
Pathway depends on all three: map, libskill, libui. Future products depend on:
their own model + libui.
